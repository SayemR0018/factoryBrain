namespace FactoryBrain.Api.Services.Rag;

/// <summary>
/// Splits a long doc body into ~250-char windows with a 50-char overlap so
/// vector lookups stay granular. Mirrors
/// <c>src/services/rag/chunker.ts</c>.
/// </summary>
public sealed class TextChunker
{
    private const int MaxChunk = 250;
    private const int Overlap = 50;

    public IReadOnlyList<string> Split(string text)
    {
        var norm = (text ?? string.Empty).Trim();
        if (norm.Length == 0) return Array.Empty<string>();
        if (norm.Length <= MaxChunk) return new[] { norm };

        var out0 = new List<string>();
        int step = MaxChunk - Overlap;
        for (int i = 0; i < norm.Length; i += step)
        {
            int end = Math.Min(norm.Length, i + MaxChunk);
            out0.Add(norm[i..end]);
            if (end == norm.Length) break;
        }
        return out0;
    }
}
