using FactoryBrain.Api.Dtos.FloorAlerts;
using FactoryBrain.Api.Dtos.LineBoard;
using FactoryBrain.Api.Dtos.Qc;
using FactoryBrain.Api.Dtos.Sensors;
using FactoryBrain.Api.Dtos.Settings;
using FactoryBrain.Api.Dtos.Vision;
using FluentValidation;

namespace FactoryBrain.Api.Validators;

public class FloorAlertPatchValidator : AbstractValidator<FloorAlertPatchRequest>
{
    public FloorAlertPatchValidator() => RuleFor(x => x.Read).NotNull();
}

public class RefreshRequestValidator : AbstractValidator<RefreshRequest>
{
    public RefreshRequestValidator()
    {
        RuleFor(x => x.Tick)
            .GreaterThanOrEqualTo(0)
            .When(x => x.Tick.HasValue);
    }
}

public class SensorIngestValidator : AbstractValidator<IngestRequest>
{
    public SensorIngestValidator()
    {
        RuleFor(x => x.Tick)
            .GreaterThanOrEqualTo(0)
            .When(x => x.Tick.HasValue);
    }
}

public class QcFlagRequestValidator : AbstractValidator<QcFlagRequest>
{
    // Mirrors the OPERATIONS whitelist from src/data/qc.defects.ts.
    private static readonly HashSet<string> _operations = new(StringComparer.Ordinal)
    {
        "cutting", "sewing", "buttonhole", "top_stitch", "qc_inspection", "finishing"
    };

    public QcFlagRequestValidator()
    {
        RuleFor(x => x.Operation)
            .NotEmpty().MaximumLength(64)
            .Must(op => _operations.Contains(op))
            .WithMessage("unknown_operation");
        RuleFor(x => x.LineId).NotEmpty().MaximumLength(32);
        RuleFor(x => x.DefectRatePct).InclusiveBetween(0, 100).When(x => x.DefectRatePct.HasValue);
        RuleFor(x => x.ReworkRatePct).InclusiveBetween(0, 100).When(x => x.ReworkRatePct.HasValue);
        RuleFor(x => x.Note).MaximumLength(280).When(x => !string.IsNullOrEmpty(x.Note));
    }
}

public class VisionAnalyzeRequestValidator : AbstractValidator<VisionAnalyzeRequest>
{
    // Keep parity with src/app/api/vision/analyze — the four staged files.
    public VisionAnalyzeRequestValidator()
    {
        RuleFor(x => x.SampleFile).Must(s => s is
            "defect-1-stitch-skip.jpg" or
            "defect-2-buttonhole.jpg" or
            "defect-3-seam-pucker.jpg" or
            "defect-4-fabric-stain.jpg")
            .WithMessage("unknown_sample_file");
    }
}

public class LlmSettingsRequestValidator : AbstractValidator<LlmSettingsRequest>
{
    public LlmSettingsRequestValidator()
    {
        RuleFor(x => x.Provider)
            .Must(p => string.IsNullOrEmpty(p) || p is "openai" or "anthropic" or "gemini")
            .WithMessage("invalid_provider");
        RuleFor(x => x.ApiKey).MaximumLength(2048);
        RuleFor(x => x.Model).MaximumLength(128);
    }
}
