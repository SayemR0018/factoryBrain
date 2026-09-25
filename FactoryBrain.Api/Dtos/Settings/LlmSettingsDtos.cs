namespace FactoryBrain.Api.Dtos.Settings;

public record LlmSettingsResponse(
    bool Configured,
    string? Provider,
    string? Model,
    string Mode,            // "demo" | "live"
    string Persistence      // "env.local" | "process" | "vercel_only"
);

public record LlmSettingsRequest(
    string? Provider,
    string? ApiKey,
    string? Model,
    bool? ClearKey
);
