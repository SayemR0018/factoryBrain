using Pgvector;

namespace FactoryBrain.Api.Domain.Entities;

/// <summary>
/// Manual knowledge doc surfaced to Ask BunonBrain. Mirrors
/// <c>src/data/manuals.ts::ManualDocT</c>.
/// </summary>
public class ManualDocument
{
    public string Id { get; set; } = default!;       // "doc-1"
    public string TitleEn { get; set; } = default!;
    public string TitleBn { get; set; } = default!;
    public List<string> Tags { get; set; } = new();
    public string BodyEn { get; set; } = default!;
    public string BodyBn { get; set; } = default!;
    public string Source { get; set; } = "manual";  // "manual" | "sensor_log"
    public string Department { get; set; } = "general";
    public string Category { get; set; } = "manuals";

    public List<DocumentChunk> Chunks { get; set; } = new();
}

public class DocumentChunk
{
    public string Id { get; set; } = default!;       // "doc-1::chunk-1"
    public string DocumentId { get; set; } = default!;
    public string Title { get; set; } = default!;
    public string Department { get; set; } = "general";
    public string Category { get; set; } = "manuals";
    public List<string> Tags { get; set; } = new();
    public string Text { get; set; } = default!;
    public Vector Embedding { get; set; } = default!;
    public int Ordinal { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
