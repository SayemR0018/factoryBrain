using System.Text.Json;

namespace FactoryBrain.Api.Middleware;

/// <summary>
/// Returns the canonical JSON error envelope: <c>{ error, details }</c>.
/// In Development the envelope widens to <c>{error, details, traceId}</c>
/// so a developer can correlate a local 500 with the server log.
/// In every other environment the envelope is
/// <c>{error:"InternalError", details:"An unexpected error occurred. traceId=…"}</c>
/// and never includes exception types, messages, SQL, table or column names,
/// row values, or host information.
///
/// Frame-level binding/JSON failures are intercepted earlier by the
/// <c>ApiBehaviorOptions.InvalidModelStateResponseFactory</c> registered
/// in <c>Program.cs</c>, which always uses <c>{error:"ValidationError", details}</c>.
/// This middleware is the funnel for everything else: uncaught throws.
/// </summary>
public sealed class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _log;
    private readonly IWebHostEnvironment _env;

    public GlobalExceptionMiddleware(
        RequestDelegate next,
        ILogger<GlobalExceptionMiddleware> log,
        IWebHostEnvironment env)
    { _next = next; _log = log; _env = env; }

    public async Task Invoke(HttpContext ctx)
    {
        try { await _next(ctx); }
        catch (Exception ex)
        {
            int status = ex switch
            {
                ArgumentException          => StatusCodes.Status400BadRequest,
                KeyNotFoundException       => StatusCodes.Status404NotFound,
                UnauthorizedAccessException=> StatusCodes.Status401Unauthorized,
                _                          => StatusCodes.Status500InternalServerError
            };
            var traceId = ctx.TraceIdentifier;

            // Always log the full exception with the trace id so the prod
            // envelope can be matched back to the server log. We never log
            // API keys, full connection strings, or request bodies here.
            _log.LogError(ex,
                "Unhandled exception traceId={TraceId} path={Path} method={Method}",
                traceId, ctx.Request.Path, ctx.Request.Method);

            ctx.Response.StatusCode = status;
            ctx.Response.ContentType = "application/json";

            object payload = _env.IsDevelopment()
                ? new
                {
                    error   = ex.GetType().Name,
                    details = $"{ex.GetType().Name}: {ex.Message}",
                    traceId
                }
                : new
                {
                    error   = "InternalError",
                    details = $"An unexpected error occurred. traceId={traceId}"
                };

            await ctx.Response.WriteAsync(JsonSerializer.Serialize(payload));
        }
    }
}
