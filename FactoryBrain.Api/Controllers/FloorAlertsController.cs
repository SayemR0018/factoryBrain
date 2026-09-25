using FactoryBrain.Api.Dtos.FloorAlerts;
using FactoryBrain.Api.Services.Interfaces;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/floor-alerts")]
public class FloorAlertsController : ControllerBase
{
    private readonly IFloorAlertService _svc;
    private readonly IValidator<FloorAlertPatchRequest> _validator;

    public FloorAlertsController(IFloorAlertService svc, IValidator<FloorAlertPatchRequest> v)
    { _svc = svc; _validator = v; }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
        => Ok(await _svc.ListAsync(ct));

    [HttpPatch("{id}")]
    public async Task<IActionResult> Patch([FromRoute] string id, [FromBody] FloorAlertPatchRequest body, CancellationToken ct)
    {
        if (string.IsNullOrEmpty(id)) return BadRequest(new { error = "missing_id" });
        var res = await _validator.ValidateAsync(body, ct);
        if (!res.IsValid)
            return BadRequest(new { error = "invalid_body", issues = res.Errors });
        var updated = await _svc.MarkReadAsync(id, body.Read, ct);
        if (updated is null) return NotFound(new { error = "alert_not_found", id });
        return Ok(updated);
    }
}
