// POST /api/agents/:agentId/run
// Triggers a single agent run. When LLM_PROVIDER + LLM_API_KEY are set, the
// route forwards a structured prompt to the model and validates the response.
// Otherwise it returns a deterministic "demo run" payload — the UI just shows
// a chip, and the activity log gets a real entry either way.

import { NextRequest } from "next/server";
import { z } from "zod";
import { dataset } from "@/services/dataset";
import { agentService } from "@/services/agent.service";
import { insightService } from "@/services/insight.service";

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

  // Synthesise a fresh insight for this run.
  const insightId = `ins-run-${agentId}-${Date.now().toString(36)}`;
  const factorSeed = pickInsightFactors(agent.id);

  if (!live) {
    return Response.json({
      source: "demo",
      agentId,
      insightId,
      title: `${agent.name} produced a draft insight`,
      finding: factorSeed.finding,
      confidence: 0.7
    });
  }

  try {
    const prompt = buildPrompt(agent, factorSeed);
    const raw = await dispatch(prompt);
    const parsed = parseRun(raw, agent.id, insightId);
    return Response.json({ source: "live", ...parsed });
  } catch (err) {
    console.error("[agent-run] live model failed, returning demo", err);
    return Response.json({
      source: "demo",
      agentId,
      insightId,
      warning: "Live model unavailable, showing demo insight.",
      title: `${agent.name} produced a draft insight`,
      finding: factorSeed.finding,
      confidence: 0.6
    });
  }
}

function pickInsightFactors(agentId: string): { finding: string } {
  // Borrow a recent insight that matches this agent for context.
  const match = dataset.insights.find((i) => i.agentId === agentId);
  if (match) return { finding: match.finding };
  return { finding: "Agent produced no observations in this window." };
}

function buildPrompt(agent: { id: string; name: string; purpose: string }, seed: { finding: string }) {
  return [
    "You are THALAMUS. Produce one short, actionable insight in JSON.",
    JSON.stringify({
      insightId: "string",
      title: "string (≤ 80 chars)",
      finding: "string (one sentence)",
      confidence: 0.7
    }),
    `Agent: ${agent.name} (${agent.id})`,
    `Purpose: ${agent.purpose}`,
    `Latest known signal: ${seed.finding}`
  ].join("\n\n");
}

function parseRun(raw: string, agentId: string, fallbackId: string) {
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    return {
      agentId,
      insightId: parsed.insightId ?? fallbackId,
      title: String(parsed.title ?? ""),
      finding: String(parsed.finding ?? raw.slice(0, 240)),
      confidence: Number(parsed.confidence ?? 0.6)
    };
  } catch {
    return {
      agentId,
      insightId: fallbackId,
      title: "Agent produced an insight",
      finding: raw.slice(0, 240),
      confidence: 0.5
    };
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