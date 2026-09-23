// GET /api/sensors/latest
// ---------------------------------------------------------------------------
// Returns the latest `SensorReading` per (source, entityId) tuple from the
// sensors store. Empty array when nothing has been ingested yet.
//
// Implementation notes:
//   - Reuses `useSensorsStore` from `src/store/sensors.store.ts` (the same
//     Zustand store the client UI reads from). The store depends on
//     `src/lib/persist`, which is SSR-safe — on the server it falls back to
//     an in-memory map so importing the store here does not throw.
//   - Reuses the `SensorReading` type from `src/data/sensors.ts` and the
//     `SensorReadingListSchema` Zod validator from
//     `src/services/sensors.schemas.ts`, so the response shape stays in
//     lockstep with the rest of the app without any new infra.

import { useSensorsStore } from "@/store/sensors.store";
import type { SensorReading, SensorSource } from "@/data/sensors";
import { SensorReadingListSchema } from "@/services/sensors.schemas";

export const runtime = "nodejs";

/** Sort key — newest first. Sim tick monotonically grows per emitted batch;
 *  we fall back to ISO `ts` for any cross-tick ties. */
function compareNewest(a: SensorReading, b: SensorReading): number {
  if (b.simTick !== a.simTick) return b.simTick - a.simTick;
  return b.ts.localeCompare(a.ts);
}

/** Reduce a readings array to one row per (source, entityId): the most
 *  recent by simTick then ISO ts. Tie-breakers intentionally prefer the
 *  server-emitted row (deterministic id prefix `srv-sensor-` and client
 *  ids like `sensor-N`) — newest-wins logic is identical. */
function latestPerEntity(readings: SensorReading[]): SensorReading[] {
  const sorted = [...readings].sort(compareNewest);
  const seen = new Set<string>();
  const out: SensorReading[] = [];
  for (const r of sorted) {
    const key = `${r.source}::${r.entityId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Stable ordering for the response: by source (rfid → telemetry → energy),
 * then entityId. Deterministic so the UI / tests can diff snapshots.
 */
function sortResponse(rows: SensorReading[]): SensorReading[] {
  const sourceOrder: Record<SensorSource, number> = {
    rfid: 0,
    telemetry: 1,
    energy: 2
  };
  return [...rows].sort((a, b) => {
    const so = sourceOrder[a.source] - sourceOrder[b.source];
    if (so !== 0) return so;
    return a.entityId.localeCompare(b.entityId);
  });
}

export async function GET() {
  // `useSensorsStore.getState()` returns the current readings slice from the
  // store. On the server this is the in-memory fallback ([] when nothing
  // has been ingested yet in this process); on the client hybrid context
  // the same call returns the persisted buffer hydrated by `lib/persist`.
  const raw = useSensorsStore.getState().readings ?? [];

  const latest = sortResponse(latestPerEntity(raw));

  // Validate once before serialising so we never emit a row that fails the
  // shared schema. If the store somehow drifted (e.g. legacy rows), we drop
  // the bad ones rather than emit broken JSON.
  const validated = SensorReadingListSchema.parse(latest);

  return Response.json(
    {
      simulated: true,
      source: "Simulated — derived from src/store/sensors.store.ts",
      count: validated.length,
      readings: validated
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" }
    }
  );
}
