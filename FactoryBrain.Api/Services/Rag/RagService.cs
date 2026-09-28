using FactoryBrain.Api.Data;
using FactoryBrain.Api.Domain.Entities;
using FactoryBrain.Api.Dtos.Ask;
using FactoryBrain.Api.Dtos.Rag;
using FactoryBrain.Api.Configuration;
using FactoryBrain.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
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
    private readonly IOptions<RagConfig> _ragCfg;

    public RagService(
        FactoryBrainDbContext db,
        TextChunker chunker,
        IEmbeddingService embed,
        HybridScorer scorer,
        EmbeddingColumnAdmin admin,
        EmbeddingProviderResolver resolver,
        ILogger<RagService> log,
        IOptions<RagConfig> ragCfg)
    {
        _db = db; _chunker = chunker; _embed = embed; _scorer = scorer;
        _admin = admin; _resolver = resolver; _log = log; _ragCfg = ragCfg;
    }

    public async Task<List<DocumentChunk>> ChunkAsync(
        string docId, string title, string body, IEnumerable<string> tags,
        string department, string category, CancellationToken ct = default)
    {
        await Task.Yield(); // yield to scheduler; the body is CPU-bound embedding work
        var tagList = tags.ToList();
        var pieces = _chunker.SplitWithTitle(body, title);
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

        var cfg = _ragCfg.Value;

        // Step 47: read provider-mix weights from RagConfig, with an env-var
        // override that an operator can flip in Development without a
        // restart (EnvReloader re-reads RAG_HYBRID_* on every probe tick).
        // The env vars take precedence over the appsettings defaults.
        bool degraded = _resolver.IsDegraded;
        double providerBm25W = degraded ? cfg.LocalBm25Weight : cfg.HostedBm25Weight;
        double providerVecW  = degraded ? cfg.LocalVectorWeight : cfg.HostedVectorWeight;
        var envBm25 = TryReadDouble("RAG_HYBRID_BM25_WEIGHT");
        var envVec  = TryReadDouble("RAG_HYBRID_VECTOR_WEIGHT");
        if (envBm25 is not null) providerBm25W = envBm25.Value;
        if (envVec  is not null) providerVecW  = envVec.Value;

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

        // Step 47: synonym expansion. The expanded query is what we feed to
        // the scorer, so a query like `needle breakage` matches chunks that
        // only say `সুই ভাঙা`. The expansion is logged at debug level so
        // operators can see what the scorer is actually scoring against.
        var effectiveQuery = RagSynonyms.ApplyToQuery(query);
        if (!string.Equals(effectiveQuery, query, StringComparison.Ordinal))
            _log.LogDebug("RagSynonyms expanded query: {Original} -> {Expanded}", query, effectiveQuery);

        var (qBm25, qTf) = _scorer.TermFreq(effectiveQuery);

        // Term sets for the two overlap checks we do below:
        //   * qTf          — expanded-query tokens (used by BM25 scoring)
        //   * originalTf   — tokens from the user's *original* query. The
        //                     "at least one original-token overlap" gate
        //                     is what protects us from synonym-only matches:
        //                     a query like "zzqx purple volcano tax" has
        //                     no overlap with any real chunk because none
        //                     of its terms are real keys (the synonym
        //                     expansion doesn't add anything either since
        //                     none of the tokens are in RagSynonyms.Map).
        var originalTf = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var tok in HybridScorer.TokenizeForTest(query))
            originalTf.Add(tok);

        // Pre-lowercase chunk text once for the overlap boost (the scorer
        // already lower-cases, but TermFreq's tf is case-insensitive, while
        // the literal overlap check below is not — keep them aligned).
        var chunkTextLower = chunks.ToDictionary(c => c.Id, c => c.Text.ToLowerInvariant());

        var ranked = chunks.Select(c =>
        {
            // Null embedding = chunk was ingested in degraded mode or its
            // embed call failed mid-batch. The dense score is skipped for
            // these rows; BM25 + the term-overlap boost still rank them so
            // the user-visible hit list stays useful until reindex fills
            // them in.
            float[]? cVec = c.Embedding is null
                ? null
                : (float[])c.Embedding.ToArray();
            double cos = 0;
            if (!skipVectorScore && qVec is not null && cVec is not null && cVec.Length == qVec.Length)
            {
                cos = _scorer.Cosine(qVec, cVec);
            }
            var (bm, _) = _scorer.TermFreq(c.Text);
            int overlap = 0;
            int originalOverlap = 0;
            var cText = chunkTextLower[c.Id];
            foreach (var k in qTf.Keys)
                if (cText.Contains(k, StringComparison.Ordinal)) overlap++;
            foreach (var k in originalTf)
                if (cText.Contains(k, StringComparison.Ordinal)) originalOverlap++;
            double bm25Combined = (bm + 0.1 * overlap) / 1.1;
            // Use the *provider-mix* BM25 weight for the hybrid combine.
            // Caller-provided bm25Weight is retained as a legacy fallback
            // for callers that don't yet route through RagConfig.
            double weight = (envBm25 is not null || envVec is not null)
                ? Math.Clamp(providerBm25W, 0, 1)
                : Math.Clamp(providerBm25W, 0, 1);
            if (bm25Weight > 0 && bm25Weight != 0.35) // legacy caller explicitly set a non-default weight
                weight = Math.Clamp(bm25Weight, 0, 1);
            double hybrid = _scorer.Hybrid(bm25Combined, cos, weight);
            return new { c, cos, bm25 = bm25Combined, hybrid, originalOverlap };
        })
        // Step 47 RAG_MIN_SCORE cutoff.
        //
        // In degraded mode the dense score is 0 for every chunk, so the
        // hybrid score collapses to bm25Weight * bm25. If we used the
        // hybrid score here, every chunk would score 0.30 * bm25 — which
        // for the demo seed is below the 0.10 cutoff and the user would
        // get nothing back for a perfectly valid keyword query. Evaluating
        // BM25 alone keeps keyword hits in the answer. (See 47add.txt.)
        .Where(r => degraded
            ? r.bm25 >= cfg.MinScore
            : r.hybrid >= cfg.MinScore)
        // Original-token-overlap gate: a chunk must share at least one
        // token with the user's original query. Synonym expansions are
        // an extra, not a replacement — "zzqx purple volcano tax" must
        // not surface hits just because the expansion adds words that
        // happen to be in the corpus.
        .Where(r => r.originalOverlap >= 1 || originalTf.Count == 0)
        // Honour legacy similarity-threshold parameter alongside MinScore.
        .Where(r => r.hybrid >= similarityThreshold)
        .OrderByDescending(r => r.hybrid)
        .Take(topK > 0 ? topK : cfg.TopK)
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

    private static double? TryReadDouble(string name)
    {
        var raw = Environment.GetEnvironmentVariable(name);
        if (string.IsNullOrWhiteSpace(raw)) return null;
        return double.TryParse(raw,
            System.Globalization.NumberStyles.Float,
            System.Globalization.CultureInfo.InvariantCulture,
            out var d) ? d : null;
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

    /// <summary>
    /// Ingest one document into the RAG index. The body is chunked with
    /// <see cref="TextChunker"/>; each chunk is embedded with the active
    /// configured embedder and stamped with the row's
    /// <c>EmbeddingProvider / Model / Dims</c>.
    ///
    /// <para>
    /// In degraded mode (no hosted key, probe failing, etc.) the chunks
    /// are still stored, but with <c>Embedding = null</c> and
    /// <c>EmbeddingProvider = "pending"</c>. This keeps the corpus
    /// discoverable by BM25 even when no embedder is reachable; the next
    /// non-degraded startup reindex (or POST /api/rag/reindex) walks
    /// these rows via <see cref="EmbeddingColumnAdmin.LoadDocsNeedingReindexAsync"/>
    /// and embeds them. The method returns
    /// <c>embedded = false</c> + a <c>warning</c> string in that case so
    /// the caller knows vectors are pending.
    /// </para>
    /// </summary>
    public async Task<IngestOutcome> IngestAsync(IngestInput input, CancellationToken ct = default)
    {
        var r = _resolver.Resolve();
        var cfg = r.Configured;

        // Chunk with the title bleed so a query that matches the title
        // still surfaces the first chunk. We also let the chunker
        // extend the source-tag list with detected machine-code tags.
        var tagList = _chunker.ExtractTags(input.Title + "\n" + input.Content, input.Tags).ToList();
        var pieces = _chunker.SplitWithTitle(input.Content, input.Title);

        // Department + category inference. The caller (controller /
        // DbInitializer) can override, but in single-content ingest we
        // infer from the body so titles like "QC defect procedure —
        // sewing" still surface in the right bucket.
        var dept = _chunker.InferDepartment(input.Title + " " + input.Content, "general");
        var category = SourceToCategory(input.Source);

        var docId = $"doc-{Guid.NewGuid():N}";
        bool embedded = !r.Degraded;
        string? warning = null;

        var doc = new ManualDocument
        {
            Id = docId,
            TitleEn  = input.Title,
            TitleBn  = input.TitleBn ?? string.Empty,
            Tags     = tagList,
            BodyEn   = input.Content,
            BodyBn   = string.Empty,
            Source   = input.Source,
            Department = dept,
            Category  = category,
            Url       = input.Url,
            IsDemo    = input.IsDemo,
            CreatedAt = DateTime.UtcNow,
            EmbeddingProvider = embedded ? cfg.Provider : "pending",
            EmbeddingModel    = embedded ? cfg.Model    : "pending",
            Dims              = embedded ? cfg.Dims      : 0
        };

        var chunks = new List<DocumentChunk>(pieces.Count);
        for (int i = 0; i < pieces.Count; i++)
        {
            Pgvector.Vector? vec = null;
            if (embedded)
            {
                try
                {
                    vec = _embed.Embed($"{input.Title} {pieces[i]}");
                }
                catch (Exception ex)
                {
                    _resolver.MarkDegraded(
                        $"ingest pre-embed failed on doc={docId} chunk={i + 1} ({cfg.Provider})", ex);
                    embedded = false;
                    warning = "embedding provider became unavailable mid-ingest; chunks stored as pending";
                    doc.EmbeddingProvider = "pending";
                    doc.EmbeddingModel    = "pending";
                    doc.Dims              = 0;
                    vec = null;
                }
            }
            chunks.Add(new DocumentChunk
            {
                Id = $"{docId}::chunk-{i + 1}",
                DocumentId = docId,
                Title = input.Title,
                Department = dept,
                Category = category,
                Tags = tagList,
                Text = pieces[i],
                Ordinal = i,
                Embedding = vec,
                CreatedAt = DateTime.UtcNow
            });
        }

        // When embedding was lost mid-batch we fall back to storing the
        // remaining chunks as null/pending too — same shape the reindex
        // pipeline emits.
        if (!embedded)
        {
            warning ??= "embedding provider unavailable; chunks stored as pending until next reindex";
            doc.EmbeddingProvider = "pending";
            doc.EmbeddingModel    = "pending";
            doc.Dims              = 0;
        }

        doc.Chunks = chunks;
        _db.ManualDocuments.Add(doc);
        await _db.SaveChangesAsync(ct).ConfigureAwait(false);

        return new IngestOutcome(
            docId,
            chunks.Count,
            doc.EmbeddingProvider,
            doc.EmbeddingModel,
            doc.Dims,
            embedded,
            warning);
    }

    public async Task<IReadOnlyList<DocumentListItem>> ListDocumentsAsync(string? source, CancellationToken ct = default)
    {
        var q = _db.ManualDocuments.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(source))
            q = q.Where(d => d.Source == source);
        var rows = await q
            .OrderBy(d => d.CreatedAt)
            .Select(d => new
            {
                d.Id,
                d.TitleEn,
                d.TitleBn,
                d.Source,
                d.Tags,
                d.EmbeddingProvider,
                d.EmbeddingModel,
                d.Dims,
                d.IsDemo,
                d.CreatedAt,
                ChunkCount = d.Chunks.Count
            })
            .ToListAsync(ct).ConfigureAwait(false);

        return rows.Select(r => new DocumentListItem(
            r.Id,
            string.IsNullOrEmpty(r.TitleEn) ? r.TitleBn : r.TitleEn,
            string.IsNullOrEmpty(r.TitleBn) ? null : r.TitleBn,
            r.Source,
            r.Tags ?? new List<string>(),
            r.ChunkCount,
            r.EmbeddingProvider,
            r.EmbeddingModel,
            r.Dims,
            r.IsDemo,
            r.CreatedAt
        )).ToList();
    }

    private static string SourceToCategory(string source) => source switch
    {
        "compliance" => "compliance",
        "sop"        => "sop",
        "faq"        => "policy",
        "manual"     => "manuals",
        _            => "manuals"
    };

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