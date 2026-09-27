using FactoryBrain.Api.Data;
using FactoryBrain.Api.Services.Interfaces;
using FactoryBrain.Api.Services.Rag;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace FactoryBrain.Api.Controllers;

/// <summary>
/// Admin endpoints for the RAG index.
/// <list type="bullet">
///   <item>
///     <c>POST /api/rag/reindex</c> probes the provider, then runs an
///     atomic resize + reindex cycle. Returns <c>409 Conflict</c> with
///     the canonical error envelope whenever the embedder is in
///     degraded mode OR an embedding call fails mid-batch (the DB is
///     never touched).
///   </item>
///   <item>
///     <c>GET /api/rag/status</c> returns
///     <c>{ configuredProvider, activeProvider, model, dims, storedDims, degraded, lastProbeAt, lastProbeOk, pendingCount }</c>.
///     No key or key fragment is ever exposed. <c>activeProvider</c>
///     always reports <c>"local"</c> when <c>degraded</c> is true.
///   </item>
/// </list>
/// </summary>
[ApiController]
[Route("api/rag")]
public class RagController : ControllerBase
{
    private readonly IRagService _rag;
    private readonly EmbeddingProviderResolver _resolver;
    private readonly EmbeddingColumnAdmin _admin;
    private readonly RagHealthMonitor _monitor;
    private readonly IHttpClientFactory _http;
    private readonly ILoggerFactory _loggerFactory;
    private readonly FactoryBrainDbContext _db;
    private readonly ILogger<RagController> _log;

    public RagController(
        IRagService rag,
        EmbeddingProviderResolver resolver,
        EmbeddingColumnAdmin admin,
        RagHealthMonitor monitor,
        IHttpClientFactory http,
        ILoggerFactory loggerFactory,
        FactoryBrainDbContext db,
        ILogger<RagController> log)
    {
        _rag = rag; _resolver = resolver; _admin = admin;
        _monitor = monitor; _http = http; _loggerFactory = loggerFactory;
        _db = db; _log = log;
    }

    /// <summary>
    /// POST /api/rag/reindex — probes the provider first, then runs the
    /// atomic resize + reindex cycle. Probing right before the reindex
    /// means a key that was set since the last periodic probe is picked
    /// up here.
    ///
    /// In degraded mode the action returns <c>409 Conflict</c> with the
    /// canonical error envelope — stored vectors and the column size are
    /// left untouched. If an embedding call fails mid-batch the same
    /// <c>409</c> is returned and the DB is never written.
    /// </summary>
    [HttpPost("reindex")]
    public async Task<IActionResult> Reindex(CancellationToken ct)
    {
        _log.LogInformation("Manual reindex requested via /api/rag/reindex");

        // Probe first so a newly-set API key (or recovery from a previous
        // failure) is reflected immediately. The health monitor does this
        // on its own interval, but the controller is the user-facing
        // escape hatch — it should not depend on probe timing.
        try
        {
            await _resolver.ProbeAsync(_http, _loggerFactory, ct);
        }
        catch (Exception ex) when (ex is not EmbeddingProviderUnavailableException)
        {
            // Probe is best-effort; a runtime DB error here is logged but
            // the reindex still proceeds if not degraded.
            _log.LogWarning(ex, "Pre-reindex probe threw unexpectedly; continuing.");
        }

        var r = _resolver.Resolve();
        if (_resolver.IsDegraded)
        {
            _log.LogWarning(
                "Reindex request rejected: degraded mode (configuredProvider={ConfiguredProvider} configuredDims={ConfiguredDims}).",
                r.Configured.Provider, r.Configured.Dims);
            return Conflict(new
            {
                error = "EmbeddingProviderUnavailable",
                details = "embedding provider unavailable; reindex skipped"
            });
        }

        try
        {
            var outcome = await _admin.ResizeAndReindexAsync(ct);

            return Ok(new
            {
                reindexed        = outcome.Documents,
                chunks           = outcome.Chunks,
                provider         = outcome.Configured.Provider,
                model            = outcome.Configured.Model,
                dims             = outcome.Configured.Dims,
                columnDimBefore  = outcome.LiveBefore,
                columnDimAfter   = outcome.LiveAfter,
                resized          = outcome.Resized
            });
        }
        catch (EmbeddingProviderUnavailableException ex)
        {
            _log.LogWarning(ex,
                "Reindex aborted before any DB write: embedding provider became unavailable mid-batch. configuredProvider={ConfiguredProvider} configuredDims={ConfiguredDims}.",
                r.Configured.Provider, r.Configured.Dims);
            return Conflict(new
            {
                error = "EmbeddingProviderUnavailable",
                details = "embedding provider unavailable; reindex skipped"
            });
        }
        catch (Exception ex)
        {
            // Database error — never set Degraded, never log the key.
            _log.LogError(ex,
                "Reindex failed mid-transaction; rolled back. configuredProvider={ConfiguredProvider} configuredDims={ConfiguredDims}.",
                r.Configured.Provider, r.Configured.Dims);
            return StatusCode(StatusCodes.Status500InternalServerError, new
            {
                error = "DatabaseError",
                details = ex.Message
            });
        }
    }

    /// <summary>
    /// GET /api/rag/status — shows the active and configured embedder
    /// config plus the most-recent probe state and the number of rows
    /// that would be re-embedded by the next reindex. Never includes
    /// the API key or a key fragment.
    /// </summary>
    [HttpGet("status")]
    public IActionResult Status()
    {
        var r   = _resolver.Resolve();
        var cfg = r.Configured;
        var act = r.Active;
        var isDegraded = _resolver.IsDegraded;
        var activeProviderForStatus = isDegraded ? "local" : act.Provider;
        int storedDims;
        try
        {
            storedDims = _admin.ProbeLiveColumnDim() ?? act.Dims;
        }
        catch
        {
            storedDims = act.Dims;
        }
        int pendingCount = ComputePendingCount(cfg);
        return Ok(new
        {
            configuredProvider = cfg.Provider,
            activeProvider     = activeProviderForStatus,
            model              = act.Model,
            dims               = act.Dims,
            storedDims         = storedDims,
            degraded           = isDegraded,
            lastProbeAt        = _resolver.LastProbeAtUtc,
            lastProbeOk        = _resolver.LastProbeOk,
            pendingCount       = pendingCount
        });
    }

    private int ComputePendingCount(EmbeddingConfig configured)
    {
        if (_resolver.IsDegraded) return 0;
        // Count documents whose stored metadata disagrees with the active
        // configured embedder OR whose stored provider is "pending" OR
        // any of whose chunks have a null Embedding.
        try
        {
            return _db.ManualDocuments.AsNoTracking()
                .Where(d => d.EmbeddingProvider == "pending"
                         || d.EmbeddingProvider != configured.Provider
                         || d.EmbeddingModel    != configured.Model
                         || d.Dims              != configured.Dims
                         || d.Chunks.Any(c => c.Embedding == null))
                .Count();
        }
        catch
        {
            return 0;
        }
    }
}
