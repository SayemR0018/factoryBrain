using FactoryBrain.Api.Data;
using FactoryBrain.Api.Domain.Entities;
using FactoryBrain.Api.Dtos.Ask;
using FactoryBrain.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Pgvector;

namespace FactoryBrain.Api.Services.Rag;

public sealed class RagService : IRagService
{
    private readonly FactoryBrainDbContext _db;
    private readonly TextChunker _chunker;
    private readonly IEmbeddingService _embed;
    private readonly HybridScorer _scorer;
    private readonly EmbeddingColumnAdmin _admin;
    private readonly EmbeddingProviderResolver _resolver;
    private readonly ILogger<RagService> _log;

    public RagService(
        FactoryBrainDbContext db,
        TextChunker chunker,
        IEmbeddingService embed,
        HybridScorer scorer,
        EmbeddingColumnAdmin admin,
        EmbeddingProviderResolver resolver,
        ILogger<RagService> log)
    {
        _db = db; _chunker = chunker; _embed = embed; _scorer = scorer; _admin = admin; _resolver = resolver; _log = log;
    }

    public async Task<List<DocumentChunk>> ChunkAsync(
        string docId, string title, string body, IEnumerable<string> tags,
        string department, string category, CancellationToken ct = default)
    {
        await Task.Yield(); // yield to scheduler; the body is CPU-bound embedding work
        var tagList = tags.ToList();
        var pieces = _chunker.Split(body);
        var chunks = new List<DocumentChunk>();
        for (int i = 0; i < pieces.Count; i++)
        {
            chunks.Add(new DocumentChunk
            {
                Id = $"{docId}::chunk-{i + 1}",
                DocumentId = docId,
                Title = title,
                Department = department,
                Category = category,
                Tags = tagList,
                Text = pieces[i],
                Ordinal = i,
                Embedding = _embed.Embed($"{title} {pieces[i]}")
            });
        }
        return chunks;
    }

    public async Task<IReadOnlyList<AskRagHit>> RetrieveAsync(
        string query, RagFilter? filter, int topK = 4, double similarityThreshold = 0,
        double bm25Weight = 0.35, CancellationToken ct = default)
    {
        if (string.IsNullOrWhiteSpace(query)) return Array.Empty<AskRagHit>();

        var q = _db.DocumentChunks.AsNoTracking().AsQueryable();
        if (filter is { } f)
        {
            if (f.Department.HasValue) q = q.Where(c => c.Department == MapDept(f.Department.Value));
            if (f.Category.HasValue)   q = q.Where(c => c.Category  == MapCat(f.Category.Value));
        }
        var chunks = await q.ToListAsync(ct);
        if (chunks.Count == 0) return Array.Empty<AskRagHit>();

        // Decide whether to run the vector score at all. We skip it whenever
        // (a) the active embedder is in degraded mode (hosted provider
        // unavailable, Active has fallen back to local), or (b) the query
        // vector's dims don't match the live column dims (would produce a
        // pgvector comparison error). In both cases we rank by BM25 only —
        // the AskController still gets citations, just without a vector
        // score component.
        bool skipVectorScore = _resolver.IsDegraded;
        int? qVecLen = null;
        float[]? qVec = null;
        int? liveDim = null;
        if (!skipVectorScore)
        {
            qVec = ((float[])_embed.Embed(query).ToArray());
            qVecLen = qVec.Length;
            liveDim = _admin.TryProbeLiveColumnDim();
            if (liveDim is null || liveDim.Value != qVecLen.Value)
            {
                _log.LogWarning(
                    "Vector score skipped at query time: active embedder dims={ActiveDims} but live column dim={LiveDim}. Ranking by BM25 only.",
                    qVecLen, liveDim);
                skipVectorScore = true;
            }
        }

        var (qBm25, qTf) = _scorer.TermFreq(query);

        var ranked = chunks.Select(c =>
        {
            var cVec = (float[])c.Embedding.ToArray();
            double cos = 0;
            if (!skipVectorScore && qVec is not null && cVec.Length == qVec.Length)
            {
                cos = _scorer.Cosine(qVec, cVec);
            }
            var (bm, _) = _scorer.TermFreq(c.Text);
            int overlap = 0;
            foreach (var k in qTf.Keys)
                if (c.Text.ToLowerInvariant().Contains(k)) overlap++;
            double bm25Combined = (bm + 0.1 * overlap) / 1.1;
            double hybrid = _scorer.Hybrid(bm25Combined, cos, bm25Weight);
            return new { c, cos, bm25 = bm25Combined, hybrid };
        })
        .Where(r => r.hybrid >= similarityThreshold)
        .OrderByDescending(r => r.hybrid)
        .Take(topK)
        .ToList();

        return ranked.Select(r => new AskRagHit(
            r.c.Id,
            r.c.DocumentId,
            r.c.Title,
            r.c.Department,
            r.c.Category,
            r.c.Tags,
            Math.Round(r.hybrid, 4),
            Math.Round(r.cos, 4),
            Math.Round(r.bm25, 4),
            r.c.Text.Length <= 240 ? r.c.Text : r.c.Text[..240]
        )).ToList();
    }

    /// <summary>
    /// Re-embed every chunk across every <see cref="ManualDocument"/> whose
    /// stored provider / model / dims differ from the active embedder.
    /// Delegates to <see cref="EmbeddingColumnAdmin.ReindexChangedDocsAsync"/>
    /// so the controller, the startup pipeline and this method all share
    /// one reindex implementation.
    /// </summary>
    public async Task<ReindexReport> ReindexAsync(CancellationToken ct = default)
    {
        var outcome = await _admin.ReindexChangedDocsAsync(ct).ConfigureAwait(false);
        return new ReindexReport(
            outcome.Documents,
            outcome.Chunks,
            outcome.Configured.Provider,
            outcome.Configured.Model,
            outcome.Configured.Dims);
    }

    /// <summary>
    /// Decide whether a startup reindex is required — true when the
    /// currently-configured embedder differs from the metadata stored on
    /// any <see cref="ManualDocument"/> row. Returns false in degraded
    /// mode: the actual reindex path is a no-op there, so this method
    /// mirrors that decision.
    /// </summary>
    public async Task<bool> NeedsReindexAsync(CancellationToken ct = default)
    {
        var r = _resolver.Resolve();
        if (r.Degraded) return false;
        var first = await _db.ManualDocuments.AsNoTracking()
            .OrderBy(d => d.Id)
            .Select(d => new { d.EmbeddingProvider, d.EmbeddingModel, d.Dims })
            .FirstOrDefaultAsync(ct);
        if (first is null) return false;
        return first.EmbeddingProvider != r.Configured.Provider
            || first.EmbeddingModel    != r.Configured.Model
            || first.Dims              != r.Configured.Dims;
    }

    private static string MapDept(RagDepartment d) => d switch
    {
        RagDepartment.Sewing    => "sewing",
        RagDepartment.Cutting   => "cutting",
        RagDepartment.Finishing => "finishing",
        RagDepartment.Qc        => "qc",
        _ => "general"
    };

    private static string MapCat(RagCategory c) => c switch
    {
        RagCategory.Manuals    => "manuals",
        RagCategory.Compliance => "compliance",
        RagCategory.Qc         => "qc",
        RagCategory.Policy     => "policy",
        _ => "sop"
    };
}

/// <summary>Result of a reindex run — safe to serialize, never includes the API key.</summary>
public sealed record ReindexReport(int Documents, int Chunks, string Provider, string Model, int Dims);
