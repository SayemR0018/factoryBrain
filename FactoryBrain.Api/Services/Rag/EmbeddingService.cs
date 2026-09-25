using System.Security.Cryptography;
using System.Text;
using Pgvector;

namespace FactoryBrain.Api.Services.Rag;

public interface IEmbeddingService
{
    Vector Embed(string text, int dimensions = 384);
}

/// <summary>
/// Deterministic local embedder used when no hosted provider is configured.
/// Hashes tokens into a stable 384-d vector so the RAG index stays reproduci-
/// ble — same input → same vector. Mirrors the inline token-frequency hash
/// embedder originally inside <c>src/services/rag/vector-store.ts</c>.
/// </summary>
public sealed class EmbeddingService : IEmbeddingService
{
    private readonly int _dims;

    public EmbeddingService(IConfiguration cfg)
    {
        _dims = int.TryParse(cfg["Rag:EmbeddingDimensions"], out var d) ? d : 384;
    }

    public Vector Embed(string text, int dimensions = 0)
    {
        int d = dimensions > 0 ? dimensions : _dims;
        var v = new float[d];
        foreach (var token in Tokenize(text))
        {
            if (string.IsNullOrEmpty(token)) continue;
            int h = Hash(token) % d;
            v[h] += 1f;
        }
        // L2 normalise
        double norm = 0;
        for (int i = 0; i < d; i++) norm += v[i] * v[i];
        norm = Math.Sqrt(norm);
        if (norm > 0)
            for (int i = 0; i < d; i++) v[i] = (float)(v[i] / norm);
        return new Vector(v);
    }

    private static IEnumerable<string> Tokenize(string text)
    {
        if (string.IsNullOrEmpty(text)) yield break;
        foreach (var t in text.ToLowerInvariant()
                              .Split(new[] { ' ', '\t', '\r', '\n', '\u09BD', ',', '.', '!', '?', ';', ':', '(', ')', '[', ']', '/', '"' },
                                     StringSplitOptions.RemoveEmptyEntries))
            yield return t;
    }

    private static int Hash(string s)
    {
        Span<byte> data = stackalloc byte[Encoding.UTF8.GetByteCount(s)];
        Encoding.UTF8.GetBytes(s, data);
        var digest = MD5.HashData(data);
        return BitConverter.ToInt32(digest[..4]);
    }
}
