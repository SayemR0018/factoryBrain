// POST /api/agents/:agentId/run
// Triggers a single agent run. When LLM_PROVIDER + LLM_API_KEY are set, the
// route forwards a structured prompt to the model and validates the response.
// Otherwise it returns a deterministic "demo run" payload — the UI just shows
// a chip, and the activity log gets a real entry either way.

import { NextRequest } from "next/server";
import { dataset } from "@/services/dataset";
import { agentService } from "@/services/agent.service";
import { factoryTools } from "@/services/factory.tools";
import { buildRunDraft, persistAgentRun, type RunInsightInput } from "@/services/run.persistence";

export const runtime = "nodejs";

const PROVIDER = process.env.LLM_PROVIDER?.trim();
const KEY = process.env.LLM_API_KEY?.trim();
const MODEL = process.env.LLM_MODEL?.trim() || defaultModel();
const live = Boolean(PROVIDER && KEY);

function defaultModel(): string {
  switch (PROVIDER) {
    case "openai":
      return "gpt-4.1-mini";
    case "anthropic":
      return "claude-3-5-sonnet-latest";
    case "gemini":
      return "gemini-1.5-pro";
    default:
      return "";
  }
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await ctx.params;
  const agent = agentService.get(agentId);
  if (!agent) {
    return Response.json({ error: "agent_not_found", agentId }, { status: 404 });
  }

  if (!live) {
    // Persist via the same persistence helpers as the live branch.
    const persisted = persistDemoRun(agent.id, agent.name);
    return Response.json({ source: "demo", agentId, ...persisted });
  }

  try {
    const seed = pickInsightFactors(agent.id);
    const prompt = buildPrompt(agent, seed);
    const raw = await dispatch(prompt);
    const draft = adaptLiveRaw(raw, agent.id, agent.name, seed);
    // Enrich with manual citations: the LLM may have surfaced its own
    // `manuals` rows in `evidence`, but we always merge in any titles we
    // can match via the search_manual tool as a safety net.
    const manualHits = factoryTools.search_manual(seed.finding, { limit: 2 }).hits;
    if (manualHits.length) {
      draft.evidence = [
        ...(draft.evidence ?? []),
        {
          domain: "manuals",
          count: manualHits.length,
          filter: { source: "search_manual", agentId: agent.id },
          previewIds: manualHits.map((h) => h.id)
        }
      ];
    }
    const persisted = persistAgentRun(agent.id, agent.name, draft, { source: "live" });
    return Response.json({ source: "live", agentId, ...persisted });
  } catch (err) {
    console.error("[agent-run] live model failed, returning demo", err);
    const persisted = persistDemoRun(agent.id, agent.name, "Live model unavailable, showing demo insight.");
    return Response.json({ source: "demo", agentId, warning: "Live model unavailable, showing demo insight.", ...persisted });
  }
}

/** Demo fallback: persists a structured insight (risk-tiered for the
 *  maintenance agent, bottleneck recommendation for the line/throughput
 *  agent) drawn from the existing insight seeds + the factory graph.
 *  When the seeded insight title pulls up relevant manual docs (via the
 *  `search_manual` tool), the persisted evidence array includes a `manuals`
 *  row — the same corpus the Ask page surfaces. */
function persistDemoRun(agentId: string, agentLabel: string, warning?: string) {
  const match = dataset.insights.find((i) => i.agentId === agentId);
  const seedTitle = match?.title ?? `${agentLabel} produced a draft insight`;
  const seedTitleBn = match?.titleBn ?? `${agentLabel} একটি খসড়া অন্তর্দৃষ্টি তৈরি করেছে`;
  const seedFinding = match?.finding ?? "Agent produced no observations in this window.";
  const seedFindingBn = match?.findingBn ?? "এই উইন্ডোতে এজেন্ট কোন পর্যবেক্ষণ দেয়নি।";
  const seedAction = match?.recommendation.action ?? "Open the brief and approve the suggested next step.";
  const seedActionBn = match?.recommendation.actionBn ?? "ব্রিফ খুলুন এবং প্রস্তাবিত পরবর্তী পদক্ষেপ অনুমোদন দিন।";
  const seedRisk = match?.recommendation.riskTier ?? "medium";
  const seedConfidence = match?.confidence ?? 0.7;

  // Pull manual citations relevant to the insight title; the `search_manual`
  // tool already rank-orders by token overlap. Cap to two so the evidence
  // row stays readable.
  const locale: "en" | "bn" = /[\u0980-\u09FF]/.test(seedTitle) ? "bn" : "en";
  const manualHits = factoryTools.search_manual(seedTitle, { locale, limit: 2 }).hits;

  const draft: RunInsightInput = buildRunDraft(agentId, agentLabel, {
    title: seedTitle,
    titleBn: seedTitleBn,
    finding: warning ? `${seedFinding} (${warning})` : seedFinding,
    findingBn: seedFindingBn,
    action: seedAction,
    actionBn: seedActionBn,
    riskTier: seedRisk,
    confidence: seedConfidence
  });

  // If manuals surfaced for this seed title, attach a `manuals` evidence
  // row so downstream consumers (Manager agent feed, EvidenceBlock) can
  // render the citations. Leave the rest of the evidence handling to
  // `gatherStoreEvidence()` when the draft's evidence is empty.
  if (manualHits.length) {
    draft.evidence = [
      ...(draft.evidence ?? []),
      {
        domain: "manuals",
        count: manualHits.length,
        filter: { source: "search_manual", agentId },
        previewIds: manualHits.map((h) => h.id)
      }
    ];
  }

  return persistAgentRun(agentId, agentLabel, draft, { source: "demo" });
}

function pickInsightFactors(agentId: string): { finding: string } {
  // Borrow a recent insight that matches this agent for context.
  const match = dataset.insights.find((i) => i.agentId === agentId);
  if (match) return { finding: match.finding };
  return { finding: "Agent produced no observations in this window." };
}

function buildPrompt(agent: { id: string; name: string; purpose: string }, seed: { finding: string }) {
  // Pull a couple of manual hits so the LLM can cite them by `doc-N` id.
  const manualHits = factoryTools.search_manual(seed.finding, { limit: 3 }).hits
    .map((h) => ({ id: h.id, title: h.title, snippet: h.snippet, source: h.source }));
  return [
    "You are BunonBrain. Produce one short, actionable insight in JSON.",
    "You may cite manuals by setting `evidence` rows with `domain: \"manuals\"` and `previewIds: [\"doc-N\", ...]`.",
    JSON.stringify({
      title: "string (≤ 200 chars)",
      titleBn: "string (≤ 200 chars, Bangla)",
      finding: "string (one sentence, English)",
      findingBn: "string (one sentence, Bangla)",
      recommendation: {
        title: "string",
        titleBn: "string",
        action: "string (the concrete next step)",
        actionBn: "string (Bangla)",
        riskTier: "low|medium|high",
        targetStage: "suggested|pending_approval"
      },
      evidence: [{ domain: "orders|customers|products|inventory|conversations|policies|suppliers|manuals", count: 0 }],
      confidence: 0.7
    }),
    `Agent: ${agent.name} (${agent.id})`,
    `Purpose: ${agent.purpose}`,
    `Latest known signal: ${seed.finding}`,
    `Available manual citations: ${JSON.stringify(manualHits)}`
  ].join("\n\n");
}

/** Adapt the live model's raw text into the structured RunInsightInput that
 *  `persistAgentRun` validates. Falls back to the seed + raw text on parse
 *  failure so the route always emits something persistable. */
function adaptLiveRaw(
  raw: string,
  agentId: string,
  agentLabel: string,
  seed: { finding: string }
): RunInsightInput {
  const fallback: RunInsightInput = buildRunDraft(agentId, agentLabel, {
    title: `${agentLabel} produced a draft insight`,
    titleBn: `${agentLabel} একটি খসড়া অন্তর্দৃষ্টি তৈরি করেছে`,
    finding: raw.slice(0, 240) || seed.finding,
    findingBn: seed.finding,
    action: "Open the brief and approve the suggested next step.",
    actionBn: "ব্রিফ খুলুন এবং প্রস্তাবিত পরবর্তী পদক্ষেপ অনুমোদন দিন।",
    riskTier: "medium",
    confidence: 0.6
  });

  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    const rec = parsed.recommendation ?? {};
    return {
      title: String(parsed.title ?? fallback.title),
      titleBn: String(parsed.titleBn ?? parsed.title ?? fallback.titleBn),
      finding: String(parsed.finding ?? fallback.finding),
      findingBn: String(parsed.findingBn ?? parsed.finding ?? fallback.findingBn),
      recommendation: {
        title: String(rec.title ?? agentLabel),
        titleBn: String(rec.titleBn ?? rec.title ?? agentLabel),
        action: String(rec.action ?? fallback.recommendation.action),
        actionBn: String(rec.actionBn ?? rec.action ?? fallback.recommendation.actionBn),
        riskTier: (rec.riskTier ?? "medium") as RunInsightInput["recommendation"]["riskTier"],
        targetStage: (rec.targetStage ?? "pending_approval") as RunInsightInput["recommendation"]["targetStage"]
      },
      confidence: Number(parsed.confidence ?? fallback.confidence),
      evidence: Array.isArray(parsed.evidence) ? parsed.evidence : undefined
    };
  } catch {
    return fallback;
  }
}

async function dispatch(prompt: string): Promise<string> {
  switch (PROVIDER) {
    case "openai":
      return openai(prompt);
    case "anthropic":
      return anthropic(prompt);
    case "gemini":
      return gemini(prompt);
    default:
      throw new Error(`Unknown provider: ${PROVIDER}`);
  }
}

async function openai(prompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const j = (await res.json()) as any;
  return j.choices?.[0]?.message?.content ?? "";
}

async function anthropic(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": KEY!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 512, messages: [{ role: "user", content: prompt }] })
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const j = (await res.json()) as any;
  return j.content?.[0]?.text ?? "";
}

async function gemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(KEY!)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2 } })
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const j = (await res.json()) as any;
  return j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}