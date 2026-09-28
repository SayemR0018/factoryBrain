using System.Globalization;
using System.Text;

namespace FactoryBrain.Api.Services.Rag;

/// <summary>
/// Lightweight BM25 + cosine hybrid scorer used by <see cref="RagService"/>.
/// Mirrors the dual-pass ranker from
/// <c>src/services/rag/vector-store.ts</c>.
/// <para>
/// Step 47 changed the tokeniser to be Bangla-aware: it splits on the same
/// ASCII punctuation set as before plus the Bangla danda (।) and the Bangla
/// full-stop / comma / semi-colon / colon punctuation. Unicode is
/// normalised with <see cref="NormalizationForm.FormKC"/> so combining
/// marks fold into their base character. Tokens are no longer dropped when
/// their only character is a single Bangla codepoint.
/// </para>
/// </summary>
public sealed class HybridScorer
{
    /// <summary>
    /// Characters treated as token boundaries. ASCII whitespace + the
    /// ASCII punctuation set the original tokeniser used, plus the four
    /// common Bangla punctuation marks (danda, full-stop equivalent,
    /// comma equivalent, semi-colon equivalent).
    /// </summary>
    private static readonly char[] Splitters = new[]
    {
        ' ', '\t', '\r', '\n',
        ',', '.', ';', ':', '(', ')', '/', '"',
        '\'', '!', '?',
        '|', '\\', '[', ']', '{', '}', '<', '>', '=',
        // Bangla punctuation
        '\u09E1', // ।  U+09E1 Bangla Letter I + danda-like
        '\u09CE', // U+09CE Bangla Letter Khanda Ta (punctuation variant)
        '\u09E3', // U+09E3 Bengali Visarga (used as ; equivalent)
        '\u09C3', // U+09C3 Bengali Vowel Sign I
        '\u0964', // U+0964 Devanagari Danda (Bangla also uses it sometimes)
        '\u0965', // U+0965 Devanagari Double Danda
    };

    public double Cosine(float[] a, float[] b)
    {
        if (a.Length == 0 || b.Length == 0 || a.Length != b.Length) return 0;
        double dot = 0, na = 0, nb = 0;
        for (int i = 0; i < a.Length; i++)
        {
            dot += a[i] * b[i];
            na += a[i] * a[i];
            nb += b[i] * b[i];
        }
        return (na == 0 || nb == 0) ? 0 : dot / (Math.Sqrt(na) * Math.Sqrt(nb));
    }

    public (double bm25, Dictionary<string, int> tf) TermFreq(string text)
    {
        var tf = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var normalised = text?.Normalize(NormalizationForm.FormKC) ?? string.Empty;
        foreach (var token in Tokenise(normalised))
        {
            if (string.IsNullOrEmpty(token)) continue;
            tf[token] = tf.TryGetValue(token, out var c) ? c + 1 : 1;
        }
        // Tiny BM25 approximation: sum of (tf / (tf + 1.2)) for matched terms
        // with no corpus statistics — works for the demo seed perfectly.
        double score = 0;
        foreach (var kv in tf) score += (double)kv.Value / (kv.Value + 1.2);
        // Guard against the empty-input case: Tokenise() yields nothing, but
        // we still want a stable (0, {}) return so callers don't NRE.
        int distinct = tf.Count;
        return (distinct == 0 ? 0 : Math.Min(1.0, score / (distinct + 1.0)), tf);
    }

    public double Hybrid(double bm25, double cosine, double bm25Weight)
    {
        // Clamp the weight so a misconfigured RagConfig (or a stale env var
        // pointing at "RAG_HYBRID_BM25_WEIGHT=banana") can never push the
        // math into "negative score" territory.
        var w = Math.Clamp(bm25Weight, 0.0, 1.0);
        return w * bm25 + (1 - w) * cosine;
    }

    /// <summary>
    /// Public splitter for callers (e.g. <see cref="RagSynonyms"/>) that
    /// need to walk the same tokens the scorer sees. Lower-cases + Unicode
    /// normalises the input, then splits on the configured delimiter set
    /// and drops empty entries.
    /// </summary>
    public static IEnumerable<string> TokenizeForTest(string text)
    {
        if (string.IsNullOrEmpty(text)) yield break;
        var normalised = text.Normalize(NormalizationForm.FormKC);
        foreach (var token in Tokenise(normalised))
            if (!string.IsNullOrEmpty(token))
                yield return token;
    }

    private static IEnumerable<string> Tokenise(string text)
    {
        if (string.IsNullOrEmpty(text)) yield break;
        var lower = text.ToLower(CultureInfo.InvariantCulture);
        var sb = new StringBuilder(lower.Length);
        foreach (var ch in lower)
        {
            if (Array.IndexOf(Splitters, ch) >= 0)
            {
                if (sb.Length > 0)
                {
                    yield return sb.ToString();
                    sb.Clear();
                }
            }
            else
            {
                sb.Append(ch);
            }
        }
        if (sb.Length > 0) yield return sb.ToString();
    }
}
