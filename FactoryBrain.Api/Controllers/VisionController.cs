using FactoryBrain.Api.Dtos.Vision;
using FactoryBrain.Api.Services.Interfaces;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/vision")]
public class VisionController : ControllerBase
{
    private readonly IVisionService _svc;
    private readonly IValidator<VisionAnalyzeRequest> _validator;

    public VisionController(IVisionService svc, IValidator<VisionAnalyzeRequest> v)
    { _svc = svc; _validator = v; }

    [HttpGet("analyze")]
    public IActionResult Allowed() => Ok(_svc.Allowed());

    [HttpPost("analyze")]
    public async Task<IActionResult> Analyze([FromBody] VisionAnalyzeRequest body, CancellationToken ct)
    {
        var res = await _validator.ValidateAsync(body, ct);
        if (!res.IsValid)
        {
            var firstErr = res.Errors.FirstOrDefault()?.ErrorMessage ?? "invalid_body";
            var errorCode = firstErr == "unknown_sample_file" ? "unknown_sample_file" : "invalid_body";
            return BadRequest(new
            {
                error = errorCode,
                allowed = new[] { "defect-1-stitch-skip.jpg", "defect-2-buttonhole.jpg", "defect-3-seam-pucker.jpg", "defect-4-fabric-stain.jpg" },
                issues = res.Errors
            });
        }
        return Ok(_svc.Analyze(body, ct));
    }
}
