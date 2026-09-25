using FactoryBrain.Api.Data;
using FactoryBrain.Api.Domain.Entities;
using FactoryBrain.Api.Domain.Enums;
using FactoryBrain.Api.Dtos.LineBoard;
using FactoryBrain.Api.Dtos.Sensors;
using FactoryBrain.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace FactoryBrain.Api.Services;

public sealed class LineBoardService : ILineBoardService
{
    private readonly FactoryBrainDbContext _db;
    private readonly ISensorService _sensors;
    private static readonly Random _rng = new(0xBEEF);

    public LineBoardService(FactoryBrainDbContext db, ISensorService sensors)
    {
        _db = db; _sensors = sensors;
    }

    public async Task<LineBoardResponse> BuildAsync(CancellationToken ct)
    {
        var rows = await _db.LineBoardMetrics.AsNoTracking()
            .OrderBy(x => x.Id).ToListAsync(ct);
        var state = await Task.Run(() => _sensors.CurrentState, ct);

        var mapped = rows.Select(r => new LineBoardRow(
            r.Id,
            r.Name,
            r.EfficiencyPct,
            r.SahTarget,
            r.SahActual,
            r.WipBundles,
            r.Bottleneck.ToString().ToLowerInvariant(),
            r.NptMinutes,
            r.UpdatedAt
        )).ToList();

        return new LineBoardResponse(mapped, new LineBoardMeta(
            Simulated: true,
            Source: "Simulated — derived from FactoryBrain.Api/Services/SensorService sim buffer (no live PLC/Modbus/MQTT traffic)",
            Tick: state.Tick,
            UpdatedAt: DateTime.UtcNow,
            Notes: "Deterministic per-line seed + latest server sim state. NPT grows with efficiency gap; WIP drifts on tick."
        ));
    }

    public async Task<LineBoardResponse> RefreshAsync(int? tickOverride, CancellationToken ct)
    {
        if (tickOverride.HasValue) await _sensors.IngestAsync(new IngestRequest(tickOverride), ct);
        else await _sensors.IngestAsync(new IngestRequest(null), ct);
        return await BuildAsync(ct);
    }
}
