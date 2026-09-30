# Sensors in BunonBrain

A sensor in this project is a number from the sewing floor: how fast a bundle gate is scanning, how hard a machine is vibrating, how hot it is, or how much energy the floor just used. Those numbers are what the line board, the machine status, and the maintenance agent are supposed to read.

Until a device posts a reading, the API invents them. `POST /api/sensors/ingest` with an empty body advances a simulator for six lines and a fixed machine list. The overview page calls that every six seconds, which is why the floor moves with no hardware attached.

After the first real post to `POST /api/sensors/live`, that simulator stops. The same overview poll then returns the readings you sent. Pressing “Simulate tick” does not overwrite them. To force the demo again, send `{ "simulate": true }` to `/api/sensors/ingest`.

## What a reading is

Three sources, matching `src/data/sensors.ts` and `SensorSource` in the API:

| Source | What it is on a garment floor | Entity id examples | Metrics the API applies |
| --- | --- | --- | --- |
| `rfid` | A gate that sees a bundle tag | `line-1` … `line-6`, or `gate-A1` | `efficiency` (0–100 or 0–1), `scans_per_min` (treated as line pace), `uptime` |
| `telemetry` | A sensor on a sewing machine | `M-101`, `M-201`, any new id | `vibration_rms` (mm/s), `temperature_c` (°C), `duty_cycle` (0–1 or 0–100) |
| `energy` | A floor meter | `meter:floor-1` or a `line-*` id | `kwh` or `energy_kwh` |

Machine status is derived, not sent:

- `down` when vibration is above 6 mm/s or temperature is above 78 °C
- `at_risk` when vibration is above 4.5 mm/s or temperature is above 70 °C
- `healthy` otherwise

If `entityId` is `line-3` and `metric` is `efficiency`, the matching row in the line board is updated: percent, and a green / amber / red bottleneck (75% and above, 60–74%, below 60%).

## How the code is wired

```
Device or gateway
    POST /api/sensors/live
        │
        ▼
SensorsController.Live
        │
        ▼
SensorService.AcceptLiveAsync
    updates the in-memory line and machine board
    inserts SensorReading rows
    updates LineBoardMetric when the entity is a line
    SignalR: sensorReading
        │
        ▼
Overview  POST /api/sensors/ingest every 6s
          (returns the live snapshot, does not invent a tick)
Line board GET /api/line-board
```

Files:

| File | Role |
| --- | --- |
| `FactoryBrain.Backend/FactoryBrain.Api/Controllers/SensorsController.cs` | `ingest`, `live`, `latest` |
| `FactoryBrain.Backend/FactoryBrain.Infrastructure/Services/SensorService.cs` | Simulator and live apply |
| `FactoryBrain.Backend/FactoryBrain.Domain/Entities/SensorReading.cs` | Stored row |
| `src/app/app/page.tsx` | Polls ingest and draws efficiency, uptime, energy, machines down |
| `src/components/overview/LineBoardPanel.tsx` | Reads `/api/line-board` |
| `scripts/sensor-live.mjs` | One-shot publisher used to prove the path |

The Next.js app proxies `/api/*` to `http://localhost:5000` (`next.config.mjs`). A device on the same machine can post to either port. A device on the floor should post to the API, not to the browser.

## Connect a device

The API must be running:

```bash
cd FactoryBrain.Backend/FactoryBrain.Api
dotnet run
```

It listens on `http://localhost:5000` in Development. Postgres must be up; the API creates and seeds the database on first start. The seed is still the demo plant. Live posts update that plant’s lines and machines. They do not create a second factory.

### HTTP, the path that works now

Body:

```json
{
  "readings": [
    { "source": "telemetry", "entityId": "M-101", "metric": "vibration_rms", "value": 6.4, "unit": "mm/s" },
    { "source": "telemetry", "entityId": "M-101", "metric": "temperature_c", "value": 82, "unit": "°C" },
    { "source": "rfid", "entityId": "line-3", "metric": "efficiency", "value": 58, "unit": "%" }
  ]
}
```

Send it:

```bash
node ./scripts/sensor-live.mjs --entity M-101 --vibration 6.4 --temp 82 --line line-3 --efficiency 58
```

Or with curl against the API:

```bash
curl -X POST http://localhost:5000/api/sensors/live -H "Content-Type: application/json" -d "{\"readings\":[{\"source\":\"telemetry\",\"entityId\":\"M-101\",\"metric\":\"vibration_rms\",\"value\":6.4,\"unit\":\"mm/s\"}]}"
```

Open `http://localhost:3000/app`. The live tick should list `M-101` as down (vibration and temperature are both over the limits) and line 3 efficiency near 58% after the line board refreshes.

Check without the UI:

```bash
curl http://localhost:5000/api/sensors/ingest
curl http://localhost:5000/api/sensors/latest
```

`simulated` is `false` and `source` starts with `Live`.

### What to put on the floor

You do not run BunonBrain on the sewing machine. A small gateway next to the line reads the sensor and posts JSON.

1. **Vibration and temperature.** A sensor on the machine head (typical industrial accelerometer plus a temperature probe). The gateway reads it every 5–10 seconds and posts `telemetry` for that machine id. Use the same id the plant will use in the machine list (`M-101` matches the current demo machines).
2. **Bundle RFID.** A UHF reader at the end of the line. Each minute, the gateway posts `scans_per_min` or a computed `efficiency` for `line-3`. Efficiency is the number the line board understands directly.
3. **Energy.** The floor meter’s pulse or Modbus register, posted as `kwh` on `meter:floor-1`. The value is split across the lines currently in memory.

MQTT, Modbus, and OPC UA are not parsed by the API. The gateway translates them into the JSON above. A typical gateway is a small PC or industrial box running a script like `scripts/sensor-live.mjs` on a timer, or Node-RED with an HTTP request node aimed at `http://<api-host>:5000/api/sensors/live`.

Keep that port on the factory network. The live route does not require a login today, same as the demo ingest. Before a plant WAN exposes it, put it behind the existing admin token or a private network. Do not publish port 5000 on the public internet.

### Setup checklist

1. Postgres 16 with `vector`, and `FACTORYBRAIN_DB` pointing at it. See `FactoryBrain.Backend/FactoryBrain.Api/.env.example`.
2. `dotnet run` in `FactoryBrain.Backend/FactoryBrain.Api`. `GET /health` returns healthy.
3. `npm run dev` at the repo root. Overview loads.
4. Post one live batch with `node ./scripts/sensor-live.mjs`.
5. Reload Overview. Machine `M-101` shows down. Line 3 efficiency moves to the value you sent.
6. Post again with `--vibration 1.2 --temp 55 --efficiency 82`. The machine returns to healthy and the line bottleneck goes green.

`SIMULATOR_ENABLED` is a separate hosted loop that calls the same ingest. Leave it unset while a real gateway is posting, or the two will race until the first live post flips the process into live mode.

## Limits

- Live mode is remembered in the API process. Restarting `dotnet run` returns to the simulator until the next live post.
- Unknown machine ids are added in memory and show on the overview tick. They are not added to the seeded line-board style list.
- Line-board rows only change when `entityId` is an existing line id (`line-1` … `line-6` in the demo seed).
- This does not replace the demo orders, insights, or agents. Those still come from seed data. Sensor numbers are the part that now follows a connected device.
