// Persistence for an agent run: produces a typed Insight (risk-tiered or
// bottleneck recommendation, depending on agent), elevates it into the
// pending-approval queue when warranted, fires a FloorAlert on the
// whatsapp_sim channel, and logs an ActivityEvent. Reuses the existing
// Zod schemas + types from `src/services/sensors.schemas.ts` and the
// shared InsightPublic shape from `src/services/types.ts`.

import { z } from "zod";
import { dataset } from "./dataset";
import { insightService } from "./insight.service";
import { activityService } from "./activity.service";
import { pushFloorAlert } from "./floorAlerts.server";
import type {
  InsightPublic,
  RiskTier,
  Stage,
  EvidenceRefPublic
} from "./types";

/** Validation shape for the structured Insight a run produces. Matches
 *  InsightPublic exactly; this is here so anything that *comes from the LLM*
 *  is validated before it lands in the dataset. */
export const RunInsightShape = z.object({
  title: z.string().min(1).max(200),
  titleBn: z.string().min(1).max(200),
  finding: z.string().min(1).max(2000),
  findingBn: z.string().min(1).max(2000),
  recommendation: z.object({
    title: z.string().min(1).max(200),
    titleBn: z.string().min(1).max(200),
    action: z.string().min(1).max(1000),
    actionBn: z.string().min(1).max(1000),
    riskTier: z.enum(["low", "medium", "high"]),
    targetStage: z.enum(["suggested", "pending_approval", "executing", "done", "logged", "rejected", "failed"])
  }),
  confidence: z.number().min(0).max(1),
  evidence: z
    .array(
      z.object({
        domain: z.enum([
          "orders",
          "customers",
          "products",
          "inventory",
          "conversations",
          "policies",
          "suppliers"
        ]),
        count: z.number().int().nonnegative(),
        filter: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
        previewIds: z.array(z.string()).optional()
      })
    )
    .optional()
});

export type RunInsightInput = z.infer<typeof RunInsightShape>;

export type PersistedRun = {
  insight: InsightPublic;
  approvalPending: boolean;
  approvalReason?: string;
  floorAlertId?: string;
  activityEventId: string;
};

const FACTORY_TOOL_DOMAINS = ["orders", "inventory"] as const;

/** Pull machine/line evidence from the graph (machine nodes + line risk
 *  nodes) so the persisted insight isn't just text — it cites real entities
 *  in the store. Returns previewIds only; the dataset graph is the source. */
function gatherStoreEvidence(agentId: string): EvidenceRefPublic[] {
  const out: EvidenceRefPublic[] = [];
  try {
    const graph = dataset.graph;
    const machineIds = graph.nodes.filter((n) => n.kind === "machine").slice(0, 4).map((n) => n.id);
    const lineIds = graph.nodes.filter((n) => n.kind === "line").slice(0, 3).map((n) => n.id);
    const riskIds = graph.nodes.filter((n) => n.kind === "risk").slice(0, 3).map((n) => n.id);

    if (agentId === "maintenance-agent") {
      out.push({
        domain: "inventory",
        count: machineIds.length,
        filter: { source: "machine_telemetry", machinesAtRisk: riskIds.length },
        previewIds: machineIds.length ? machineIds : undefined
      });
      if (lineIds.length) {
        out.push({
          domain: "orders",
          count: lineIds.length,
          filter: { linesAffected: lineIds.length },
          previewIds: lineIds
        });
      }
    } else if (agentId === "line-throughput-agent") {
      out.push({
        domain: "orders",
        count: lineIds.length,
        filter: { source: "rfid_bundles", window: "2h" },
        previewIds: lineIds
      });
      if (machineIds.length) {
        out.push({
          domain: "inventory",
          count: machineIds.length,
          previewIds: machineIds.slice(0, 4)
        });
      }
    } else {
      // Generic fallback — same shape, generic filter.
      out.push({
        domain: "orders",
        count: lineIds.length + machineIds.length,
        filter: { window: "run" }
      });
    }
  } catch {
    // Graph may be lazily unavailable on the server; fall back to the two
    // shared domains so the insight is still emitted.
    FACTORY_TOOL_DOMAINS.forEach((d) => out.push({ domain: d, count: 0 }));
  }
  return out;
}

/** Heuristic: an action is warranted (and should enter the approval queue) when
 *  the recommendation riskTier is medium or high, OR when the agent is
 *  maintenance/line-throughput with confidence above 0.6. */
function shouldRequireApproval(input: RunInsightInput, agentId: string): boolean {
  if (input.recommendation.riskTier !== "low") return true;
  if (input.confidence >= 0.6 && (agentId === "maintenance-agent" || agentId === "line-throughput-agent")) {
    return true;
  }
  return false;
}

/** Persist a run result: insight → maybe-pending-approval → FloorAlert →
 *  ActivityEvent. Idempotent on the insight id (re-uses insightService.upsertCustom). */
export function persistAgentRun(
  agentId: string,
  agentLabel: string,
  rawInsight: unknown,
  opts?: { stage?: Stage; source?: "demo" | "live" }
): PersistedRun {
  const parsed = RunInsightShape.parse(rawInsight);
  const insightId = `ins-run-${agentId}-${Date.now().toString(36)}`;
  const stage: Stage = opts?.stage ?? (shouldRequireApproval(parsed, agentId) ? "pending_approval" : "suggested");

  const evidence =
    parsed.evidence && parsed.evidence.length > 0
      ? parsed.evidence
      : gatherStoreEvidence(agentId);

  const inserted = insightService.upsertCustom({
    id: insightId,
    agentId,
    agentLabel,
    title: parsed.title,
    titleBn: parsed.titleBn,
    finding: parsed.finding,
    findingBn: parsed.findingBn,
    recommendation: {
      ...parsed.recommendation,
      targetStage: stage
    },
    confidence: parsed.confidence
  });
  // Stamp persisted stage + evidence on the dataset entry. The dataset is
  // shared by reference with `insightService.upsertCustom`, so this mutates
  // the same row the approval/feed services read from.
  const live = dataset.insights.find((i) => i.id === insightId);
  if (live) {
    live.stage = stage;
    live.evidence = evidence;
  }

  const approvalPending = stage === "pending_approval";
  let approvalReason: string | undefined;
  let floorAlertId: string | undefined;

  if (approvalPending) {
    approvalReason = `Auto-queued by ${agentLabel} run (risk ${parsed.recommendation.riskTier}, confidence ${parsed.confidence.toFixed(2)}).`;
    // Floor alert on the whatsapp_sim channel, bound to the insight id.
    const alert = pushFloorAlert({
      id: `alert-run-${Date.now().toString(36)}`,
      channel: "whatsapp_sim",
      insightId,
      bodyEn: parsed.recommendation.action,
      bodyBn: parsed.recommendation.actionBn,
      severity: parsed.recommendation.riskTier === "high" ? "critical" : "warn",
      createdAt: new Date().toISOString(),
      read: false
    });
    floorAlertId = alert.id;
  }

  const verb =
    approvalPending
      ? `raised insight awaiting approval (${parsed.recommendation.riskTier})`
      : stage === "suggested"
      ? "raised insight"
      : `${stage.replace(/_/g, " ")}`;
  const verbBn =
    approvalPending
      ? "অনুমোদনের অপেক্ষায় অন্তর্দৃষ্টি উত্থাপন করেছে"
      : stage === "suggested"
      ? "অন্তর্দৃষ্টি উত্থাপন করেছে"
      : `${stage}`;

  const activityEventId = activityService.push({
    actor: agentId,
    actorLabel: agentLabel,
    verb,
    verbBn,
    target: parsed.title,
    targetBn: parsed.titleBn,
    outcome: approvalPending ? "flagged" : "completed",
    isoDate: new Date().toISOString()
  });

  return {
    insight: live ?? inserted,
    approvalPending,
    approvalReason,
    floorAlertId,
    activityEventId
  };
}

/** Compose a per-agent Insight draft from current store + sensor summaries. */
export function buildRunDraft(
  agentId: string,
  agentLabel: string,
  lean: { title: string; titleBn: string; finding: string; findingBn: string; action: string; actionBn: string; riskTier: RiskTier; confidence: number }
): RunInsightInput {
  return {
    title: lean.title,
    titleBn: lean.titleBn,
    finding: lean.finding,
    findingBn: lean.findingBn,
    recommendation: {
      title: agentLabel,
      titleBn: agentLabel,
      action: lean.action,
      actionBn: lean.actionBn,
      riskTier: lean.riskTier,
      targetStage: "pending_approval"
    },
    confidence: lean.confidence
  };
}
