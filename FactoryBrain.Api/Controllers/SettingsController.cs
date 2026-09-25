using FactoryBrain.Api.Dtos.Settings;
using FactoryBrain.Api.Services.Interfaces;
using FluentValidation;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/settings")]
public class SettingsController : ControllerBase
{
    private readonly ILlmSettingsService _svc;
    private readonly IValidator<LlmSettingsRequest> _validator;

    public SettingsController(ILlmSettingsService svc, IValidator<LlmSettingsRequest> v)
    { _svc = svc; _validator = v; }

    [HttpGet("llm")]
    public IActionResult Get() => Ok(_svc.ReadStatus());

    [HttpPost("llm")]
    public IActionResult Post([FromBody] LlmSettingsRequest body)
    {
        var res = _validator.Validate(body);
        if (!res.IsValid)
            return BadRequest(new { error = "invalid_body", issues = res.Errors });
        try { return Ok(_svc.Update(body)); }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }
}
