using FactoryBrain.Api.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace FactoryBrain.Api.Controllers;

[ApiController]
[Route("api/agents")]
public class AgentsController : ControllerBase
{
    private readonly IAgentService _svc;
    public AgentsController(IAgentService svc) { _svc = svc; }

    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
        => Ok(await _svc.Roster());

    [HttpPost("{agentId}/run")]
    public async Task<IActionResult> Run([FromRoute] string agentId, CancellationToken ct)
    {
        try
        {
            return Ok(await _svc.RunAsync(agentId, ct));
        }
        catch (KeyNotFoundException)
        {
            return NotFound(new { error = "agent_not_found", agentId });
        }
    }
}
