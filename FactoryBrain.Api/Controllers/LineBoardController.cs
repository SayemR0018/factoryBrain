using FactoryBrain.Api.Dtos.LineBoard;
using FactoryBrain.Api.Services.Interfaces;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/line-board")]
public class LineBoardController : ControllerBase
{
    private readonly ILineBoardService _svc;
    private readonly IValidator<RefreshRequest> _validator;

    public LineBoardController(ILineBoardService svc, IValidator<RefreshRequest> v)
    { _svc = svc; _validator = v; }

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
        => Ok(await _svc.BuildAsync(ct));

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh([FromBody] RefreshRequest? body, CancellationToken ct)
    {
        if (body is not null)
        {
            var res = await _validator.ValidateAsync(body, ct);
            if (!res.IsValid)
                return BadRequest(new { error = "invalid_body", issues = res.Errors });
        }
        return Ok(await _svc.RefreshAsync(body?.Tick, ct));
    }
}
