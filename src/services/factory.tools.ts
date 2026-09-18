// Typed "MCP-style" tool surface for the three factory agents.
// Each tool returns a deterministic JSON-serialisable payload so the Ask page
// can stream them into the answer, and so every tool call shows up in the
// Approvals/Activity views.

import type { FactoryLine, FactoryMachine } from "@/store/factory.store";
import { dataset } from "@/services/dataset";

/** Lazily resolve factory store so server bundle never touches zustand directly. */
function state() {
  const mod = require("@/store/factory.store") as typeof import("@/store/factory.store");
  return mod.useFactoryStore.getState();
}

export type LineStatusTool = {
  line: FactoryLine;
  bottleneck: string;
  ordersAtRisk: number;
};

export type MachineHealthTool = {
  machine: FactoryMachine;
  rulEstimate: number; // remaining useful life in days (C-MAPSS-shaped)
  reason: string;
};

export type EnergyUsageTool = {
  lineId: string;
  windowHours: number;
  totalKwh: number;
  baselineKwh: number;
  deltaPct: number;
};

export type ManualSearchTool = {
  query: string;
  hits: Array<{ id: string; title: string; snippet: string }>;
};

export const factoryTools = {
  get_line_status(lineId?: string): LineStatusTool[] {
    const s = state();
    const lines = lineId ? s.lines.filter((l) => l.id === lineId) : s.lines;
    return lines.map((line) => {
      const ordersAtRisk = s.orders.filter(
        (o) => o.lineId === line.id && o.risk !== "healthy"
      ).length;
      const bottleneck = line.status === "down"
        ? "Line stopped — last stop cause: power fault"
        : line.efficiency < line.targetEfficiency - 0.05
        ? `${line.process} operation below SAH target by ${Math.round((line.targetEfficiency - line.efficiency) * 100)}%`
        : `${line.process} on target`;
      return { line, bottleneck, ordersAtRisk };
    });
  },

  get_machine_health(machineId?: string): MachineHealthTool[] {
    const s = state();
    const machines = machineId
      ? s.machines.filter((m) => m.id === machineId)
      : s.machines.filter((m) => m.status !== "healthy");
    return machines.map((m) => {
      // C-MAPSS-shaped RUL estimate (very rough, just for the demo).
      const rul = Math.max(0, Math.round((100 - m.wearIndex) * 1.6));
      const reason = m.vibration > 5.5
        ? `Vibration ${m.vibration} mm/s exceeds threshold`
        : m.temperature > 75
        ? `Bearing temp ${m.temperature}°C trending up`
        : m.wearIndex > 60
        ? `Wear index ${m.wearIndex}/100 over baseline`
        : "Within baseline";
      return { machine: m, rulEstimate: rul, reason };
    });
  },

  get_energy_usage(timeframe: "1h" | "24h" | "7d" = "1h"): EnergyUsageTool[] {
    const s = state();
    const windowHours = timeframe === "1h" ? 1 : timeframe === "24h" ? 24 : 24 * 7;
    return s.lines.map((line) => {
      const baseline = 24 * windowHours; // ~24 kWh baseline per hour per line
      const variance = (Math.random() - 0.5) * 0.18;
      const total = Math.max(0, Math.round(baseline * (1 + variance) * 100) / 100);
      const baselineKwh = Math.round(baseline * 100) / 100;
      const deltaPct = Math.round(((total - baselineKwh) / baselineKwh) * 1000) / 10;
      return { lineId: line.id, windowHours, totalKwh: total, baselineKwh, deltaPct };
    });
  },

  search_manual(query: string): ManualSearchTool {
    const q = query.trim().toLowerCase();
    if (!q) return { query, hits: [] };
    const hits = dataset.policies
      .map((p) => ({
        id: p.id,
        title: p.title,
        snippet: p.body.slice(0, 140)
      }))
      .filter((h) => h.title.toLowerCase().includes(q) || h.snippet.toLowerCase().includes(q))
      .slice(0, 5);
    return { query, hits };
  }
};
