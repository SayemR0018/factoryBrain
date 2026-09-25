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
    private readonly ILogger<RagService> _log;

    public RagService(
        FactoryBrainDbContext db,
        TextChunker chunker,
        IEmbeddingService embed,
        HybridScorer scorer,
        ILogger<RagService> log)
    {
        _db = db; _chunker = chunker; _embed = embed; _scorer = scorer; _log = log;
    }

    public async Task<List<DocumentChunk>> ChunkAsync(
        string docId, string title, string body, IEnumerable<string> tags,
        string department, string category, CancellationToken ct = default)
    {
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

        var qVec = ((float[])_embed.Embed(query).ToArray());
        var (qBm25, qTf) = _scorer.TermFreq(query);

        var ranked = chunks.Select(c =>
        {
            var cVec = (float[])c.Embedding.ToArray();
            double cos = _scorer.Cosine(qVec, cVec);
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

    public async Task ReindexAsync(CancellationToken ct = default)
    {
        _log.LogInformation("Reindexing RAG corpus…");
        var docs = await _db.ManualDocuments.Include(d => d.Chunks).ToListAsync(ct);
        foreach (var d in docs)
        {
            foreach (var c in d.Chunks)
                c.Embedding = _embed.Embed($"{c.Title} {c.Text}");
        }
        await _db.SaveChangesAsync(ct);
        _log.LogInformation("Reindex complete: {N} docs", docs.Count);
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
