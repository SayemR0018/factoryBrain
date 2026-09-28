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

### 5.6 RAG (real `/api/ask`)

The .NET 9 backend (under `FactoryBrain.Backend/`, layered into
`FactoryBrain.Domain`, `FactoryBrain.Application`,
`FactoryBrain.Infrastructure`, and `FactoryBrain.Api`) is the
authoritative retrieval path for `/api/ask` since step 46. The Next.js
frontend proxies `/api/*` to it (see `next.config.mjs`). The TypeScript
services under `src/services/rag/*` are now a **legacy offline-only
fallback** — preserved for offline tooling, not loaded by any live
route.

**Providers** (resolved at runtime; first probe wins):
- `local` — deterministic MD5-bucketed token-frequency embedder
  (default; no key required).
- `stub` — deterministic embedder for tests / smoke runs. Same model id
  as `local`, just a different namespace so reindex paths can be
  isolated.
- `openai` — hosted embeddings via `text-embedding-3-small` (1536-d).
- `gemini` — hosted embeddings via Google's `text-embedding-004`
  (768-d).

**Env var names** (the values come from your local `.env` or container
secret store — never commit):
- `RAG_EMBEDDING_PROVIDER`
- `RAG_EMBEDDING_MODEL`
- `RAG_EMBEDDING_API_KEY` (falls back to `LLM_API_KEY`)
- `RAG_EMBEDDING_DIMENSIONS`
- `RAG_HYBRID_BM25_WEIGHT`
- `RAG_HYBRID_VECTOR_WEIGHT`
- `RAG_MIN_SCORE`
- `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL` (only used for the
  optional live LLM path inside `/api/ask`; the demo deterministic
  fallback runs when these are unset)

**Endpoints** (all proxied to the backend via `next.config.mjs`):
- `POST /api/ask` — the only retrieval surface the UI uses.
- `POST /api/rag/ingest` — add a document to the index.
- `GET  /api/rag/documents` — list ingested documents.
- `POST /api/rag/reindex` — re-embed every chunk against the active
  provider.
- `GET  /api/rag/status` — current provider / model / dims / degraded
  flag.
- `GET  /api/brief/morning` — morning brief (consumes `ragHits`).

**Demo corpus.** The `manual_documents` rows the backend seeds on a
fresh database are **demo content** — `IsDemo=true` rows whose ids all
start with `demo-` (e.g. `demo-needle-breakage-sop`,
`demo-aql-2.5-sampling`, `demo-bangla-rag-faq`). They are intentionally
fictitious and are not production manuals. Replace them with real
content via `POST /api/rag/ingest` before any customer-facing
deployment.

**How to run the eval.** The golden-set eval
(`scripts/test-rag.mjs`) hits `/api/ask` on a live backend and asserts
a top-3 hit rate ≥ 0.85 across 22 questions (12 EN + 8 BN + 2
nonsense). It is wired into `npm run smoke` and also runs standalone:

```bash
RAG_EVAL_BASE_URL=http://localhost:5000 npm run test:rag
```

The eval resolves the API base URL in this order, first non-empty wins:
`RAG_EVAL_BASE_URL`, then `NEXT_PUBLIC_API_URL`, then `DOTNET_API_URL`,
then the default `http://localhost:5000`. Any trailing slash is
stripped, and the resolved URL is printed once at startup. Exit code
is non-zero on any failure or when the top-3 hit rate drops below 0.85.

**Container image.** A multi-stage `FactoryBrain.Backend/FactoryBrain.Api/Dockerfile`
ships with the repo; build it from the repo root with
`docker build -f FactoryBrain.Backend/FactoryBrain.Api/Dockerfile -t factorybrain-api:dev .`
(no deploy steps here — that's what k8s/Compose is for).

**CORS allowlist.** The API exposes a single named policy (`AllowListed`)
that reads `CORS_ORIGINS` — a comma-separated list of exact origins,
trimmed, no wildcards. When unset the default is `http://localhost:5173`
(the common Vite dev port), so a fresh checkout just-works without any
extra config. The policy allows any header, the methods
`GET / POST / PUT / PATCH / DELETE`, and credentials. Set
`CORS_ORIGINS=https://app.example.com,https://staging.example.com` in
production. Preflight (`OPTIONS`) requests are answered by the framework
before auth runs, so a browser can verify CORS even when the request
itself would 401.

**Supabase.**
- *Used today:* only `FACTORYBRAIN_DB`. The API connects to Postgres
  directly, and migrations run at startup. Use the **Session pooler**
  connection string from Supabase Connect. The host ends in
  `pooler.supabase.com`, it uses port 5432, and the username is
  `postgres.<project-ref>`. It works over IPv4, which most free
  container hosts need. Run `CREATE EXTENSION IF NOT EXISTS vector;`
  once on the database.
- The *direct* connection (`db.<project-ref>.supabase.co:5432`) is
  IPv6-only on the Free plan. Use it only if the host supports IPv6.
  Never use port 6543 (the transaction pooler).
- *Not used yet:* `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`. No Supabase client library is
  installed, so they matter only once a feature uses Supabase from the
  frontend.
- *Safety:* never commit real values, and never expose the `service_role`
  key or the DB password through `NEXT_PUBLIC_*` — anything prefixed
  `NEXT_PUBLIC_` ships to every browser that loads the page.

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

## 7. Authentication & Authorization

The .NET API adds real user accounts at step 52. The four new endpoints
sit alongside the existing admin gates — the legacy `X-Admin-Token`
header still works so a fresh deploy with no users still boots.

### 7.1 Endpoints

| Method | Route                | Body / inputs                | Result |
| ------ | -------------------- | ---------------------------- | ------ |
| POST   | `/api/auth/login`    | `{ email, password }`        | 200 `{ accessToken, expiresIn, user }` + `Set-Cookie: fb_refresh=…`. Same canonical 401 (`Invalid email or password.`) for unknown email and wrong password. Rate-limited 5/min/IP. |
| POST   | `/api/auth/refresh`  | reads `fb_refresh` cookie    | 200 `{ accessToken, expiresIn, user }` + rotated `fb_refresh` cookie. 401 + clears cookie on missing / tampered / expired. |
| POST   | `/api/auth/logout`   | reads `fb_refresh` cookie    | 204 + clears cookie. Always 204 (no-op if cookie is unknown). |
| GET    | `/api/auth/me`       | bearer access token          | 200 `{ id, email, role }`. Framework 401 on missing / tampered / expired. |

### 7.2 Tokens & cookie

- **Access token** — JWT HS256, 15-minute lifetime, claims `sub` (user
  id), `email`, `role`, `jti`. Returned in the JSON body only (never as a
  cookie). Validated by the framework's JWT bearer scheme with 30 s
  clock skew, issuer/audience both `factorybrain`.
- **Refresh token** — 32 random bytes (base64url). The cookie value is
  the raw token; the row stores `SHA-256(raw)` only — a DB leak cannot
  replay a session. Lifetime 7 days. Rotated on every successful
  refresh, so an intercepted cookie is invalidated the moment the
  legitimate caller rotates it.
- **`fb_refresh` cookie** — `HttpOnly`, `Path=/api/auth`, `SameSite=Lax`
  by default (override via `AUTH_COOKIE_SAMESITE=Strict|None`; `None`
  forces `Secure=true`). `Secure=true` outside Development.

### 7.3 Admin authorization policy

The three write actions — `POST /api/settings/llm`, `POST /api/rag/reindex`,
`POST /api/rag/ingest` — are gated by **both** `[AdminToken]` (legacy
`X-Admin-Token` header) and `[Authorize(Policy = AdminOrLegacyToken)]`
(new JWT path). The policy succeeds when:

1. The bearer token's role claim is `Admin`, OR
2. The legacy `X-Admin-Token` header matches `ADMIN_API_TOKEN`
   (constant-time compare), OR
3. The process is in Development (the `[AdminToken]` filter short-
   circuits and the policy delegates the same way).

A Viewer-role JWT fails the policy with the framework's 403 problem
details. A missing / tampered JWT + no legacy header returns the
legacy `{error: "AdminTokenMissing"}` envelope.

**TODO(54c):** drop the legacy `X-Admin-Token` path entirely and make
JWT role Admin the only path.

### 7.4 Login rate limit

`POST /api/auth/login` is the only action rate-limited: fixed window,
5 requests / minute / client IP. The 6th request gets a 429
`application/problem+json` envelope with a `Retry-After: 60` header.
`UseForwardedHeaders` runs before the limiter so a properly-configured
proxy (`FORWARDED_HEADERS_ENABLED=true` + `TRUSTED_PROXIES=…`)
partitions on the real client IP; a spoofed header from an untrusted
IP is ignored.

### 7.5 Forwarded headers (proxy support)

Set `FORWARDED_HEADERS_ENABLED=true` ONLY when the API sits behind a
reverse proxy. `TRUSTED_PROXIES` is a comma-separated list of IPs
and/or CIDRs (e.g. `10.0.0.0/8,192.168.1.1`) — an empty list logs a
startup warning and trusts `X-Forwarded-For` from ANY sender, which
means anyone who can reach the API directly can spoof their client IP
and bypass the login rate limit. Only leave the list empty when the
API is reachable exclusively through the proxy; bad entries fail
startup with the entry name in the message.

### 7.6 Environment variables (names only — no values)

| Name                       | Where it's read                       | Purpose |
| -------------------------- | ------------------------------------- | ------- |
| `JWT_SIGNING_KEY`          | `Program.cs`                          | HS256 secret (≥ 32 UTF-8 bytes). REQUIRED in Production; missing/short fails startup. In Development a random 32-byte key is generated (tokens don't survive a restart). |
| `AUTH_COOKIE_SAMESITE`     | `AuthController`                      | `Lax` (default) / `Strict` / `None`. Bad values fail startup. `None` forces `Secure=true`. |
| `SEED_ADMIN_EMAIL`         | `DbInitializer.SeedAdminUserAsync`    | Optional. Seeds an Admin user on first migration (only when no user with the same lowercased email exists). |
| `SEED_ADMIN_PASSWORD`      | same                                  | Required alongside `SEED_ADMIN_EMAIL`; both unset = no-op. |
| `FORWARDED_HEADERS_ENABLED`| `Program.cs`                          | `true` activates `UseForwardedHeaders`. Default off. |
| `TRUSTED_PROXIES`          | `Program.cs`                          | Comma-separated IPs / CIDRs. Empty = log warning, trust `X-Forwarded-For` from any sender (safe only when the API is reachable exclusively through the proxy). Bad entries fail startup with the entry name in the message. |

## 8. Realtime (SignalR)

### 8.1 Hub

- Path: `/hubs/factory` (mapped via `app.MapHub<FactoryHub>`).
- Server-to-client only — `FactoryHub : Hub` has no client-callable methods.
- Auth: `[Authorize]` on the hub class. Anonymous negotiate → 401; a WebSocket can never be established without a valid access token (any role).
- The token can travel two ways:
  - `Authorization: Bearer <jwt>` header on the HTTP/1.1 upgrade (works for non-browser clients).
  - `?access_token=<jwt>` query string on the URL — required for browsers because they cannot set headers on a WebSocket upgrade request.
- The query-string fallback is **only** enabled for paths under `/hubs/`. Every other route keeps header-only auth, so `GET /api/auth/me?access_token=…` is rejected with 401.
- `access_token` query values are consumed by `JwtBearerEvents.OnMessageReceived` and never reach the hub method, the access log, or the request log.

### 8.2 Events

| Event name           | Trigger                                            | Payload DTO                                            |
| -------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| `sensorReading`      | Successful `POST /api/sensors/ingest`              | `IngestResponse` (same body the REST endpoint returns) |
| `lineBoardUpdated`   | Successful `POST /api/line-board/refresh`          | `LineBoardResponse` (same body the REST endpoint returns) |
| `floorAlert`         | `FloorAlertService.PushAsync` writes a new alert    | `FloorAlert` entity                                    |

Implementation seam: `IRealtimeNotifier` (Application layer) → `SignalRRealtimeNotifier` (Api layer, `IHubContext<FactoryHub>`). Services call the abstraction after the DB write succeeds; a notifier failure is logged and never fails the REST request.

### 8.3 Simulator (optional background service)

When `SIMULATOR_ENABLED=true`, `SimulatorHostedService` drives the live event stream without any REST traffic:

- Every **5 s** → `ISensorService.IngestAsync(Tick: null)` → `sensorReading` event.
- Every **30 s** → `ILineBoardService.RefreshAsync(null)` → `lineBoardUpdated` event.

`SIMULATOR_SEED` (optional int) makes the sensor RNG deterministic — same seed → same first N readings (after ignoring timestamps and ids). Unset → random seed logged once at startup. Invalid values fail startup with the entry name in the message. The service short-circuits when `SIMULATOR_ENABLED` is unset or `false`, so default deployments never run it.

### 8.4 Reverse proxy

A reverse proxy in front of the API **must** forward WebSocket upgrades on `/hubs/`. `nginx` example:

```
location /hubs/ {
    proxy_pass http://api:5000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

Without the `Upgrade`/`Connection` headers the negotiate succeeds but the WebSocket transport falls back to long-polling or fails outright.

> The `meta.source` field on `LineBoardResponse` was retargeted to
> `FactoryBrain.Infrastructure/Services/SensorService` in step 53
> (was `FactoryBrain.Api/Services/SensorService` from the pre-split
> codebase). This is the only intentional response-shape difference
> vs `b57e837`.

> The `users` table is created by the `20260928192118_AddUsers` EF
> migration (step 52). After `Database.Migrate()` the `__ef_migrations`
> history table has 5 rows.

---

*Pair with `JUDGES.md` for the live walkthrough, `README.md` for stack
and run commands, and `src/services/*.server.ts` for the actual data
contracts.*