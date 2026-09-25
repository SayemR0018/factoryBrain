namespace FactoryBrain.Api.Dtos.Ask;

/// <summary>
/// Response from POST /api/ask. Mirrors the
/// <c>AskAnswer</c> + <c>EvidenceRefPublic</c> contract in
/// <c>src/services/types.ts</c>.
/// </summary>
public record AskAnswerResponse(
    string TaskId,
    IReadOnlyList<AskAnalyzedDomain> Analyzed,
    string Finding,
    string FindingBn,
    IReadOnlyList<AskFactor> Factors,
    IReadOnlyList<EvidenceRefDto> Evidence,
    AskRecommendation Recommendation,
    DateTime CreatedAt,
    double Confidence,
    IReadOnlyList<AskRagHit> RagHits
);

public record AskAnalyzedDomain(string Domain, int Count, Dictionary<string, object>? Filter);

public record AskFactor(
    string Label, string LabelBn,
    string Magnitude, string MagnitudeBn);

public record AskRecommendation(
    string Title, string TitleBn,
    string Action, string ActionBn,
    string RiskTier);

public record AskRagHit(
    string Id,
    string SourceId,
    string Title,
    string Department,
    string Category,
    IReadOnlyList<string> Tags,
    double HybridScore,
    double DenseScore,
    double Bm25Score,
    string Snippet
);

public record EvidenceRefDto(
    string Domain,
    int Count,
    Dictionary<string, string>? Filter,
    IReadOnlyList<string>? PreviewIds
);
