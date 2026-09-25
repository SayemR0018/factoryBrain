using FactoryBrain.Api.Data;
using FactoryBrain.Api.Domain.Entities;
using FactoryBrain.Api.Domain.Enums;
using FactoryBrain.Api.Dtos.Ask;
using FactoryBrain.Api.Services.Interfaces;

namespace FactoryBrain.Api.Services;

/// <summary>
/// Equivalent of <c>src/services/ask.service.ts</c> + the SSE /api/ask handler.
/// If <c>LLM_PROVIDER</c> + <c>LLM_API_KEY</c> are set, forwards to the model;
/// otherwise returns the deterministic demo payload assembled from RAG hits +
/// the agent roster.
/// </summary>
public sealed class AskService : IAskService
{
    private readonly IRagService _rag;
    private readonly IConfiguration _cfg;
    private readonly IHttpClientFactory _http;
    private readonly FactoryBrainDbContext _db;
    private readonly ILogger<AskService> _log;

    public AskService(
        IRagService rag, IConfiguration cfg, IHttpClientFactory http,
        FactoryBrainDbContext db, ILogger<AskService> log)
    { _rag = rag; _cfg = cfg; _http = http; _db = db; _log = log; }

    public async Task<AskAnswerResponse> AskAsync(AskRequest req, CancellationToken ct)
    {
        var provider  = _cfg["LLM_PROVIDER"] ?? Environment.GetEnvironmentVariable("LLM_PROVIDER");
        var apiKey    = _cfg["LLM_API_KEY"]  ?? Environment.GetEnvironmentVariable("LLM_API_KEY");
        var model     = _cfg["LLM_MODEL"]    ?? Environment.GetEnvironmentVariable("LLM_MODEL") ?? "gpt-4.1-mini";

        var ragHits = await _rag.RetrieveAsync(req.Query, req.Filter, topK: 4, ct: ct);

        if (!string.IsNullOrWhiteSpace(provider) && !string.IsNullOrWhiteSpace(apiKey))
        {
            try
            {
                return await LiveAsync(req, ragHits, provider!, apiKey!, model!, ct);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Live ask failed, falling back to demo");
                return DemoAsync(req, ragHits, "Live model unavailable, showing demo answer.", ct);
            }
        }
        return DemoAsync(req, ragHits, null, ct);
    }

    private AskAnswerResponse DemoAsync(AskRequest req, IReadOnlyList<AskRagHit> hits, string? warning, CancellationToken ct)
    {
        var factors = new List<AskFactor>
        {
            new("Line efficiency vs target", "লক্ষ্যের বিপরীতে লাইনের দক্ষতা", "−12%", "−১২%"),
            new("Helper allocation", "সহায়ক বরাদ্দ", "watch", "নজরে")
        };
        var rec = new AskRecommendation(
            "Open the line board and review the bottleneck",
            "লাইন বোর্ড খুলুন এবং বটলনেক পর্যালোচনা করুন",
            "Pull helpers from Finishing → Sewing, validate SAH against target.",
            "ফিনিশিং থেকে সেলাইতে সহায়ক পুনর্বণ্টন করুন।",
            "medium");

        var evidence = new List<EvidenceRefDto>();
        if (hits.Count > 0)
            evidence.Add(new EvidenceRefDto("manuals", hits.Count,
                new Dictionary<string, string> { ["source"] = "rag" },
                hits.Select(h => h.SourceId).ToList()));

        return new AskAnswerResponse(
            TaskId: $"ask-{Guid.NewGuid():N}",
            Analyzed: evidence.Select(e => new AskAnalyzedDomain(e.Domain, e.Count, null)).ToList(),
            Finding: $"Demo answer for: {req.Query}",
            FindingBn: $"ডেমো উত্তর: {req.Query}",
            Factors: factors,
            Evidence: evidence,
            Recommendation: rec,
            CreatedAt: DateTime.UtcNow,
            Confidence: 0.7,
            RagHits: hits.ToList()
        );
    }

    private async Task<AskAnswerResponse> LiveAsync(
        AskRequest req, IReadOnlyList<AskRagHit> hits,
        string provider, string apiKey, string model, CancellationToken ct)
    {
        var prompt = string.Join("\n\n", new[]
        {
            "You are BunonBrain, the factory-floor operations assistant for a Bangladeshi RMG factory.",
            "Return ONLY JSON with: taskId, finding, findingBn, factors[] {label,labelBn,magnitude,magnitudeBn},",
            "evidence[] { domain: manuals|orders|customers|products|inventory|conversations|policies|suppliers, count },",
            "recommendation { title,titleBn,action,actionBn,riskTier: low|medium|high }, confidence.",
            "Question: " + req.Query,
            "RAG hits: " + System.Text.Json.JsonSerializer.Serialize(hits.Select(h => new { h.SourceId, h.Title, h.Snippet, h.HybridScore }))
        });

        var raw = provider switch
        {
            "openai"    => await OpenAiAsync(apiKey, model, prompt, ct),
            "anthropic" => await AnthropicAsync(apiKey, model, prompt, ct),
            "gemini"    => await GeminiAsync(apiKey, model, prompt, ct),
            _           => throw new InvalidOperationException($"Unknown provider: {provider}")
        };

        string finding = raw;
        try
        {
            var m = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(MatchJson(raw));
            finding = m.GetProperty("finding").GetString() ?? finding;
        }
        catch { /* swallow, keep raw as finding */ }

        return new AskAnswerResponse(
            TaskId: $"live-{Guid.NewGuid():N}",
            Analyzed: Array.Empty<AskAnalyzedDomain>(),
            Finding: finding,
            FindingBn: finding,
            Factors: new List<AskFactor>(),
            Evidence: new List<EvidenceRefDto>(),
            Recommendation: new AskRecommendation("Review the raw answer", "কাঁচা উত্তর পর্যালোচনা", raw.Length > 240 ? raw[..240] : raw, raw.Length > 240 ? raw[..240] : raw, "low"),
            CreatedAt: DateTime.UtcNow,
            Confidence: 0.65,
            RagHits: hits.ToList());
    }

    private static string MatchJson(string raw)
    {
        var s = raw.IndexOf('{'); var e = raw.LastIndexOf('}');
        return s >= 0 && e > s ? raw.Substring(s, e - s + 1) : raw;
    }

    private async Task<string> OpenAiAsync(string apiKey, string model, string prompt, CancellationToken ct)
    {
        using var http = _http.CreateClient();
        http.DefaultRequestHeaders.Authorization = new("Bearer", apiKey);
        var resp = await http.PostAsync("https://api.openai.com/v1/chat/completions",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(new
            {
                model,
                messages = new[] { new { role = "user", content = prompt } },
                temperature = 0.2
            }), System.Text.Encoding.UTF8, "application/json"), ct);
        resp.EnsureSuccessStatusCode();
        var j = await resp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(cancellationToken: ct);
        return j.GetProperty("choices")[0].GetProperty("message").GetProperty("content").GetString() ?? "";
    }

    private async Task<string> AnthropicAsync(string apiKey, string model, string prompt, CancellationToken ct)
    {
        using var http = _http.CreateClient();
        http.DefaultRequestHeaders.TryAddWithoutValidation("x-api-key", apiKey);
        http.DefaultRequestHeaders.TryAddWithoutValidation("anthropic-version", "2023-06-01");
        var resp = await http.PostAsync("https://api.anthropic.com/v1/messages",
            new StringContent(System.Text.Json.JsonSerializer.Serialize(new
            {
                model, max_tokens = 1024,
                messages = new[] { new { role = "user", content = prompt } }
            }), System.Text.Encoding.UTF8, "application/json"), ct);
        resp.EnsureSuccessStatusCode();
        var j = await resp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(cancellationToken: ct);
        return j.GetProperty("content")[0].GetProperty("text").GetString() ?? "";
    }

    private async Task<string> GeminiAsync(string apiKey, string model, string prompt, CancellationToken ct)
    {
        using var http = _http.CreateClient();
        var url = $"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={apiKey}";
        var resp = await http.PostAsync(url,
            new StringContent(System.Text.Json.JsonSerializer.Serialize(new
            {
                contents = new[] { new { parts = new[] { new { text = prompt } } } },
                generationConfig = new { temperature = 0.2 }
            }), System.Text.Encoding.UTF8, "application/json"), ct);
        resp.EnsureSuccessStatusCode();
        var j = await resp.Content.ReadFromJsonAsync<System.Text.Json.JsonElement>(cancellationToken: ct);
        return j.GetProperty("candidates")[0].GetProperty("content").GetProperty("parts")[0].GetProperty("text").GetString() ?? "";
    }
}
