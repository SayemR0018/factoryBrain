using DotNetEnv;

namespace FactoryBrain.Api.Services.Rag;

/// <summary>
/// Development-only helper that re-reads <c>.env.local</c> on every probe
/// so newly-set or newly-removed values (notably
/// <c>RAG_EMBEDDING_FAKE_FAIL</c> / <c>RAG_EMBEDDING_FAKE_FAIL_AFTER</c>
/// / <c>RAG_EMBEDDING_API_KEY</c>) take effect without a restart.
///
/// <para>
/// Rules:
/// <list type="bullet">
///   <item>
///     Only acts when <c>ASPNETCORE_ENVIRONMENT</c> is <c>Development</c>.
///     In every other environment we skip the file and rely solely on
///     process environment variables — there is no Development-only code
///     path that would let an operator change RAG configuration at
///     runtime in production.
///   </item>
///   <item>
///     Loaded with <c>clobberExistingVars: true</c> so values set in
///     <c>.env.local</c> intentionally override whatever was inherited
///     from the OS / earlier <c>Env.Load</c> at startup.
///   </item>
///   <item>
///     File-read errors (missing file, permission, IO) are swallowed and
///     logged at warning level. We never log any value, never throw.
///   </item>
/// </list>
/// </para>
/// </summary>
public static class EnvReloader
{
    public const string LocalEnvFileName = ".env.local";

    /// <summary>
    /// True when the running environment is Development. Read once per
    /// call so a runtime change to <c>ASPNETCORE_ENVIRONMENT</c> can take
    /// effect on the next reload attempt.
    /// </summary>
    public static bool IsDevelopment()
    {
        var name = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
        return string.Equals(name, "Development", StringComparison.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Re-read <c>.env.local</c> with overwrite. No-op outside Development.
    /// Always swallows file errors and logs them as warnings (never the
    /// contents). Never throws.
    /// </summary>
    public static void Reload(ILogger? logger = null)
    {
        if (!IsDevelopment()) return;
        try
        {
            if (!File.Exists(LocalEnvFileName)) return;
            // clobberExistingVars=true so values intentionally set in
            // .env.local override whatever the OS / earlier Env.Load gave us.
            Env.Load(LocalEnvFileName, new LoadOptions(clobberExistingVars: true));
        }
        catch (Exception ex)
        {
            // Never log values — only the failure.
            logger?.LogWarning(ex, "EnvReloader: failed to re-read {File}; continuing with current process env.", LocalEnvFileName);
        }
    }
}
