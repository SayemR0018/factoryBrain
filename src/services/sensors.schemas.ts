// Zod schemas for the sensor + floor-alert domain. Kept separate from the
// store modules so they can be shared by mock services, ingestion tools,
// and any future API adapter without dragging in zustand or persist.

import { z } from "zod";

/** "rfid" | "telemetry" | "energy" — the three sensor sources in the prototype. */
export const SensorSourceSchema = z.enum(["rfid", "telemetry", "energy"]);

export const SensorReadingSchema = z.object({
  id: z.string().min(1),
  source: SensorSourceSchema,
  /** machineId, lineId, bundleId, or "meter:floor-N". */
  entityId: z.string().min(1),
  metric: z.string().min(1),
  value: z.number().finite(),
  unit: z.string().min(1),
  /** ISO 8601 timestamp. */
  ts: z.string().min(1),
  /** Monotonically increasing sim tick. */
  simTick: z.number().int().nonnegative()
});

export const SensorReadingListSchema = z.array(SensorReadingSchema);

export const FloorAlertChannelSchema = z.literal("whatsapp_sim");

export const FloorAlertSeveritySchema = z.enum(["info", "warn", "critical"]);

export const FloorAlertSchema = z
  .object({
    id: z.string().min(1),
    channel: FloorAlertChannelSchema,
    /** Either one of these ids, or neither. */
    approvalId: z.string().min(1).optional(),
    insightId: z.string().min(1).optional(),
    bodyEn: z.string().min(1),
    bodyBn: z.string().min(1),
    severity: FloorAlertSeveritySchema,
    /** ISO 8601 timestamp. */
    createdAt: z.string().min(1),
    read: z.boolean()
  })
  .refine((a) => !(a.approvalId && a.insightId), {
    message: "FloorAlert must bind to at most one of approvalId or insightId"
  });

export const FloorAlertListSchema = z.array(FloorAlertSchema);

/** Inferred TS types (mirror src/data/sensors.ts and src/data/floorAlerts.ts). */
export type SensorReadingT = z.infer<typeof SensorReadingSchema>;
export type SensorSourceT = z.infer<typeof SensorSourceSchema>;
export type FloorAlertT = z.infer<typeof FloorAlertSchema>;
export type FloorAlertChannelT = z.infer<typeof FloorAlertChannelSchema>;
export type FloorAlertSeverityT = z.infer<typeof FloorAlertSeveritySchema>;
