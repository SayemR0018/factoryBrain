# HANDOFF.md — BunonBrain / Factory Brain

> One demo factory profile: **BunonBrain / Factory Brain, mid-tier BD RMG plant.**
> Every screen, every seed record, and every copy string assumes this single profile.

This document is the **what + where** map for the next engineer who has to
keep building on top of BunonBrain. Pair it with **JUDGES.md** at the repo
root — that file is the *8-minute walkthrough* you run during a live demo.

---

## 1. Architecture (short)

```
                ┌──────────────────────────────────────────────────────┐
                │                Next.js 15 (App Router)                │
                │                React 18 · TypeScript strict           │
                │                                                      │
   UI (client)  │   /app  /app/insights  /app/approvals  /app/brain    │
   components ──┤   /app/ask  /app/qc  /app/integrations  /app/agents │
                │                                                      │
                ├────────────── route handlers (Node runtime) ─────────┤
                │   /api/sensors/ingest  /api/sensors/latest            │
                │   /api/floor-alerts  /api/floor-alerts/:id            │
                │   /api/vision/analyze  /api/line-board               │
                │   /api/line-board/refresh  /api/brief/morning         │
                │   /api/qc/defects  /api/qc/flag                       │
                │   /api/ask  /api/agents/:agentId/run                 │
                │   /api/settings/llm                                   │
                ├────────────── services (server-only) ─────────────────┤
                │   sensors.server · floorAlerts.server                 │
                │   lineBoard.server · brief.server · qc.defects.server │
                │   run.persistence · factory.tools · ingestion.service │
                ├────────────── domain data (deterministic) ────────────┤
                │   dataset.ts · seed.ts · qc.defects.ts · manuals.ts  │
                │   vision.ts · sensors.ts · conversations.ts          │
                ├────────────── client stores (Zustand) ─────────────────┤
                │   app · business · factoryBrain.live · ask · factory │
                └────────────── shared lib ─────────────────────────────┘
                            │                       │
                            ▼                       ▼
                ┌──────────────────┐    ┌──────────────────────┐
                │  LLM (optional)  │    │   Simulated feeds    │
                │  OpenAI · Gemini │    │   PRNG over          │
                │  Anthropic       │    │   public-dataset-    │
                │  (env-driven)    │    │   shaped baselines   │
                └──────────────────┘    └──────────────────────┘
```

**Read order if you've never seen this repo before**

1. `JUDGES.md` — 8-min walkthrough. It is the *behavioural* source of truth.
2. `README.md` — stack overview, run commands.
3. `src/data/seed.ts` — every demo number is derived from this PRNG.
4. `src/store/business.store.ts` — integrations, risk thresholds, autonomy.
5. `src/services/run.persistence.ts` — how a run becomes an Insight + Approval.

---

## 2. API map

All routes live under `src/app/api/**/route.ts`. Every handler is
`runtime = "nodejs"` + `dynamic = "force-dynamic"` + `Cache-Control: no-store`,
and every request body is Zod-strict.

| Method | Route                              | Owner service                          | Notes |
| ------ | ---------------------------------- | -------------------------------------- | ----- |
| POST   | `/api/sensors/ingest`              | `sensors.server.ts` → `advanceSim()`   | Optional `{ tick?: number }`; advances the shared sim buffer used by `/app` Overview's live tick. |
| GET    | `/api/sensors/ingest`              | same                                   | Convenience snapshot — tick + readings. |
| GET    | `/api/sensors/latest`              | `sensors.server.ts` → `listLatestReadings()` | Latest `SensorReading` per (source, entityId). |
| GET    | `/api/floor-alerts`                | `floorAlerts.server.ts`                | Stream of supervisor alerts (whatsapp_sim). |
| PATCH  | `/api/floor-alerts/[id]`           | same                                   | Update alert state (e.g. ack / dismiss). |
| POST   | `/api/vision/analyze`              | inline + vision dataset                | Upload a defect photo → classification + Bangla/English repair note. |
| GET    | `/api/vision/analyze`              | same                                   | Staged demo image catalogue for the upload UI. |
| GET    | `/api/line-board`                  | `lineBoard.server.ts` → `buildLineBoard()` | Six rows derived from current seed + latest sensor summaries. |
| POST   | `/api/line-board/refresh`          | same                                   | Optional `{ tick?: number }`; advances sim, returns board. |
| GET    | `/api/brief/morning`               | `brief.server.ts` → `buildMorningBrief()` | Date + EN/BN bullets + top bottleneck + risk/approval counts. |
| GET    | `/api/qc/defects`                  | `qc.defects.server.ts` → `buildQcDefects()` | 6 ops × 6 lines × 8 weeks + top-5 by defect/rework. |
| POST   | `/api/qc/flag`                     | `insightService.upsertCustom()`        | `{ operation, lineId, defectRatePct?, reworkRatePct?, note? }` → idempotent Insight + Activity log. |
| POST   | `/api/ask`                         | `ask.service.ts`                       | Question + scope → streamed finding, factors, evidence, recommendation. |
| POST   | `/api/agents/[agentId]/run`        | `run.persistence.ts` → `persistAgentRun()` | Drives an agent run, persists Insight + Activity + Floor alert. |
| GET    | `/api/settings/llm`                | inline                                 | Returns non-secret LLM status only (configured / provider / model / mode). |
| POST   | `/api/settings/llm`                | inline                                 | Upserts `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL`. Writes `.env.local` in dev; in prod it only mutates the running process and tells you to set the key in the Vercel project env. |

> **Smoke contract.** Every route above is exercised by `scripts/smoke.mjs`
> with file-shape + runtime contract checks (status codes, schema fields,
> determinism across two calls). The same script also seeds a `qc/flag`
> idempotence test against `insightService.upsertCustom`.

---

## 3. Environment variables (names only — no values)

All env names below are **non-secret** identifiers. The only secret in the
project is `LLM_API_KEY`, and it is server-only: never logged, never echoed
back, never persisted in the browser, Zustand, cookies, or the URL. See
`src/app/api/settings/llm/route.ts` for the runtime contract.

| Name                       | Where it's read                                         | Purpose |
| -------------------------- | ------------------------------------------------------- | ------- |
| `NODE_ENV`                 | `next.config.mjs`, settings/llm                         | Standard Next.js switch. |
| `VERCEL` / `VERCEL_ENV`    | settings/llm                                            | Tells the LLM settings route to skip `.env.local` writes and direct users at the Vercel project env. |
| `LLM_PROVIDER`             | settings/llm, agents/run, ask                           | One of `openai` · `gemini` · `anthropic`. Defaults to `openai` on first configure. |
| `LLM_API_KEY`              | settings/llm, agents/run, ask                           | Server-only. Never returned by `GET /api/settings/llm`; only its `configured` boolean. |
| `LLM_MODEL`                | settings/llm, agents/run, ask                           | Provider-specific. Defaults to `gpt-6-luna` for `openai`. |
| `NEXT_PUBLIC_APP_NAME`     | layout, landing                                         | Display name only — leave unset to keep the demo factory profile. |
| `NEXT_PUBLIC_SHOW_ARCHITECTURE` | `src/app/dev/architecture/page.tsx`                | `true` reveals the dev-only architecture diagram. Off by default. |

> Never paste a real `LLM_API_KEY` into a commit, a log, or the smoke
> output. The smoke script deliberately exercises the "no `apiKey`
> substring in any response JSON" contract — keep it that way.

---

## 4. What is Simulated today

Everything in the demo is **synthetic and deterministic**. The build runs
on `Mulberry32` (`src/data/seed.ts`) seeded from a stable base, so two
calls in the same day return identical numbers (only `meta.generatedAt`
differs between consecutive calls). Each simulated surface is labelled
**Simulated** in the UI and carries a calibration hint pointing at the
public dataset it was shaped against.

| Surface                             | Simulated how                                                           | Public-dataset anchor |
| ----------------------------------- | ----------------------------------------------------------------------- | --------------------- |
| Live sensor stream (RFID, telemetry, energy) | `src/data/sensors.ts` + `sensors.server.ts → advanceSim()`              | NASA C-MAPSS · UCI SECOM |
| Line-board rows                     | `lineBoard.server.ts` derives from `seed.ts` + latest sensor summaries  | Kaggle Bosch |
| Morning brief                       | `brief.server.ts → buildMorningBrief()` — deterministic over line-board + pending approvals + insights | — |
| QC defects / rework                 | `qc.defects.server.ts → buildQcDefects()` — 6 ops × 6 lines × 8 weeks, per-cell PRNG | Bosch-shaped defect taxonomy |
| Energy duty recommendation          | `factory.tools.recommend_energy_duty` — pure rule, no RL               | — |
| Vision repair classifier            | `vision.ts` lookup table — Bangla + English repair notes per defect class | Public defect-image catalogues |
| Ask BunonBrain                      | Deterministic fallback in `ask.service.ts`; calls the LLM only when `LLM_API_KEY` is set | — |
| Insights + Approvals + Activity     | Generated client-side from the synthetic dataset; agent runs persist via `run.persistence.ts` | — |

> The Simulated label is non-negotiable. If you swap a piece for a real
> integration, also rewrite the label in the same patch.

---

## 5. Next human work

These are the four bridges between "demo runs entirely on synthetic data"
and "real pilot in a mid-tier BD RMG plant". Each block lists what the
demo has today and the smallest change required to flip it live.

### 5.1 Vercel (deployment + durable env)

**Today.** `npm run build` + `npm run start` works locally. `settings/llm`
writes `.env.local` in dev and only mutates `process.env` in prod.

**Next.** Wire a Vercel project with:
- `LLM_PROVIDER`, `LLM_MODEL`, `LLM_API_KEY` set in the project's
  environment (Production + Preview).
- A `bunonbrain-storage` Upstash Redis (or Vercel KV) for the sim buffer
  (`globalThis.__factoryBrainSimState` in `sensors.server.ts`) so ticks
  survive cold starts. Today it is module-scoped and resets on every
  redeploy — fine for a demo, wrong for production.
- Cron: a Vercel Cron that POSTs `/api/sensors/ingest` every N seconds,
  replacing the on-page `useLiveIngest` polling loop.

### 5.2 Supabase / Redis (real persistence)

**Today.** Zustand `persist` writes the browser profile to `localStorage`.
The in-memory dataset is rebuilt on every cold start. No shared state
between machines.

**Next.** Replace `src/store/business.store.ts` `localStorage` writes with
either:
- **Supabase** for the relational surface (profile, thresholds, sources,
  saved insights, approvals history, activity log) — schema mirrors the
  current Zustand shape plus a `user_id` column.
- **Redis** for the high-churn surface (live sensor buffer, floor-alert
  queue, ask history TTL). `services/sensors.server.ts` and
  `services/floorAlerts.server.ts` are the only two places that own
  module-scoped mutable state today — both are written to read from the
  cache, not the module.

### 5.3 Real RAG (manuals + policies + WhatsApp queue)

**Today.** Manual citations (`EvidenceBlock`) point at `src/data/manuals.ts`
rows. Ask's "evidence" references the same in-memory dataset.

**Next.**
- **Indexing.** Chunk `manuals.pdf` + uploaded policies + WhatsApp
  conversation transcripts into a vector store (pgvector on Supabase, or
  Upstash Vector). Embed with the same provider chosen for `LLM_PROVIDER`
  to keep key management in one place.
- **Retrieval.** Replace `src/services/evidence.service.ts`'s in-memory
  filter with a hybrid search (BM25 over the chunks + vector ANN). Cite
  with the same `EvidenceRefPublic` shape so the UI doesn't have to change.
- **Ingestion.** The Documents / CSV / Google Sheets flows already exist
  in `src/services/ingestion.service.ts`; the missing piece is a
  `documents/chunked` route that pushes new content into the vector store
  on connect + on a scheduled re-embed.

### 5.4 VLM (vision-to-repair)

**Today.** `src/app/api/vision/analyze/route.ts` looks up the closest
defect class in `vision.ts` and returns the canned repair note. No model
is called.

**Next.** Call a vision-language model (`gpt-4-vision`, `gemini-1.5-pro`,
or `claude-3-sonnet`) when `LLM_PROVIDER` is set. Keep the deterministic
fallback path so demo mode still works without keys. The route already
parses Bangla + English in one pass; only the inference call and the
prompt template need to land.

### 5.5 WhatsApp (alerts + queue ingest)

**Today.** Supervisor alerts render from `src/services/floorAlerts.server.ts`
on the `whatsapp_sim` channel. Conversation transcripts live in
`src/data/conversations.ts`.

**Next.**
- **Outbound.** Wire the WhatsApp Business Cloud API; replace the
  `pushFloorAlert` console write in `floorAlerts.server.ts` with an HTTPS
  POST to the Business API. The schema (`whatsapp_sim` payloads) is already
  the right shape — only the transport changes.
- **Inbound.** Add a `/api/whatsapp/webhook` route that verifies the Meta
  signature, normalises incoming messages into the same shape as
  `conversations.ts`, and feeds them into the activity log + Ask evidence.

---

## 6. Where to start tomorrow

1. **Run the demo yourself first.** `npm install && npm run build && npm run start`,
   then walk through **JUDGES.md** step by step. Eight minutes; it
   surfaces every intentional surface (and every intentional gap).
2. **Skim `scripts/smoke.mjs`.** It's a tour of the public contract: every
   route that exists, every schema field that's non-negotiable, every
   i18n key the UI relies on.
3. **Pick one of §5.1–§5.5.** Each section is small enough to land in a
   single PR. None of them touch the demo flow you just walked through —
   the Simulated labels and the synthetic dataset stay as the default.
4. **Update `JUDGES.md` last.** If the walkthrough changes because a piece
   went live, the judges' script has to change too. Keep them in sync.

---

*Pair with `JUDGES.md` for the live walkthrough, `README.md` for stack
and run commands, and `src/services/*.server.ts` for the actual data
contracts.*