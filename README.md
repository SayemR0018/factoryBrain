# BunonBrain — Factory Brain

> ShilpoHubBD Garment Operations AI Platform — ASP.NET Core 9 Web API + Next.js 15 React frontend.

BunonBrain is an end-to-end operations dashboard for a mid-tier Bangladeshi garment (RMG) plant. It exposes an **AI workforce** (three agents: Line Throughput, Maintenance & Uptime, Manager Orchestrator) on top of a live **Factory Brain** graph, a synthetic sensor stream (RFID bundle scans, machine telemetry, energy meter readings), and a vision-repair loop. The current build runs on deterministic mock data so the demo works with zero external accounts. Setting `LLM_API_KEY` upgrades Ask + Agent routes to live inference.

The platform now ships as two clearly separated services:

| Tier       | Runtime            | Port  | Directory            |
|------------|--------------------|-------|----------------------|
| Frontend   | Next.js 15 (React) | 3000  | (repo root)          |
| Backend    | ASP.NET Core 9     | 5000  | `FactoryBrain.Api/`  |
| Database   | PostgreSQL 16 + pgvector | 5432 | external / docker |

---

## Architecture

```
┌────────────────────────┐        ┌─────────────────────────┐        ┌──────────────────────┐
│  React 18 / Next.js 15 │  HTTP  │  ASP.NET Core 9 Web API │  NpgSQL │  PostgreSQL 16      │
│  (App Router, Zustand, │ ─────▶ │  (Swashbuckle, Fluent   │ ──────▶ │  + pgvector ext.    │
│  Tailwind, GSAP, FM)   │ :3000  │  Validation, JwtBearer, │  :5000  │  tables + vectors   │
│                        │ ◀───── │  EF Core 9, pgvector)   │         │                      │
└────────────────────────┘  rewrites /api/:path* → :5000       └──────────────┬───────────┘
                                                                              │
                                                                  Microsoft.Extensions
                                                                  HealthChecks.NpgSql
                                                                              │
                                                                              ▼
                                                                     GET /health →
                                                                       200 OK
```

**Key properties**

- **Zero frontend changes**: every client `fetch('/api/...')` is transparently proxied through `next.config.mjs → rewrites()` to the .NET backend.
- **Routing isolation**: legacy Next.js App Router route handlers live under `src/app/_api_legacy/**` (the leading underscore prevents them from registering as routes), so the rewrite is always the winner.
- **JSON contract parity**: every response shape was transcribed verbatim from the original `src/app/api/**/route.ts` modules. No schema churn for the client.

---

## Prerequisites

| Tool            | Minimum version | Notes                                                                 |
|-----------------|-----------------|-----------------------------------------------------------------------|
| .NET SDK        | 9.0.x           | `dotnet --version` to verify                                          |
| Node.js         | 20.0+           | LTS recommended                                                      |
| npm             | 9.0+            | (or `pnpm`/`yarn` — repo ships with `package-lock.json` so npm is safest) |
| PostgreSQL      | 16              | With the `vector` extension (`pgvector/pgvector:pg16` Docker image)    |
| EF Core CLI     | 9.0.x           | `dotnet tool install -g dotnet-ef` (only needed once per machine)      |
| Git             | 2.30+           | —                                                                     |

---

## Step-by-step Setup

### 1. Backend (`FactoryBrain.Api/`)

```bash
# 1a. Start PostgreSQL with pgvector
docker run --name fb-pg \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d pgvector/pgvector:pg16

# 1b. Configure environment
cd FactoryBrain.Api
cp .env.example .env
# Edit .env if you need to override FACTORYBRAIN_DB or JWT_SIGNING_KEY

# 1c. Restore, migrate, run
dotnet restore
dotnet ef migrations add Initial   # only required if schema changes
dotnet run                          # binds http://localhost:5000 (+https://localhost:5001)
```

Health probe:

```bash
curl http://localhost:5000/health     # {"status":"Healthy",…}
```

The database is auto-created and seeded on first run by `Data/DbInitializer.cs` (agents, policies, manuals → chunked → embedded → indexed, line board, sensor readings, QC defects, floor alerts, products, customers, suppliers, orders, inventory).

Swagger UI is mounted at `http://localhost:5000/swagger` in `Development` mode.

### 2. Frontend (repo root)

```bash
cd ../
npm install
npm run dev        # binds http://localhost:3000
```

The Next.js dev server proxies every `/api/*` request to the .NET backend at:

- default `http://localhost:5000/api/*`
- or `${DOTNET_API_URL}/api/*` when `DOTNET_API_URL` is set in the shell / `.env.local`

### 3. End-to-end smoke test

```bash
# Ask
curl -X POST http://localhost:3000/api/ask \
  -H "Content-Type: application/json" \
  -d '{"query":"Why is line 3 efficiency dropping?"}'

# Floor alerts (read → mark read)
curl http://localhost:3000/api/floor-alerts
curl -X PATCH http://localhost:3000/api/floor-alerts/alert-1 \
  -H "Content-Type: application/json" -d '{"read":true}'

# Morning brief
curl http://localhost:3000/api/brief/morning

# QC flag (creates Insight + ActivityEvent)
curl -X POST http://localhost:3000/api/qc/flag \
  -H "Content-Type: application/json" \
  -d '{"operation":"sewing","lineId":"line-3","defectRatePct":4.2}'

# Vision analyze
curl -X POST http://localhost:3000/api/vision/analyze \
  -H "Content-Type: application/json" \
  -d '{"sampleFile":"defect-1-stitch-skip.jpg"}'

# Agent run
curl -X POST http://localhost:3000/api/agents/maintenance-agent/run
```

(or use the Swagger UI directly at `http://localhost:5000/swagger`)

---

## API Reference

All endpoints respond with `application/json` and are exposed through the Next.js proxy at `:3000/api/*` *and* directly at `:5000/api/*`. All `PATCH`/`POST` bodies are validated by FluentValidation rules in `FactoryBrain.Api/Validators/`.

| Method | Route                                          | Purpose                                               | Request body                                              | Response                                  |
|--------|------------------------------------------------|-------------------------------------------------------|-----------------------------------------------------------|-------------------------------------------|
| POST   | `/api/ask`                                     | Run an Ask Factory Brain question (RAG + live LLM)    | `{ query, agentId?, filter? }`                            | `AskAnswerResponse` (factors, evidence, recommendation, ragHits) |
| GET    | `/api/brief/morning`                           | Deterministic morning-shift briefing                  | —                                                         | `MorningBriefResponse` (en/bn bullets, meta) |
| GET    | `/api/floor-alerts`                            | List floor alerts (newest first)                      | —                                                         | `{ simulated, source, count, alerts[] }` |
| PATCH  | `/api/floor-alerts/{id}`                       | Mark an alert read/unread                             | `{ read: boolean }`                                       | `{ ok, alert }`                            |
| GET    | `/api/line-board`                              | Current line-board snapshot                           | —                                                         | `{ rows[], meta }`                          |
| POST   | `/api/line-board/refresh`                      | Advance sim tick, then return board                   | `{ tick?: number }`                                       | same as `GET /api/line-board`              |
| GET    | `/api/qc/defects`                              | Bosch-shaped defect/rework stats                      | —                                                         | `{ operations[], topByDefectRate[], topByReworkRate[], meta }` |
| POST   | `/api/qc/flag`                                 | Flag a QC issue → new Insight + ActivityEvent        | `{ operation, lineId, defectRatePct?, reworkRatePct?, note? }` | `{ insightId, flaggedAt }`                 |
| POST   | `/api/sensors/ingest`                          | Advance simulated sensor tick, persist batch          | `{ tick?: number }`                                       | `{ simulated, source, tick, readings[], lines[], machines[] }` |
| GET    | `/api/sensors/ingest`                          | Sim buffer status                                     | —                                                         | `{ simulated, source, tick, *Count }`      |
| GET    | `/api/sensors/latest`                          | Latest reading per (source, entityId)                 | —                                                         | `{ simulated, source, count, readings[] }` |
| POST   | `/api/vision/analyze`                          | Staged VLM analysis → VisionResult + Insight + Alert  | `{ sampleFile: 'defect-1-stitch-skip.jpg' \| … }`         | `{ simulated, source, result, insight, approvalPending, approvalReason, floorAlertId, activityEventId }` |
| GET    | `/api/vision/analyze`                          | Allowed sample file list + method                     | —                                                         | `{ simulated, source, allowedSampleFiles, method }` |
| GET    | `/api/settings/llm`                            | Read non-secret LLM config status                     | —                                                         | `{ configured, provider, model, mode, persistence }` |
| POST   | `/api/settings/llm`                            | Upsert LLM provider/model/key                         | `{ provider?, apiKey?, model?, clearKey? }`               | same as `GET /api/settings/llm`            |
| GET    | `/api/agents`                                  | Roster of available agent definitions                 | —                                                         | `AgentDefinition[]`                        |
| POST   | `/api/agents/{agentId}/run`                    | Execute a single agent run (creates Insight + Alert)  | optional `{ warning?: string }` body                      | `{ source, agentId, insight, approvalPending, floorAlertId, energyInsight?, warning? }` |
| GET    | `/health`                                      | Liveness + readiness (Postgres ping)                  | —                                                         | `200 { status: Healthy }` or `503 { … }`   |

**Error envelope** (any non-2xx from the JSON API):

```json
{ "error": "invalid_body", "details": { /* validator issue list */ } }
```

Server errors follow the same shape with `error: "KeyNotFoundException"` etc.

---

## Project Layout

```
factoryBrain/
├── src/                       # Next.js frontend
│   ├── app/                   # App Router pages (pages, not API)
│   │   └── _api_legacy/       # ← archived Next.js route handlers (no longer mounted)
│   ├── components/
│   ├── store/                 # Zustand stores
│   ├── i18n/                  # bn / en bundles
│   ├── lib/
│   ├── services/              # (kept for type imports — no longer used at runtime by APIs)
│   └── data/                  # (kept as fallback / type imports)
├── next.config.mjs            # proxies /api/* → :5000
├── package.json
├── README.md
└── FactoryBrain.Api/          # ASP.NET Core 9 Web API
    ├── FactoryBrain.Api.csproj
    ├── Program.cs                       # ← entry point (DotNetEnv, EF Core, DI, CORS, /health)
    ├── appsettings.json
    ├── appsettings.Development.json
    ├── .env.example
    ├── Domain/
    │   ├── Entities/                    # 17 aggregates
    │   └── Enums/                       # 5 enums
    ├── Data/
    │   ├── FactoryBrainDbContext.cs
    │   ├── Configurations/              # Fluent API per aggregate
    │   └── DbInitializer.cs             # idempotent seed (calls Initialize(scope))
    ├── Dtos/                            # request / response records
    ├── Validators/                      # FluentValidation rules
    ├── Services/
    │   ├── Interfaces/IServiceInterfaces.cs
    │   ├── Rag/                         # TextChunker, EmbeddingService, HybridScorer, RagService
    │   ├── AskService.cs
    │   ├── BriefService.cs
    │   ├── FloorAlertService.cs
    │   ├── LineBoardService.cs
    │   ├── QcService.cs
    │   ├── SensorService.cs             # in-memory sim buffer
    │   ├── VisionService.cs
    │   ├── LlmSettingsService.cs
    │   └── AgentRunService.cs
    ├── Middleware/
    │   └── GlobalExceptionMiddleware.cs # canonical { error, details } envelope
    └── Controllers/                     # 9 controllers, route-attribute-driven
        ├── AskController.cs
        ├── BriefController.cs
        ├── FloorAlertsController.cs
        ├── LineBoardController.cs
        ├── QcController.cs
        ├── SensorsController.cs
        ├── VisionController.cs
        ├── SettingsController.cs
        └── AgentsController.cs
```

---

## Environment variables (shared)

The single `.env.example` at `FactoryBrain.Api/.env.example` documents every variable recognized by **both** runtimes. Front-end vars (`NEXT_PUBLIC_*`, `LLM_*`, `EMBEDDING_*`) are read by Next.js's `process.env`; back-end vars (`FACTORYBRAIN_DB`, `Jwt__*`, `Rag__*`, `ASPNETCORE_URLS`) are read by ASP.NET Core via DotNetEnv. `DOTNET_API_URL` is used by `next.config.mjs` to point at the .NET service.

| Var                                                | Default                                  | Read by       |
|----------------------------------------------------|------------------------------------------|---------------|
| `NEXT_PUBLIC_APP_NAME`                             | `BunonBrain`                             | Next.js (client) |
| `NEXT_PUBLIC_SHOW_ARCHITECTURE`                     | `false`                                  | Next.js (client) |
| `LLM_PROVIDER` / `LLM_API_KEY` / `LLM_MODEL`       | _(empty)_                                | Both          |
| `EMBEDDING_PROVIDER` / `EMBEDDING_API_KEY` / `_MODEL` | _(empty)_                              | Next.js (RAG) |
| `RAG_TOP_K` / `RAG_SIMILARITY_THRESHOLD` / `RAG_BM25_WEIGHT` | `4` / `0` / `0.35`             | Both          |
| `BACKEND_URL` *or* `DOTNET_API_URL`                | `http://localhost:5000`                  | Next.js (proxy target) |
| `FACTORYBRAIN_DB`                                  | `Host=localhost;Port=5432;Database=factorybrain;…` | .NET     |
| `Jwt__Issuer` / `Jwt__Audience` / `Jwt__SigningKey` | `factorybrain` / `factorybrain` / dev key | .NET        |
| `Rag__EmbeddingDimensions` / `Rag__TopK` / `Rag__SimilarityThreshold` / `Rag__Bm25Weight` | `384 / 4 / 0 / 0.35` | .NET |
| `ASPNETCORE_URLS` / `DOTNET_ENVIRONMENT`           | `http://localhost:5000` / `Development`  | .NET          |

---

## License

Proprietary — BunonBrain / ShilpoHubBD internal build. Built for the IndustrySphere AI Challenge at CloudCamp Bangladesh (International AI Builders Congress 2026).
