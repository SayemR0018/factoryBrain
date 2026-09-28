using FactoryBrain.Domain.Entities;
using FactoryBrain.Domain.Enums;
using FactoryBrain.Application.Dtos.Agents;
using FactoryBrain.Application.Dtos.Ask;
using FactoryBrain.Application.Dtos.Brief;
using FactoryBrain.Application.Dtos.FloorAlerts;
using FactoryBrain.Application.Dtos.LineBoard;
using FactoryBrain.Application.Dtos.Qc;
using FactoryBrain.Application.Dtos.Rag;
using FactoryBrain.Application.Dtos.Sensors;
using FactoryBrain.Application.Dtos.Settings;
using FactoryBrain.Application.Dtos.Vision;

namespace FactoryBrain.Application.Abstractions.Interfaces;

public interface IAskService
{
    Task<AskAnswerResponse> AskAsync(AskRequest req, CancellationToken ct);
}

public interface IBriefService
{
    Task<MorningBriefResponse> BuildMorningBriefAsync(CancellationToken ct);
}

public interface IFloorAlertService
{
    Task<FloorAlertListResponse> ListAsync(CancellationToken ct);
    Task<FloorAlertPatchResponse?> MarkReadAsync(string id, bool read, CancellationToken ct);
    Task<FloorAlert> PushAsync(FloorAlert alert, CancellationToken ct);
}

public interface ILineBoardService
{
    Task<LineBoardResponse> BuildAsync(CancellationToken ct);
    Task<LineBoardResponse> RefreshAsync(int? tickOverride, CancellationToken ct);
}

public interface IQcService
{
    Task<QcDefectsResponse> BuildAsync(CancellationToken ct);
    Task<QcFlagResponse> FlagAsync(QcFlagRequest req, CancellationToken ct);
}

public interface ISensorService
{
    Task<IngestResponse>  IngestAsync(IngestRequest req, CancellationToken ct);
    Task<LatestReadingsResponse> LatestAsync(CancellationToken ct);
    Task<SimStatusResponse> StatusAsync(CancellationToken ct);
    /// <summary>Immiration from src/services/sensors.server for the sim buffer.</summary>
    SensorSimState CurrentState { get; }
}

public interface IVisionService
{
    VisionAnalyzeResponse Analyze(VisionAnalyzeRequest req, CancellationToken ct);
    VisionAllowedResponse Allowed();
}

public interface ILlmSettingsService
{
    LlmSettingsResponse ReadStatus();
    LlmSettingsResponse Update(LlmSettingsRequest req);
}

public interface IAgentRunService
{
    Task<AgentRunResponse> RunAsync(string agentId, CancellationToken ct);
    Task<IReadOnlyList<AgentDefinition>> RosterAsync(CancellationToken ct = default);
}

public interface IRagService
{
    /// <summary>Chunk a doc body and emit embeddings (pgvector or in-memory).</summary>
    Task<List<DocumentChunk>> ChunkAsync(
        string docId, string title, string body, IEnumerable<string> tags,
        string department, string category, CancellationToken ct = default);

    /// <summary>Hybrid retrieval: cosine + BM25, returns top-k RAG hits.</summary>
    Task<IReadOnlyList<AskRagHit>> RetrieveAsync(
        string query, RagFilter? filter, int topK = 4, double similarityThreshold = 0,
        double bm25Weight = 0.35, CancellationToken ct = default);

    /// <summary>Re-embed every chunk with the currently active embedder.</summary>
    Task<ReindexReport> ReindexAsync(CancellationToken ct = default);

    /// <summary>
    /// True when the embedder metadata stored on existing manual rows
    /// (provider / model / dims) does not match the active configuration —
    /// i.e. a reindex is required to keep vectors consistent with the
    /// configured <see cref="FactoryBrain.Application.Abstractions.Interfaces.IRagService"/>'s
    /// embedder.
    /// </summary>
    Task<bool> NeedsReindexAsync(CancellationToken ct = default);

    /// <summary>
    /// Ingest a new document into the RAG index. Chunks the body with
    /// <see cref="FactoryBrain.Application.Rag.TextChunker"/>, embeds
    /// each chunk with the configured embedder, and writes the row + its
    /// chunks to <c>manual_documents</c>. In degraded mode the chunks are
    /// stored with <c>Embedding = null</c> and
    /// <c>EmbeddingProvider = "pending"</c> — they will be embedded by
    /// the next non-degraded startup reindex or POST /api/rag/reindex.
    /// </summary>
    Task<IngestOutcome> IngestAsync(IngestInput input, CancellationToken ct = default);

    /// <summary>
    /// List the manual documents currently stored in the index. Pass a
    /// non-null <paramref name="source"/> to filter by source
    /// (<c>manual | sop | compliance | faq</c>). Embedding vectors are
    /// never returned.
    /// </summary>
    Task<IReadOnlyList<DocumentListItem>> ListDocumentsAsync(string? source, CancellationToken ct = default);
}

/// <summary>
/// Inputs to <see cref="IRagService.IngestAsync"/>. Kept distinct from
/// the wire DTO so the service layer doesn't drag an HTTP shape around.
/// </summary>
public sealed record IngestInput(
    string Title,
    string? TitleBn,
    string Source,
    IReadOnlyList<string> Tags,
    string Content,
    string? Url,
    bool IsDemo
);

/// <summary>
/// Result of a single ingest call. Mirrors
/// <see cref="FactoryBrain.Application.Dtos.Rag.IngestResponse"/> but is safe to
/// return from the service layer (no HTTP coupling).
/// </summary>
public sealed record IngestOutcome(
    string DocumentId,
    int Chunks,
    string Provider,
    string Model,
    int Dims,
    bool Embedded,
    string? Warning
);

public sealed record SensorSimState(
    int Tick,
    IReadOnlyList<LineBoardLine> Lines,
    IReadOnlyList<LineBoardMachine> Machines,
    IReadOnlyList<SensorReading> Readings);

public sealed record LineBoardLine(string Id, double Efficiency, double Uptime, double EnergyKwh);
public sealed record LineBoardMachine(string Id, double Vibration, double Temperature, double DutyCycle, string Status);
