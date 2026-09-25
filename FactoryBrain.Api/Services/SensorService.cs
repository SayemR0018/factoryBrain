using System.Collections.Concurrent;
using FactoryBrain.Api.Data;
using FactoryBrain.Api.Domain.Entities;
using FactoryBrain.Api.Domain.Enums;
using FactoryBrain.Api.Dtos.Sensors;
using FactoryBrain.Api.Services.Interfaces;
using Microsoft.EntityFrameworkCore;

namespace FactoryBrain.Api.Services;

/// <summary>
/// In-memory simulated sensor buffer — same role as
/// <c>src/services/sensors.server</c>. Persists latest 200 readings, advances
/// a tick counter, derives line / machine summaries deterministically.
/// </summary>
public sealed class SensorService : ISensorService
{
    private static readonly object _gate = new();
    private static SimState _state = Seed();
    private readonly FactoryBrainDbContext _db;

    public SensorService(FactoryBrainDbContext db) { _db = db; }

    public SensorSimState CurrentState => new(
        _state.Tick,
        _state.Lines.Select(l => new LineBoardLine(l.Id, l.Efficiency, l.Uptime, l.EnergyKwh)).ToList(),
        _state.Machines.Select(m => new LineBoardMachine(m.Id, m.Vibration, m.Temperature, m.DutyCycle, m.Status)).ToList(),
        _state.Readings.ToList()
    );

    public async Task<IngestResponse> IngestAsync(IngestRequest req, CancellationToken ct)
    {
        AdvanceSim(req.Tick);
        // Persist last batch into Postgres so the live page reflects history.
        var batch = _state.LastBatch ?? new List<SensorReading>();
        if (batch.Count > 0)
        {
            _db.SensorReadings.AddRange(batch);
            await _db.SaveChangesAsync(ct);
        }

        var readings = _state.Readings.Take(50)
            .Select(ToDto).ToList();

        return new IngestResponse(
            Simulated: true,
            Source: "Simulated — no live PLC / Modbus / MQTT traffic",
            Tick: _state.Tick,
            Readings: readings,
            Lines: _state.Lines.Select(l => new LineSummaryDto(l.Id, l.Efficiency, l.Uptime, l.EnergyKwh)).ToList(),
            Machines: _state.Machines.Select(m => new MachineSummaryDto(m.Id, m.Vibration, m.Temperature, m.DutyCycle, m.Status)).ToList()
        );
    }

    public Task<LatestReadingsResponse> LatestAsync(CancellationToken ct)
    {
        var sorted = _state.Readings
            .OrderByDescending(r => r.SimTick).ThenByDescending(r => r.Ts)
            .GroupBy(r => $"{r.Source}::{r.EntityId}")
            .Select(g => g.First())
            .OrderBy(r => r.Source).ThenBy(r => r.EntityId)
            .Select(ToDto).ToList();

        return Task.FromResult(new LatestReadingsResponse(
            Simulated: true,
            Source: "Simulated — derived from server sensor ingest buffer",
            Count: sorted.Count,
            Readings: sorted
        ));
    }

    public Task<SimStatusResponse> StatusAsync(CancellationToken ct)
        => Task.FromResult(new SimStatusResponse(true,
            "Simulated — no live PLC / Modbus / MQTT traffic",
            _state.Tick, _state.Readings.Count, _state.Lines.Count, _state.Machines.Count));

    // ----------------------------------------------------------------------

    private static void AdvanceSim(int? tickOverride)
    {
        lock (_gate)
        {
            int target = tickOverride.HasValue ? Math.Max(_state.Tick + 1, tickOverride.Value) : _state.Tick + 1;
            var batch = new List<SensorReading>();
            for (; _state.Tick < target; _state.Tick++)
            {
                batch.AddRange(StepTick());
            }
            _state.LastBatch = batch;
            // append to head, cap @ 200
            foreach (var r in batch.AsEnumerable().Reverse())
            {
                _state.Readings.Insert(0, r);
            }
            while (_state.Readings.Count > 200) _state.Readings.RemoveAt(_state.Readings.Count - 1);
        }
    }

    private static IEnumerable<SensorReading> StepTick()
    {
        int nextId = _state.NextId++;
        var ts = DateTime.UtcNow;
        var rng = new Random(0xA11CE ^ (_state.Tick + 1));

        var profiles = new (SensorSource Source, string Metric, string Unit, double Lo, double Hi, string Entity)[]
        {
            (SensorSource.Rfid,      "scans_per_min", "scans/min", 8,   22,  Pick(rng, "gate-A1","gate-A2","gate-B1","gate-C1")),
            (SensorSource.Telemetry, "vibration_rms", "mm/s",     0.8, 4.5, Pick(rng, "M-101","M-102","M-103","M-201","M-202","M-301","M-302")),
            (SensorSource.Energy,    "kwh",           "kWh",      42,  78,  Pick(rng, "meter:floor-1","meter:floor-2","meter:floor-3")),
        };

        var batch = new List<SensorReading>();
        foreach (var p in profiles)
        {
            double v = Math.Round(p.Lo + rng.NextDouble() * (p.Hi - p.Lo), 2);
            var reading = new SensorReading
            {
                Id = $"srv-sensor-{nextId++}",
                Source = p.Source,
                EntityId = p.Entity,
                Metric = p.Metric,
                Value = v,
                Unit = p.Unit,
                Ts = ts,
                SimTick = _state.Tick
            };
            batch.Add(reading);

            if (p.Source == SensorSource.Rfid)
            {
                var l = _state.Lines[rng.Next(_state.Lines.Count)];
                l.Efficiency = Math.Clamp(l.Efficiency + (rng.NextDouble() - 0.5) * 0.04, 0.4, 0.95);
                l.Uptime     = Math.Clamp(l.Uptime + (rng.NextDouble() - 0.5) * 0.01, 0.7, 1.0);
            }
            else if (p.Source == SensorSource.Telemetry)
            {
                var m = _state.Machines.FirstOrDefault(x => x.Id == p.Entity);
                if (m is not null)
                {
                    if (p.Metric == "vibration_rms") m.Vibration = Math.Clamp(v, 0.5, 8);
                    else if (p.Metric == "temperature_c") m.Temperature = Math.Clamp(v, 40, 90);
                    else if (p.Metric == "duty_cycle") m.DutyCycle = Math.Clamp(v / 100, 0.2, 1);
                    m.Status = (m.Vibration > 6 || m.Temperature > 78) ? "down"
                              : (m.Vibration > 4.5 || m.Temperature > 70) ? "at_risk"
                              : "healthy";
                }
            }
            else if (p.Source == SensorSource.Energy)
            {
                foreach (var l in _state.Lines) l.EnergyKwh = Math.Round(l.EnergyKwh + v / _state.Lines.Count, 2);
            }
        }
        return batch;
    }

    private static string Pick(Random rng, params string[] xs) => xs[rng.Next(xs.Length)];

    private static SensorReadingDto ToDto(SensorReading r) => new(
        r.Id, r.Source.ToString().ToLowerInvariant(),
        r.EntityId, r.Metric, r.Value, r.Unit, r.Ts, r.SimTick);

    private static SimState Seed()
    {
        var rng = new Random(0xFA47_0001);
        var lines = LINES.Select(id => new LineSim { Id = id,
            Efficiency = Math.Round(0.62 + rng.NextDouble() * 0.28, 3),
            Uptime     = Math.Round(0.86 + rng.NextDouble() * 0.13, 3),
            EnergyKwh  = 0 }).ToList();

        var machines = MACHINES.Select(id => {
            int wear = rng.Next(100);
            double vibration = Math.Round(1.5 + wear / 100.0 * 5.5, 2);
            double temperature = Math.Round(55 + wear / 100.0 * 25, 1);
            double duty = Math.Round(0.55 + rng.NextDouble() * 0.4, 3);
            string status = wear > 80 ? "down" : wear > 60 ? "at_risk" : "healthy";
            return new MachineSim { Id = id, Vibration = vibration, Temperature = temperature, DutyCycle = duty, Status = status };
        }).ToList();

        return new SimState(0, 1, lines, machines, new List<SensorReading>(), null);
    }

    private static readonly string[] LINES =
        { "line-1", "line-2", "line-3", "line-4", "line-5", "line-6" };

    private static readonly string[] MACHINES =
        Enumerable.Range(1, 6).SelectMany(l => Enumerable.Range(1, 6).Select(m => $"m-{l}-{m}"))
                  .ToArray();

    private sealed class SimState
    {
        public int Tick;
        public int NextId;
        public List<LineSim> Lines;
        public List<MachineSim> Machines;
        public List<SensorReading> Readings;
        public List<SensorReading>? LastBatch;
        public SimState(int tick, int nextId, List<LineSim> lines, List<MachineSim> machines,
            List<SensorReading> readings, List<SensorReading>? lastBatch)
        { Tick = tick; NextId = nextId; Lines = lines; Machines = machines; Readings = readings; LastBatch = lastBatch; }
    }
    private sealed class LineSim    { public string Id = default!; public double Efficiency { get; set; } public double Uptime { get; set; } public double EnergyKwh { get; set; } }
    private sealed class MachineSim { public string Id = default!; public double Vibration { get; set; } public double Temperature { get; set; } public double DutyCycle { get; set; } public string Status { get; set; } = "healthy"; }
}
