using FactoryBrain.Api.Domain.Entities;
using FactoryBrain.Api.Domain.Enums;
using FactoryBrain.Api.Dtos.Agents;
using FactoryBrain.Api.Dtos.Ask;
using FactoryBrain.Api.Dtos.Brief;
using FactoryBrain.Api.Dtos.FloorAlerts;
using FactoryBrain.Api.Dtos.LineBoard;
using FactoryBrain.Api.Dtos.Qc;
using FactoryBrain.Api.Dtos.Sensors;
using FactoryBrain.Api.Dtos.Settings;
using FactoryBrain.Api.Dtos.Vision;

namespace FactoryBrain.Api.Services.Interfaces;

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

public interface IAgentService
{
    Task<AgentRunResponse> RunAsync(string agentId, CancellationToken ct);
    IReadOnlyList<AgentDefinition> Roster();
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

    Task ReindexAsync(CancellationToken ct = default);
}

public sealed record SensorSimState(
    int Tick,
    IReadOnlyList<LineBoardLine> Lines,
    IReadOnlyList<LineBoardMachine> Machines,
    IReadOnlyList<SensorReading> Readings);

public sealed record LineBoardLine(string Id, double Efficiency, double Uptime, double EnergyKwh);
public sealed record LineBoardMachine(string Id, double Vibration, double Temperature, double DutyCycle, string Status);
