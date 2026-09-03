// Live Ask Thalamus endpoint.
// When LLM_PROVIDER + LLM_API_KEY are set, the route forwards the question +
// a context pack to the model and adapts the response to the streaming shape
// the UI expects. Otherwise the demo mock is used.

import { NextRequest } from "next/server";
import { z } from "zod";
import { askService } from "@/services/ask.service";
import { insightService } from "@/services/insight.service";
import { agentService } from "@/services/agent.service";
import type { AskAnswer, StreamChunk, RiskTier } from "@/services/types";

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

const BodySchema = z.object({
  query: z.string().min(1).max(2000),
  agentId: z.string().min(1).max(64).optional()
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "invalid_body", issues: parsed.error.issues }, { status: 400 });
  }

  const query = parsed.data.query;
  const agentId = parsed.data.agentId;
  const pack = askService.buildContextPack(query);
  // When an agent is pre-selected, seed the demo stream with that agent's
  // most recent insight so the answer is visibly tailored.
  if (agentId) {
    const agentInsights = insightService.feed({ agentId });
    if (agentInsights.length > 0) {
      (pack as any).agentInsight = agentInsights[0];
      (pack as any).agentName = agentService.get(agentId)?.name ?? agentId;
    }
  }

  if (!live) {
    return mockStream(pack, agentId);
  }

  try {
    const answer = await callModel(pack);
    return Response.json(answer);
  } catch (err) {
    // Live failed — fall back to the deterministic mock so the UI never breaks.
    console.error("[ask] live model failed, falling back to demo", err);
    return mockStream(pack, agentId, { warning: "Live model unavailable, showing demo answer." });
  }
}

function mockStream(pack: { query: string; agentInsight?: any; agentName?: string }, agentId?: string, note?: { warning: string }) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      if (note) {
        controller.enqueue(encoder.encode(`event: notice\ndata: ${JSON.stringify(note)}\n\n`));
      }
      for await (const chunk of askService.stream(pack as any)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }
      // When an agent is targeted, append a small "agent note" so the UI can
      // surface that the answer came from a specific sub-agent.
      if (agentId && pack.agentInsight) {
        controller.enqueue(
          encoder.encode(
            `event: agent\ndata: ${JSON.stringify({ agentId, agentName: pack.agentName, insightId: pack.agentInsight.id })}\n\n`
          )
        );
      }
      controller.enqueue(encoder.encode("event: end\ndata: {}\n\n"));
      controller.close();
    }
  });
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" }
  });
}

async function callModel(pack: { query: string; health: unknown; relevantInsights: any[] }): Promise<AskAnswer> {
  const prompt = buildPrompt(pack);
  const raw = await dispatch(prompt);
  return adapt(raw, pack);
}

function buildPrompt(pack: { query: string; health: unknown; relevantInsights: any[] }) {
  return [
    "You are THALAMUS, a business-intelligence assistant for a Bangladesh retail SME.",
    "Answer the user's question using the context pack below.",
    "Return ONLY JSON matching this shape:",
    JSON.stringify(
      {
        taskId: "string",
        finding: "string (one sentence, plain language, can be Bangla if question is Bangla)",
        findingBn: "string (Bangla version of the finding)",
        factors: [
          { label: "string", labelBn: "string", magnitude: "string", magnitudeBn: "string" }
        ],
        evidence: [{ domain: "orders|customers|products|inventory|conversations|policies|suppliers", count: 0 }],
        recommendation: {
          title: "string",
          titleBn: "string",
          action: "string",
          actionBn: "string",
          riskTier: "low|medium|high"
        },
        confidence: 0.7
      },
      null,
      0
    ),
    "Question: " + pack.query,
    "Health: " + JSON.stringify(pack.health),
    "Relevant insights: " + JSON.stringify(pack.relevantInsights.map((i) => ({ id: i.id, title: i.title, finding: i.finding })))
  ].join("\n\n");
}

function adapt(raw: string, pack: { query: string }): AskAnswer {
  let parsed: any;
  try {
    // Pull the JSON object out of any prose.
    const m = raw.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : raw);
  } catch {
    // Couldn't parse — wrap the prose as the finding.
    return {
      taskId: "live-" + Date.now(),
      analyzed: [],
      finding: raw.slice(0, 240),
      findingBn: raw.slice(0, 240),
      factors: [],
      evidence: [],
      recommendation: {
        title: "Review the raw model answer",
        titleBn: "কাঁচা উত্তর পর্যালোচনা",
        action: raw.slice(0, 240),
        actionBn: raw.slice(0, 240),
        riskTier: "low" as RiskTier
      },
      createdAt: new Date().toISOString(),
      confidence: 0.5
    };
  }
  return {
    taskId: parsed.taskId ?? "live-" + Date.now(),
    analyzed: (parsed.analyzed ?? []) as AskAnswer["analyzed"],
    finding: String(parsed.finding ?? ""),
    findingBn: String(parsed.findingBn ?? parsed.finding ?? ""),
    factors: parsed.factors ?? [],
    evidence: parsed.evidence ?? [],
    recommendation: {
      title: String(parsed.recommendation?.title ?? ""),
      titleBn: String(parsed.recommendation?.titleBn ?? parsed.recommendation?.title ?? ""),
      action: String(parsed.recommendation?.action ?? ""),
      actionBn: String(parsed.recommendation?.actionBn ?? parsed.recommendation?.action ?? ""),
      riskTier: (parsed.recommendation?.riskTier ?? "low") as RiskTier
    },
    createdAt: new Date().toISOString(),
    confidence: Number(parsed.confidence ?? 0.6)
  };
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
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const json = (await res.json()) as any;
  return json.choices?.[0]?.message?.content ?? "";
}

async function anthropic(prompt: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": KEY!,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}`);
  const json = (await res.json()) as any;
  return json.content?.[0]?.text ?? "";
}

async function gemini(prompt: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(KEY!)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });
  if (!res.ok) throw new Error(`gemini ${res.status}`);
  const json = (await res.json()) as any;
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}
