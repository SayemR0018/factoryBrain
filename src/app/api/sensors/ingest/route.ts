// POST /api/sensors/ingest
// ---------------------------------------------------------------------------
// Advances the simulated sensor stream by one tick.
//
// Body (Zod-validated):
//   { tick?: number }   // explicit sim tick to assign to the new batch
//
// On each call, the route:
//   1. Picks one entity per source (rfid/telemetry/energy) tied to lines and
//      machines the factory store already seeded.
//   2. Emits a fresh batch of `SensorReading`s using the metric + value ranges
//      from `src/data/sensors.ts`.
//   3. Updates an in-memory `lines` / `machines` summary the Overview KPIs
//      depend on (efficiency, uptime proxy, energy).
//   4. Returns the new tick, the readings, and the updated line/machine state.
//
// All readings are labelled Simulated. No real PLC / MQTT / Modbus traffic.

import { NextRequest } from "next/server";
import { z } from "zod";
import { makeRng } from "@/data/seed";
import {
  type SensorReading,
  type SensorSource
} from "@/data/sensors";
import { SensorReadingListSchema } from "@/services/sensors.schemas";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** Optional explicit sim tick. If omitted, the server advances from its last tick. */
  tick: z.number().int().nonnegative().optional()
});

// --- Entity pools (kept in sync with src/store/factory.store.ts seed) ------
// These are the same ids the factory store generates on first load, so each
// new reading is bound to an entity that already exists in the store.
const LINES = ["line-1", "line-2", "line-3", "line-4", "line-5", "line-6"];
const MACHINES = [
  "m-1-1", "m-1-2", "m-1-3", "m-1-4", "m-1-5", "m-1-6",
  "m-2-1", "m-2-2", "m-2-3", "m-2-4", "m-2-5", "m-2-6",
  "m-3-1", "m-3-2", "m-3-3", "m-3-4", "m-3-5", "m-3-6",
  "m-4-1", "m-4-2", "m-4-3", "m-4-4", "m-4-5", "m-4-6",
  "m-5-1", "m-5-2", "m-5-3", "m-5-4", "m-5-5", "m-5-6",
  "m-6-1", "m-6-2", "m-6-3", "m-6-4", "m-6-5", "m-6-6"
];
const METERS = ["meter:floor-1", "meter:floor-2", "meter:floor-3"];

// Same metric profiles as src/data/sensors.ts, but typed loosely so we can
// drive the per-source picker.
type Profile = { metric: string; unit: string; lo: number; hi: number };
const METRIC_PROFILES: Record<SensorSource, Profile[]> = {
  rfid: [
    { metric: "scans_per_min", unit: "scans/min", lo: 8, hi: 22 },
    { metric: "miss_rate", unit: "%", lo: 0, hi: 6 }
  ],
  telemetry: [
    { metric: "vibration_rms", unit: "mm/s", lo: 0.8, hi: 4.5 },
    { metric: "temperature_c", unit: "°C", lo: 45, hi: 82 },
    { metric: "duty_cycle", unit: "%", lo: 55, hi: 95 }
  ],
  energy: [
    { metric: "kwh", unit: "kWh", lo: 42, hi: 78 },
    { metric: "peak_demand", unit: "kW", lo: 110, hi: 165 }
  ]
};

// --- In-memory server state -----------------------------------------------
// Module-level so successive POSTs see the previous tick within the same
// Node.js process. (No new infra: no DB, no Redis. Maps to client's factory
// store on the next reconnect.)
type LineSummary = {
  id: string;
  efficiency: number; // 0..1
  uptime: number; // 0..1
  energyKwh: number;
};
type MachineSummary = {
  id: string;
  vibration: number; // mm/s
  temperature: number; // °C
  dutyCycle: number; // 0..1
  status: "healthy" | "at_risk" | "down";
};
type ServerSimState = {
  tick: number;
  lines: LineSummary[];
  machines: MachineSummary[];
  /** Rolling buffer of the most recent 200 readings for the stream shape. */
  readings: SensorReading[];
};

declare global {
  // eslint-disable-next-line no-var
  var __factoryBrainSimState: ServerSimState | undefined;
}

function seedServerSim(): ServerSimState {
  const rng = makeRng(0xFA47_0001);
  const lines: LineSummary[] = LINES.map((id) => ({
    id,
    efficiency: Math.round((0.62 + rng() * 0.28) * 1000) / 1000,
    uptime: Math.round((0.86 + rng() * 0.13) * 1000) / 1000,
    energyKwh: 0
  }));
  const machines: MachineSummary[] = MACHINES.map((id) => {
    const wearIndex = Math.floor(rng() * 100);
    const vibration = 1.5 + (wearIndex / 100) * 5.5;
    const temperature = 55 + (wearIndex / 100) * 25;
    const status: MachineSummary["status"] =
      wearIndex > 80 ? "down" : wearIndex > 60 ? "at_risk" : "healthy";
    return {
      id,
      vibration: Math.round(vibration * 100) / 100,
      temperature: Math.round(temperature * 10) / 10,
      dutyCycle: Math.round((0.55 + rng() * 0.4) * 1000) / 1000,
      status
    };
  });
  return { tick: 0, lines, machines, readings: [] };
}

function getState(): ServerSimState {
  if (!globalThis.__factoryBrainSimState) {
    globalThis.__factoryBrainSimState = seedServerSim();
  }
  return globalThis.__factoryBrainSimState;
}

// --- Per-tick emission ----------------------------------------------------

function pickOne<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length)];
}

function emitTick(state: ServerSimState): SensorReading[] {
  const tick = state.tick + 1;
  const rng = makeRng(0xA11CE ^ tick);
  const ts = new Date(Date.now() - (200 - tick) * 60_000).toISOString();
  const batch: SensorReading[] = [];
  let id = state.readings.length + 1;

  (Object.keys(METRIC_PROFILES) as SensorSource[]).forEach((source) => {
    const profiles = METRIC_PROFILES[source];
    const profile = pickOne(profiles, rng);
    const entityId =
      source === "rfid" ? `gate-${pickOne(["A1", "A2", "B1", "C1"], rng)}` :
      source === "telemetry" ? pickOne(MACHINES, rng) :
      pickOne(METERS, rng);
    const value = Number((rng() * (profile.hi - profile.lo) + profile.lo).toFixed(2));
    const reading: SensorReading = {
      id: `srv-sensor-${id++}`,
      source,
      entityId,
      metric: profile.metric,
      value,
      unit: profile.unit,
      ts,
      simTick: tick
    };
    batch.push(reading);

    // Update derived summary state.
    if (source === "rfid") {
      // RFID reading → nudge a random line's efficiency by ±2%.
      const line = state.lines[Math.floor(rng() * state.lines.length)];
      const drift = (rng() - 0.5) * 0.04;
      line.efficiency = clamp(line.efficiency + drift, 0.4, 0.95);
      line.uptime = clamp(line.uptime + (rng() - 0.5) * 0.01, 0.7, 1);
    } else if (source === "telemetry") {
      const m = state.machines.find((x) => x.id === entityId);
      if (m) {
        if (profile.metric === "vibration_rms") m.vibration = clamp(value, 0.5, 8);
        else if (profile.metric === "temperature_c") m.temperature = clamp(value, 40, 90);
        else if (profile.metric === "duty_cycle") m.dutyCycle = clamp(value / 100, 0.2, 1);
        m.status =
          m.vibration > 6 || m.temperature > 78 ? "down" :
          m.vibration > 4.5 || m.temperature > 70 ? "at_risk" :
          "healthy";
      }
    } else if (source === "energy") {
      // Spread energy across all lines (the meter is floor-level).
      const kwh = value;
      state.lines.forEach((l) => {
        l.energyKwh = Math.round((l.energyKwh + kwh / state.lines.length) * 100) / 100;
      });
    }
  });

  state.tick = tick;
  state.readings = [...batch.reverse(), ...state.readings].slice(0, 200);
  return batch;
}

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// --- HTTP handler ---------------------------------------------------------

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const state = getState();
  // If client passed an explicit tick, jump to it (clamped to current+1).
  if (typeof parsed.data.tick === "number") {
    const next = Math.max(state.tick + 1, parsed.data.tick);
    while (state.tick < next) {
      emitTick(state);
    }
  } else {
    emitTick(state);
  }

  // Validate the emitted batch through the same schema the store uses.
  const readings = SensorReadingListSchema.parse(state.readings.slice(0, 50));

  return Response.json(
    {
      // Mark clearly: this is all generated, no PLC on the other end.
      simulated: true,
      source: "Simulated — no live PLC / Modbus / MQTT traffic",
      tick: state.tick,
      readings: readings.slice(0, 50),
      lines: state.lines.map((l) => ({
        id: l.id,
        efficiency: l.efficiency,
        uptime: l.uptime,
        energyKwh: l.energyKwh
      })),
      machines: state.machines.map((m) => ({
        id: m.id,
        vibration: m.vibration,
        temperature: m.temperature,
        dutyCycle: m.dutyCycle,
        status: m.status
      }))
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    }
  );
}

export async function GET() {
  const state = getState();
  return Response.json(
    {
      simulated: true,
      source: "Simulated — no live PLC / Modbus / MQTT traffic",
      tick: state.tick,
      readingsCount: state.readings.length,
      linesCount: state.lines.length,
      machinesCount: state.machines.length
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
