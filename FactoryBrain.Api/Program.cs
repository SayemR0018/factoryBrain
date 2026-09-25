// FactoryBrain.Api — Program.cs
// ---------------------------------------------------------------------------
// ASP.NET Core 9 entry point for the FactoryBrain Web API backend.
//
// Frontend bridge:
//   The Next.js dev server (next.config.mjs `rewrites`) proxies /api/* to
//   http://localhost:5000/api/* by default, or to $DOTNET_API_URL when set.
//   That makes the entire frontend (Next.js App Router + Zustand stores +
//   GSAP/Framer Motion components) continue to talk to a familiar origin
//   while data and compute move to a .NET 9 service.
//
// Configuration loading order (later overrides earlier):
//   1. appsettings.json
//   2. appsettings.{Environment}.json
//   3. .env  (DotNetEnv — shared with the Next.js frontend)
//   4. .env.local (DotNetEnv — overrides .env)
//   5. OS environment variables
//
// Health check:
//   GET /health → 200 OK when PostgreSQL is reachable, otherwise 503.
// ---------------------------------------------------------------------------

using System.Text.Json;
using System.Text.Json.Serialization;
using DotNetEnv;
using FactoryBrain.Api.Data;
using FactoryBrain.Api.Middleware;
using FactoryBrain.Api.Services;
using FactoryBrain.Api.Services.Interfaces;
using FactoryBrain.Api.Services.Rag;
using FluentValidation;

// 1. Load .env + .env.local (idempotent — missing files are tolerated).
Env.Load(".env");
Env.Load(".env.local");

var builder = WebApplication.CreateBuilder(args);

// ─── Logging ────────────────────────────────────────────────────────────────
builder.Logging.ClearProviders();
builder.Logging.AddSimpleConsole(o =>
{
    o.SingleLine = true;
    o.IncludeScopes = false;
    o.TimestampFormat = "HH:mm:ss ";
});

// ─── HTTP / JSON ───────────────────────────────────────────────────────────
builder.Services
    .AddControllers()
    .AddJsonOptions(o =>
    {
        o.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase;
        o.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull;
        o.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter(JsonNamingPolicy.CamelCase));
    });

// ─── PostgreSQL + EF Core (FactoryBrainDbContext) ─────────────────────────
var pgConn =
    Environment.GetEnvironmentVariable("FACTORYBRAIN_DB")
    ?? Environment.GetEnvironmentVariable("DOTNET_CONNECTION_STRING")
    ?? builder.Configuration.GetConnectionString("Postgres")
    ?? "Host=localhost;Port=5432;Database=factorybrain;Username=postgres;Password=postgres;Include Error Detail=true";

builder.Services.AddDbContext<FactoryBrainDbContext>(opts =>
{
    opts.UseNpgsql(pgConn, npg =>
    {
        npg.EnableRetryOnFailure(maxRetryCount: 3);
        npg.MigrationsHistoryTable("__ef_migrations");
    });
    if (builder.Environment.IsDevelopment())
    {
        opts.EnableDetailedErrors();
        opts.EnableSensitiveDataLogging();
    }
});

// ─── FluentValidation (assembly scan) ──────────────────────────────────────
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// ─── DI for application services ──────────────────────────────────────────
// Singleton: stateless / cache-friendly helpers (RAG embedder, chunker, scorer,
// rag service itself is scoped so it can request DbContext per call).
builder.Services.AddSingleton<IEmbeddingService, EmbeddingService>();
builder.Services.AddSingleton<TextChunker>();
builder.Services.AddSingleton<HybridScorer>();

// Scoped: each request gets a fresh instance with its own DbContext.
builder.Services.AddScoped<IRagService,        RagService>();
builder.Services.AddScoped<IAskService,        AskService>();
builder.Services.AddScoped<IFloorAlertService, FloorAlertService>();
builder.Services.AddScoped<ILineBoardService,  LineBoardService>();
builder.Services.AddScoped<IQcService,         QcService>();
builder.Services.AddScoped<ISensorService,     SensorService>();
builder.Services.AddScoped<IVisionService,     VisionService>();
builder.Services.AddScoped<IAgentRunService,   AgentRunService>();
builder.Services.AddScoped<ILlmSettingsService, LlmSettingsService>();
builder.Services.AddScoped<IBriefService,      BriefService>();

// HTTP client used by AskService / AgentRunService for OpenAI/Anthropic/Gemini.
builder.Services.AddHttpClient();
builder.Services.AddMemoryCache();

// ─── CORS — Next.js dev origins (frontend proxy host) ──────────────────────
// Spec: origins http://localhost:3000 and http://127.0.0.1:3000,
// any method, any header, credentials.
builder.Services.AddCors(o =>
    o.AddPolicy("NextDev", p =>
        p.WithOrigins(
               "http://localhost:3000",
               "http://127.0.0.1:3000")
         .AllowAnyHeader()
         .AllowAnyMethod()
         .AllowCredentials()));

// ─── Swagger / OpenAPI (Development only) ──────────────────────────────────
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new Microsoft.OpenApi.Models.OpenApiInfo
    {
        Title = "FactoryBrain.Api",
        Version = "v9",
        Description = "Backend for the BunonBrain (factoryBrain) platform. " +
                      "Every route mirrors a /api/** path the Next.js frontend expects."
    });
});

// ─── Health checks (PostgreSQL connectivity via NpgSql) ────────────────────
builder.Services.AddHealthChecks()
    .AddNpgSql(
        connectionStringFactory: _ => pgConn,
        name: "postgres",
        tags: new[] { "ready" });

var app = builder.Build();

// ─── Automatic database initialization & seeding ───────────────────────────
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<FactoryBrainDbContext>();
    db.Database.EnsureCreated();   // bring the schema up; EF migrations follow in production
    db.Database.ExecuteSqlRaw("CREATE EXTENSION IF NOT EXISTS vector;");
    await DbInitializer.Initialize(scope.ServiceProvider);
}

// ─── Middleware pipeline ───────────────────────────────────────────────────
app.UseMiddleware<GlobalExceptionMiddleware>();   // 1. JSON error envelope

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseRouting();
app.UseCors("NextDev");                            // 2. CORS for the Next.js origin
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();                              // 3. Attribute-routed controllers
app.MapHealthChecks("/health");                    // 4. Health probe

app.MapGet("/", () => Results.Ok(new
{
    service  = "factorybrain-api",
    version  = "1.0.0",
    swagger  = "/swagger",
    health   = "/health",
    endpoints = new[]
    {
        "POST /api/ask",
        "GET  /api/brief/morning",
        "GET  /api/floor-alerts",
        "PATCH /api/floor-alerts/{id}",
        "GET  /api/line-board",
        "POST /api/line-board/refresh",
        "GET  /api/qc/defects",
        "POST /api/qc/flag",
        "GET  /api/sensors/latest",
        "POST /api/sensors/ingest",
        "GET  /api/sensors/ingest",
        "POST /api/vision/analyze",
        "GET  /api/vision/analyze",
        "GET  /api/settings/llm",
        "POST /api/settings/llm",
        "GET  /api/agents",
        "POST /api/agents/{agentId}/run"
    }
}));

// ─── Listen on http://localhost:5000 (and https://localhost:5001 if cert exists) ─
app.Urls.Add("http://localhost:5000");
app.Urls.Add("https://localhost:5001");

app.Run();

public partial class Program { } // for WebApplicationFactory in tests
