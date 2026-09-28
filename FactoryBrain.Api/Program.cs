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
//   3. .env  (DotNetEnv — shared with the Next.js frontend; non-clobbering)
//   4. .env.local (DotNetEnv — overrides .env; non-clobbering)
//   5. OS environment variables (and anything the host sets before launch)
//
// IMPORTANT: both Env.Load calls below use LoadOptions(clobberExistingVars:
// false) so a host-set env var (e.g. FACTORYBRAIN_DB on a Docker / CI box,
// RAG_EMBEDDING_API_KEY on the operator's shell) always wins over what is
// committed in .env. EnvReloader may still overwrite RAG_* values at runtime
// in Development; see EnvReloader.cs for the prefix guard.
//
// RAG embedding providers (resolved at startup):
//   RAG_EMBEDDING_PROVIDER = local | openai | gemini   (default: local)
//   RAG_EMBEDDING_MODEL    = e.g. text-embedding-3-small
//   RAG_EMBEDDING_API_KEY  = falls back to LLM_API_KEY
//   RAG_EMBEDDING_DIMENSIONS = falls back to Rag:EmbeddingDimensions, then 384
//   If LLM_PROVIDER is set and a key is present, that provider is mirrored
//   (gemini → Gemini embeddings, openai → text-embedding-3-small).
//
// Health check:
//   GET /health → 200 OK when PostgreSQL is reachable, otherwise 503.
// ---------------------------------------------------------------------------

using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using DotNetEnv;
using FactoryBrain.Api.Data;
using FactoryBrain.Api.Middleware;
using FactoryBrain.Api.Services;
using FactoryBrain.Api.Services.Interfaces;
using FactoryBrain.Api.Services.Rag;
using FactoryBrain.Api.Configuration;
using FluentValidation;
using Microsoft.EntityFrameworkCore;

// LoadOptions(clobberExistingVars: false) means: any variable the host
// already set (FACTORYBRAIN_DB, ASPNETCORE_*, OS secrets, CI vars) keeps
// its value. Variables ONLY present in the file are loaded. This is what
// makes "FACTORYBRAIN_DB on the command line" actually win over the
// committed `.env` — without it, the file would silently overwrite the
// host's value on every restart.
Env.Load(".env",        new LoadOptions(clobberExistingVars: false));
Env.Load(".env.local",  new LoadOptions(clobberExistingVars: false));

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
    // Coerce every [ApiController] model-binding failure (malformed JSON,
    // empty body, [Required] misses, type mismatches) into the canonical
    // {error:"ValidationError", details:"<field>: <message>; ..."} envelope.
    // Without this the framework returns a default ValidationProblemDetails
    // 400, which the rest of the API doesn't speak.
    .ConfigureApiBehaviorOptions(o =>
    {
        o.InvalidModelStateResponseFactory = ctx =>
        {
            var details = string.Join("; ", ctx.ModelState
                .Where(kvp => kvp.Value!.Errors.Count > 0)
                .SelectMany(kvp => kvp.Value!.Errors
                    .Select(e => $"{kvp.Key}: {e.ErrorMessage}")));
            return new BadRequestObjectResult(new
            {
                error   = "ValidationError",
                details
            });
        };
    })
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
        npg.UseVector();
    });
    if (builder.Environment.IsDevelopment())
    {
        opts.EnableDetailedErrors();
        opts.EnableSensitiveDataLogging();
    }
});

// ─── FluentValidation (assembly scan) ──────────────────────────────────────
builder.Services.AddValidatorsFromAssemblyContaining<Program>();

// ─── RAG tuning config (Rag: section in appsettings.json, env Rag__*) ──────
builder.Services.Configure<RagConfig>(builder.Configuration.GetSection("Rag"));

// ─── RAG: pluggable embedder + chunker + scorer ────────────────────────────
// The resolver is a singleton; the actual IEmbeddingService is built once at
// startup (also a singleton) and is decorated with WithFallback so any
// hosted-provider failure drops permanently to the local hash embedder with
// a warning log — never a crash, never a key in the log.
builder.Services.AddSingleton<EmbeddingProviderResolver>();
builder.Services.AddSingleton<IEmbeddingService>(sp =>
{
    var resolver = sp.GetRequiredService<EmbeddingProviderResolver>();
    var http     = sp.GetRequiredService<IHttpClientFactory>();
    var lf       = sp.GetRequiredService<ILoggerFactory>();
    // BuildService wraps the hosted (or stub) primary with the local hash
    // fallback so transient hosted failures don't crash the request — they
    // flip Degraded via the wrapper and degrade gracefully.
    return resolver.BuildService(http, lf);
});
builder.Services.AddSingleton<TextChunker>();
builder.Services.AddSingleton<HybridScorer>();

// Background health probe + automatic reindex on recovery. The monitor
// re-reads env vars on every cycle so newly-set RAG_EMBEDDING_* values
// take effect without a restart.
builder.Services.AddSingleton<RagHealthMonitor>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<RagHealthMonitor>());

// Scoped helpers for column-dim probing + metadata-aware reindex.
// EmbeddingColumnAdmin needs IHttpClientFactory + ILoggerFactory so it can
// build a fresh primary hosted embedder directly (no fallback wrapper)
// during the reindex path — that's how we surface hosted-call failures
// as exceptions that trigger a transactional rollback + Degraded flag.
builder.Services.AddScoped<EmbeddingColumnAdmin>();

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

// HTTP client used by AskService / AgentRunService + hosted embedders.
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
    var db    = scope.ServiceProvider.GetRequiredService<FactoryBrainDbContext>();
    var rag   = scope.ServiceProvider.GetRequiredService<IRagService>();
    var admin = scope.ServiceProvider.GetRequiredService<EmbeddingColumnAdmin>();
    var log   = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    var embed = scope.ServiceProvider.GetRequiredService<IEmbeddingService>();
    var httpF = scope.ServiceProvider.GetRequiredService<IHttpClientFactory>();
    var lf    = scope.ServiceProvider.GetRequiredService<ILoggerFactory>();

    // Ensure the pgvector extension is present before EF tries to use it.
    db.Database.ExecuteSqlRaw("CREATE EXTENSION IF NOT EXISTS vector;");

    // Surface the configured-vs-active shape so operators see degraded
    // mode (and which provider was requested) without hitting /api/rag/status.
    var resolver = scope.ServiceProvider.GetRequiredService<EmbeddingProviderResolver>();

    // Dev-only test switches: ignored (with one warning) when not in
    // Development. Always read after the warning so an env flip right
    // before a probe can still take effect.
    if (!builder.Environment.IsDevelopment())
    {
        var swRaw = System.Environment.GetEnvironmentVariable(EmbeddingProviderResolver.EnvFakeFail)
                    ?? System.Environment.GetEnvironmentVariable(EmbeddingProviderResolver.EnvFakeFailAfter);
        if (!string.IsNullOrWhiteSpace(swRaw))
        {
            log.LogWarning(
                "RAG_EMBEDDING_FAKE_FAIL* ignored outside Development (ASPNETCORE_ENVIRONMENT={Env}).",
                builder.Environment.EnvironmentName);
        }
    }

    // Pre-flight: make one probe embedding call against the active hosted
    // provider (when configured != local). Any failure — HTTP error, auth,
    // timeout, wrong-dim response, simulated failure — flips the resolver
    // into Degraded and makes Active = local. The RagHealthMonitor will
    // probe again on its own interval and recover when the provider is
    // available.
    try
    {
        await resolver.ProbeAsync(httpF, lf, CancellationToken.None);
    }
    catch (Exception ex)
    {
        log.LogWarning(ex, "RAG embedding probe threw unexpectedly.");
    }

    var r1 = resolver.Resolve();
    if (r1.Degraded || resolver.IsDegraded)
    {
        // Spec: degraded startup warning prints ONLY configuredProvider,
        // activeProvider=local, configuredDims, apiKey=set|missing.
        log.LogWarning(
            "RAG embedding startup degraded mode: configuredProvider={ConfiguredProvider} activeProvider=local configuredDims={ConfiguredDims} apiKey={ApiKey}.",
            r1.Configured.Provider,
            r1.Configured.Dims,
            r1.Configured.KeySet ? "set" : "missing");
    }
    else
    {
        log.LogInformation(
            "RAG embedding startup: configuredProvider={ConfiguredProvider} activeProvider={ActiveProvider} model={Model} dims={Dims}",
            r1.Configured.Provider, r1.Active.Provider, r1.Active.Model, r1.Active.Dims);
    }

    // (a) If the app tables exist (legacy EnsureCreated bootstrap) but the
    //     __ef_migrations history table is missing or empty, create it and
    //     stamp the InitialBaseline migration as already applied so EF
    //     doesn't try to recreate existing schema and lose data. Newer
    //     migrations still run normally via Database.Migrate() below.
    BootstrapMigrationBaseline(db, log);

    // (b) Apply EF Core migrations. The two migrations are:
    //       20260927222103_InitialBaseline    — pre-45 schema + vector extension
    //       20260927222258_AddEmbeddingMetadata — adds EmbeddingProvider / Model / Dims
    var pending = db.Database.GetPendingMigrations();
    if (pending.Any())
    {
        log.LogInformation("Applying {N} pending EF migration(s): {Names}",
            pending.Count(), string.Join(", ", pending));
        db.Database.Migrate();
    }

    // (c) + (d) Atomic resize + reindex. Embeddings are pre-computed
    //          outside the DB transaction; the DB write (ALTER + per-row
    //          update + commit) is then done in one transaction inside
    //          the EF execution strategy. A mid-batch embedding failure
    //          returns 409; a mid-transaction DB error logs + surfaces
    //          as 500 and rolls the whole thing back.
    if (!resolver.IsDegraded)
    {
        try
        {
            var outcome = await admin.ResizeAndReindexAsync(CancellationToken.None);
            if (outcome.Documents > 0)
            {
                log.LogInformation(
                    "Startup reindex: updated {Docs} docs / {Chunks} chunks to provider={Provider} model={Model} dims={Dims}.",
                    outcome.Documents, outcome.Chunks, outcome.Configured.Provider, outcome.Configured.Model, outcome.Configured.Dims);
            }
        }
        catch (EmbeddingProviderUnavailableException ex)
        {
            log.LogError(ex,
                "Startup reindex rolled back: embedding provider became unavailable mid-batch. Configure a working API key or set RAG_EMBEDDING_PROVIDER=local to recover.");
        }
    }

    await DbInitializer.Initialize(scope.ServiceProvider);
}

// ─── Middleware pipeline ───────────────────────────────────────────────────
app.UseMiddleware<GlobalExceptionMiddleware>();   // 1. JSON error envelope
app.UseMiddleware<NoStoreMiddleware>();           // 2. Cache-Control: no-store on /api/* GETs
app.UseMiddleware<AdminTokenMiddleware>();        // 3. Admin-token gate on the three write routes (non-Development)

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
        "POST /api/rag/reindex",
        "GET  /api/rag/status",
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

// ─── Listen ────────────────────────────────────────────────────────────────
// In Development, appsettings.Development.json supplies Urls (the
// Next.js dev proxy expects http://localhost:5000). In Production and
// every other environment, ASPNETCORE_URLS / launchSettings / the host's
// settings take effect — no URL is hard-coded here.
app.Run();

// ─── Helpers ────────────────────────────────────────────────────────────────
public partial class Program
{
    /// <summary>
    /// (a) If the app tables exist (legacy <c>EnsureCreated()</c> bootstrap)
    /// but the <c>__ef_migrations</c> history table is missing or empty,
    /// create the history table if needed and stamp the
    /// <c>InitialBaseline</c> migration as already applied so EF doesn't try
    /// to recreate existing schema and lose data. Newer migrations still
    /// run normally via <c>Database.Migrate()</c> on the next line.
    /// </summary>
    private static void BootstrapMigrationBaseline(
        Microsoft.EntityFrameworkCore.DbContext db,
        ILogger log)
    {
        try
        {
            var conn = db.Database.GetDbConnection();
            conn.Open();
            try
            {
                // 1. History table — create it now if it doesn't exist yet.
                long historyExists;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText =
                        "SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE tablename = '__ef_migrations';";
                    historyExists = Convert.ToInt64(cmd.ExecuteScalar() ?? 0L);
                }
                if (historyExists == 0)
                {
                    using (var cmd = conn.CreateCommand())
                    {
                        cmd.CommandText = @"
                            CREATE TABLE ""__ef_migrations"" (
                                ""MigrationId""    VARCHAR(150) NOT NULL,
                                ""ProductVersion"" VARCHAR(32)  NOT NULL,
                                PRIMARY KEY (""MigrationId"")
                            );";
                        cmd.ExecuteNonQuery();
                    }
                }

                // 2. Probe app tables: did EnsureCreated already create them?
                long tablesPresent;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText =
                        "SELECT COUNT(*) FROM pg_catalog.pg_tables WHERE tablename IN ('manual_documents', 'document_chunks');";
                    tablesPresent = Convert.ToInt64(cmd.ExecuteScalar() ?? 0L);
                }

                // 3. If the app tables are present, check history emptiness.
                long appliedCount;
                using (var cmd = conn.CreateCommand())
                {
                    cmd.CommandText = "SELECT COUNT(*) FROM \"__ef_migrations\";";
                    appliedCount = Convert.ToInt64(cmd.ExecuteScalar() ?? 0L);
                }
                if (tablesPresent > 0 && appliedCount == 0)
                {
                    db.Database.ExecuteSqlRaw(
                        "INSERT INTO \"__ef_migrations\" (\"MigrationId\", \"ProductVersion\") VALUES ({0}, {1})",
                        "20260927222103_InitialBaseline", "9.0.0");
                    log.LogInformation(
                        "Adopted InitialBaseline migration for an EnsureCreated-bootstrapped database; newer migrations will still run.");
                }
            }
            finally
            {
                conn.Close();
            }
        }
        catch (Exception ex)
        {
            // Don't crash startup if the probe fails — the next call to
            // GetPendingMigrations() / Migrate() will surface the real error.
            log.LogWarning(ex, "BootstrapMigrationBaseline probe failed; continuing startup.");
        }
    }
}

