// Typed "MCP-style" tool surface for the three factory agents.
// Each tool returns a deterministic JSON-serialisable payload so the Ask page
// can stream them into the answer, and so every tool call shows up in the
// Approvals/Activity views.

import type { FactoryLine, FactoryMachine } from "@/store/factory.store";
import { dataset } from "@/services/dataset";
import { getManualCorpus } from "@/data/manuals";
import type { DocSourceT, ManualDocT } from "@/services/sensors.schemas";

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
  hits: Array<{
    id: string;
    title: string;
    /** English or Bangla excerpt (locale inferred from the query shape). */
    snippet: string;
    /** "manual" or "sensor_log". */
    source: DocSourceT;
    /** 0..1 ranking score, used by Ask/Manager agent for ordering. */
    score: number;
    /** Any tags that contributed to the ranking. */
    matchedTags?: string[];
  }>;
};

type SearchHit = ManualSearchTool["hits"][number];

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

  search_manual(query: string, opts?: { limit?: number; locale?: "en" | "bn" }): ManualSearchTool {
    const q = query.trim().toLowerCase();
    const locale: "en" | "bn" = opts?.locale ?? "en";
    const limit = opts?.limit ?? 5;
    if (!q) return { query, hits: [] };

    // Tokenise once. Bengali words don't have whitespace inside the seeded
    // bodies, but we keep the regex split generic for forward-compat.
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);

    // Walk the canonical corpus + still consult legacy `dataset.policies` for
    // backward compatibility. Manual hits dominate; policies surface only when
    // they're truly relevant.
    const manuals = getManualCorpus();
    type ScoredManual = SearchHit & { _raw: ManualDocT };
    const scored: ScoredManual[] = manuals.map((doc) => {
      const titleEn = doc.titleEn.toLowerCase();
      const titleBn = doc.titleBn.toLowerCase();
      const bodyEn = doc.bodyEn.toLowerCase();
      const bodyBn = doc.bodyBn.toLowerCase();

      let score = 0;
      const matched: string[] = [];

      for (const t of tokens) {
        if (!t) continue;
        if (titleEn.includes(t) || titleBn.includes(t)) {
          score += 3;
        }
        if (bodyEn.includes(t) || bodyBn.includes(t)) {
          score += 1;
          // Bangla-prefixed body hits get a small extra boost so the demo
          // surfaces them consistently when the user wrote in Bangla.
          if (bodyBn.includes(t)) score += 0.5;
        }
        if (doc.tags.some((tag) => tag === t || tag.includes(t))) {
          score += 2;
          matched.push(t);
        }
      }

      // Pick the best locale's snippet for the hit. Falls back to English.
      const useBn = locale === "bn" || titleBn.includes(q);
      const snippet = (useBn ? doc.bodyBn : doc.bodyEn).slice(0, 160);

      return {
        id: doc.id,
        title: useBn ? doc.titleBn : doc.titleEn,
        snippet,
        source: doc.source,
        score: Math.round(score * 100) / 100,
        matchedTags: matched.length ? matched : undefined,
        _raw: doc
      };
    });

    // Strip the internal `_raw` projection from manual hits before they
    // touch the public surface.
    const cleanManuals: SearchHit[] = scored.map(({ _raw, ...rest }) => {
      void _raw;
      return rest;
    });

    // Fallback: surface a couple of legacy policies so the tool never returns
    // empty for queries that mention "policy" / "compliance".
    const policyFallback: SearchHit[] = dataset.policies
      .filter((p) => tokens.some((t) => p.title.toLowerCase().includes(t) || p.body.toLowerCase().includes(t)))
      .slice(0, 2)
      .map((p) => ({
        id: p.id,
        title: p.title,
        snippet: p.body.slice(0, 140),
        source: "manual" as DocSourceT,
        score: 0.1,
        matchedTags: undefined
      }));

    const merged = [...cleanManuals, ...policyFallback]
      .filter((h) => h.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return { query, hits: merged };
  }
};
