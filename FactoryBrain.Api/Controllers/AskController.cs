using FactoryBrain.Api.Dtos.Ask;
using FactoryBrain.Api.Services.Interfaces;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/ask")]
public class AskController : ControllerBase
{
    private readonly IAskService _svc;
    private readonly IValidator<AskRequest> _validator;

    public AskController(IAskService svc, IValidator<AskRequest> validator)
    { _svc = svc; _validator = validator; }

    /// <summary>POST /api/ask — body matches <c>src/app/api/ask/route.ts</c>.</summary>
    [HttpPost]
    public async Task<IActionResult> Post([FromBody] AskRequest body, CancellationToken ct)
    {
        var res = await _validator.ValidateAsync(body, ct);
        if (!res.IsValid)
            return BadRequest(new { error = "invalid_body", issues = res.Errors });
        var answer = await _svc.AskAsync(body, ct);
        return Ok(answer);
    }
}
