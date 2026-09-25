using System.Text.Json.Serialization;

namespace FactoryBrain.Api.Dtos.Settings;

public record LlmSettingsResponse(
    bool Configured,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? Provider,
    [property: JsonIgnore(Condition = JsonIgnoreCondition.Never)] string? Model,
    string Mode,            // "demo" | "live"
    string Persistence      // "env.local" | "process" | "vercel_only"
);

public record LlmSettingsRequest(
    string? Provider,
    string? ApiKey,
    string? Model,
    bool? ClearKey,
    bool? ClearAll
);
