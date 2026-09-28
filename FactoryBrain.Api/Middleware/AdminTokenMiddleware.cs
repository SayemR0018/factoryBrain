using System.Security.Cryptography;
using System.Text;

namespace FactoryBrain.Api.Middleware;

/// <summary>
/// Admin-token gate for the three write routes that mutate server state:
/// <c>POST /api/settings/llm</c>, <c>POST /api/rag/reindex</c>,
/// <c>POST /api/rag/ingest</c>. Behaviour:
///
/// <list type="bullet">
///   <item><b>Development</b>: nothing to do — the host is wide open the way the existing
///   frontend contract expects.</item>
///   <item><b>Anywhere else</b>: requires <c>X-Admin-Token</c> to equal the
///   server-side <c>ADMIN_API_TOKEN</c> env var, compared in constant time so a
///   timing oracle can't be used to learn the secret.</item>
///   <item>If <c>ADMIN_API_TOKEN</c> is unset we return <b>403 Forbidden</b>
///   ("admin token not configured on the server").</item>
///   <item>If the header is missing or wrong we return <b>401 Unauthorized</b>
///   ("admin token missing or invalid"). Both use the canonical
///   <c>{error, details}</c> envelope. The token value itself is
///   never logged.</item>
/// </list>
///
/// GET routes and <c>/api/ask</c> stay open as the spec requires.
/// </summary>
public sealed class AdminTokenMiddleware
{
    private const string HeaderName      = "X-Admin-Token";
    private const string EnvVarName      = "ADMIN_API_TOKEN";
    private const string SettingsLlmPath = "/api/settings/llm";
    private const string RagReindexPath  = "/api/rag/reindex";
    private const string RagIngestPath   = "/api/rag/ingest";

    private readonly RequestDelegate _next;
    private readonly IWebHostEnvironment _env;
    private readonly ILogger<AdminTokenMiddleware> _log;

    public AdminTokenMiddleware(
        RequestDelegate next,
        IWebHostEnvironment env,
        ILogger<AdminTokenMiddleware> log)
    {
        _next = next; _env = env; _log = log;
    }

    public async Task Invoke(HttpContext ctx)
    {
        if (_env.IsDevelopment())
        {
            await _next(ctx).ConfigureAwait(false);
            return;
        }

        if (!HttpMethods.IsPost(ctx.Request.Method))
        {
            await _next(ctx).ConfigureAwait(false);
            return;
        }

        var path = ctx.Request.Path.Value;
        var needsGuard =
            string.Equals(path, SettingsLlmPath, StringComparison.OrdinalIgnoreCase) ||
            string.Equals(path, RagReindexPath,  StringComparison.OrdinalIgnoreCase) ||
            string.Equals(path, RagIngestPath,   StringComparison.OrdinalIgnoreCase);
        if (!needsGuard)
        {
            await _next(ctx).ConfigureAwait(false);
            return;
        }

        StampNoStore(ctx);

        var configured = (Environment.GetEnvironmentVariable(EnvVarName)
                          ?? string.Empty).Trim();
        if (configured.Length == 0)
        {
            await WriteEnvelope(ctx, StatusCodes.Status403Forbidden,
                "AdminTokenNotConfigured",
                "admin token not configured on the server (set ADMIN_API_TOKEN)").ConfigureAwait(false);
            return;
        }

        if (!ctx.Request.Headers.TryGetValue(HeaderName, out var supplied)
            || supplied.Count == 0
            || string.IsNullOrEmpty(supplied[0]))
        {
            await WriteEnvelope(ctx, StatusCodes.Status401Unauthorized,
                "AdminTokenMissing",
                "admin token missing or invalid").ConfigureAwait(false);
            return;
        }

        if (!FixedTimeEquals(configured, supplied[0]!))
        {
            await WriteEnvelope(ctx, StatusCodes.Status401Unauthorized,
                "AdminTokenInvalid",
                "admin token missing or invalid").ConfigureAwait(false);
            return;
        }

        await _next(ctx).ConfigureAwait(false);
    }

    /// <summary>Length-stable comparison (constant-time for matching lengths).</summary>
    private static bool FixedTimeEquals(string a, string b)
    {
        var ab = Encoding.UTF8.GetBytes(a);
        var bb = Encoding.UTF8.GetBytes(b);
        if (ab.Length != bb.Length) return false;
        return CryptographicOperations.FixedTimeEquals(ab, bb);
    }

    private static void StampNoStore(HttpContext ctx)
    {
        if (!ctx.Response.Headers.ContainsKey("Cache-Control"))
            ctx.Response.Headers["Cache-Control"] = "no-store";
    }

    private async Task WriteEnvelope(HttpContext ctx, int status, string error, string details)
    {
        ctx.Response.StatusCode  = status;
        StampNoStore(ctx);
        ctx.Response.ContentType = "application/json; charset=utf-8";
        // Body is wrapped in the canonical { error, details } envelope. The
        // token value (correct or otherwise) never appears here.
        await ctx.Response.WriteAsync(
            System.Text.Json.JsonSerializer.Serialize(new { error, details }),
            ctx.RequestAborted).ConfigureAwait(false);
    }
}
