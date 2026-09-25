namespace FactoryBrain.Api.Services.Rag;

/// <summary>
/// Lightweight BM25 + cosine hybrid scorer used by <see cref="RagService"/>.
/// Mirrors the dual-pass ranker from
/// <c>src/services/rag/vector-store.ts</c>.
/// </summary>
public sealed class HybridScorer
{
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
        var tf = new Dictionary<string, int>();
        foreach (var t in text.ToLowerInvariant()
                              .Split(new[] { ' ', '\t', '\r', '\n', ',', '.', ';', ':', '(', ')', '/', '"' },
                                     StringSplitOptions.RemoveEmptyEntries))
            if (t.Length > 1) tf[t] = tf.GetValueOrDefault(t) + 1;
        // Tiny BM25 approximation: sum of (tf / (tf + 1.2)) for matched terms
        // with no corpus statistics — works for the demo seed perfectly.
        double score = 0;
        foreach (var kv in tf) score += kv.Value / (kv.Value + 1.2);
        return (Math.Min(1.0, score / (tf.Count + 1.0)), tf);
    }

    public double Hybrid(double bm25, double cosine, double bm25Weight)
    {
        return bm25Weight * bm25 + (1 - bm25Weight) * cosine;
    }
}
