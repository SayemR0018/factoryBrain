using FactoryBrain.Api.Dtos.Qc;
using FactoryBrain.Api.Services.Interfaces;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/qc")]
public class QcController : ControllerBase
{
    private readonly IQcService _svc;
    private readonly IValidator<QcFlagRequest> _validator;

    public QcController(IQcService svc, IValidator<QcFlagRequest> v)
    { _svc = svc; _validator = v; }

    [HttpGet("defects")]
    public async Task<IActionResult> Defects(CancellationToken ct)
        => Ok(await _svc.BuildAsync(ct));

    [HttpPost("flag")]
    public async Task<IActionResult> Flag([FromBody] QcFlagRequest body, CancellationToken ct)
    {
        var res = await _validator.ValidateAsync(body, ct);
        if (!res.IsValid)
            return BadRequest(new { error = "invalid_body", issues = res.Errors });
        return Ok(await _svc.FlagAsync(body, ct));
    }
}
