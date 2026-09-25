using FactoryBrain.Api.Dtos.Sensors;
using FactoryBrain.Api.Services.Interfaces;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/sensors")]
public class SensorsController : ControllerBase
{
    private readonly ISensorService _svc;
    private readonly IValidator<IngestRequest> _validator;

    public SensorsController(ISensorService svc, IValidator<IngestRequest> v)
    { _svc = svc; _validator = v; }

    [HttpPost("ingest")]
    public async Task<IActionResult> Ingest([FromBody] IngestRequest? body, CancellationToken ct)
    {
        if (body is not null)
        {
            var res = await _validator.ValidateAsync(body, ct);
            if (!res.IsValid)
                return BadRequest(new { error = "invalid_body", issues = res.Errors });
        }
        return Ok(await _svc.IngestAsync(body ?? new IngestRequest(null), ct));
    }

    [HttpGet("ingest")]
    public async Task<IActionResult> IngestStatus(CancellationToken ct)
        => Ok(await _svc.StatusAsync(ct));

    [HttpGet("latest")]
    public async Task<IActionResult> Latest(CancellationToken ct)
        => Ok(await _svc.LatestAsync(ct));
}
