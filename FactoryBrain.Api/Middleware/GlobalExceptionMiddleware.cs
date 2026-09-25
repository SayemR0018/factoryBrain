using System.Text.Json;

namespace FactoryBrain.Api.Middleware;

/// <summary>
/// Returns the canonical JSON error envelope: <c>{ error, details }</c>.
/// Never leaks stack traces; logs the underlying exception server-side.
/// </summary>
public sealed class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _log;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> log)
    { _next = next; _log = log; }

    public async Task Invoke(HttpContext ctx)
    {
        try { await _next(ctx); }
        catch (Exception ex)
        {
            _log.LogError(ex, "Unhandled exception");
            ctx.Response.StatusCode = ex switch
            {
                ArgumentException       => StatusCodes.Status400BadRequest,
                KeyNotFoundException    => StatusCodes.Status404NotFound,
                UnauthorizedAccessException => StatusCodes.Status401Unauthorized,
                _                      => StatusCodes.Status500InternalServerError
            };
            ctx.Response.ContentType = "application/json";
            var payload = new
            {
                error = ex.GetType().Name,
                details = ctx.Response.StatusCode >= 500 ? null : ex.Message
            };
            await ctx.Response.WriteAsync(JsonSerializer.Serialize(payload));
        }
    }
}
