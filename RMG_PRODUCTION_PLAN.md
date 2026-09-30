# BunonBrain — plan to make the service plant-ready

This document is the build plan for taking BunonBrain from a labeled demo to a service a mid-tier Bangladeshi garment plant can deploy. “Completely functional” here means: every number on screen comes from that plant, every agent run reads those records and writes a real recommendation, Ask cites documents the plant uploaded, and a person can sign in, approve, and audit the result. Demo seed, simulated ticks, and canned answers are not part of the running service.

The product today is two apps:

| Piece | Where | What it does now |
| --- | --- | --- |
| Next.js 15 UI | `src/` | Screens, Bangla/English, and a browser store of invented factory data |
| ASP.NET Core 9 API | `FactoryBrain.Backend/` | Postgres + pgvector, auth, RAG retrieve, and services that still invent or copy demo rows |
| Legacy Next routes | `src/_legacy_api/`, parts of `src/app/api/` | Old handlers. The live UI proxies `/api/*` to the .NET API |

A coding agent can change this repository. A person at the plant has to supply access, documents, and decisions. Those are marked **Human** and **Agent** on every step.

## 1. What “done” means

A plant is ready when all of the following are true:

1. A production manager signs in. There is no “Enter demo” path and no reset-demo action.
2. Overview, line board, QC, alerts, insights, approvals, and activity show only rows stored for that plant. An empty plant shows an empty state, not Line 3 or PO-4471.
3. Sensor and line numbers change only when a real ingest message arrives (RFID, machine, energy, or a file the plant sent).
4. The three agents run against those rows, call a configured model, and persist the insight they actually produced. High-risk actions wait for a human approval. Nothing is copied from a previous seed insight.
5. Ask retrieves chunks from manuals and policies that plant uploaded, embeds them with a hosted embedder, and answers from those hits. If the index is empty, Ask says so.
6. Vision accepts a photo from the floor, not a fixed sample filename, and returns a model result tied to a machine.
7. Integrations connect to systems the plant named, or they stay disconnected. A toggle in the browser does not pretend a source is live.
8. The Factory Brain graph is built from the plant’s lines, machines, orders, and suppliers.
9. English and Bangla stay on every new string.
10. The API refuses to start in Production if the database is the demo seed, the embedder is the hash stub, or `SIMULATOR_ENABLED` is on.

## 2. Inventory: every screen and where its data comes from

| Route | Screen | Data source today | Production gap |
| --- | --- | --- | --- |
| `/` | Landing | Copy in `src/i18n`. “Enter demo” calls `businessService.completeOnboarding()` and skips a real account | Replace with sign-in. Remove the static six-line sewing floor |
| `/onboarding/welcome` | Welcome | Same skip-to-demo | Becomes “sign in” or “create the first plant” |
| `/onboarding/profile` | Plant profile | Saved only in the browser (`business.store`) | Persist a Plant row on the API |
| `/onboarding/connect` | Connect sources | Local source list | Real connector setup, or a clear “not connected” |
| `/onboarding/understanding` | Understanding | Local | Drop, or show ingest progress from the API |
| `/onboarding/ready` | Ready | Local | Gate on “plant has at least one line and one user” |
| `/app` | Overview | Mix. Line board, brief, QC summary, and sensor tick call the API. Insights, approvals, activity, and revenue come from `src/data` via `dataset.ts` | One plant API. No revenue fiction unless the plant sends orders |
| `/app/approvals` | Approvals | `approvalService` / `insightService` on the in-memory dataset | Approvals table. Approve and reject hit the API and write an audit row |
| `/app/qc` | QC defects | `GET /api/qc/defects` and `POST /api/qc/flag`. Backend numbers are seeded | Defects from QC software or manual entry the plant owns |
| `/app/activity` | Activity | `activityService` plus floor alerts from the API | One audit log in Postgres |
| `/app/ask` | Ask | `POST /api/ask`. Backend can call an LLM if a key exists, and can retrieve chunks. The UI also writes insights into the local dataset | Answer and saved insight both live on the API. Empty corpus is an error state, not a canned answer |
| `/app/brain` | Factory Brain graph | `brainService` / `src/data/graph.ts`, plus `startSyntheticSensorStream` | Graph query from lines, machines, orders, suppliers |
| `/app/insights` | Insights pipeline | `insightService` on the dataset | Insights the agents and Ask actually inserted |
| `/app/agents`, `/app/agents/[id]` | Workforce | Roster from `src/data/agents.ts`. Run calls `POST /api/agents/{id}/run`, which copies the last seeded insight (`AgentRunService`, `Source: "demo"`) | Roster from the database. Run executes tools on live tables and a model |
| `/app/vision` | Vision repair | `POST /api/vision/analyze` with a sample file name. `VisionService` maps four canned filenames | Upload a photo. Call a vision model. Store the image |
| `/app/integrations` | Sources | `useBusinessStore` sources. Connect is a local flag | Credentials stored server-side. Sync jobs |
| `/app/settings` | Settings | LLM status is a real API (`/api/settings/llm`). Autonomy, risk, and reset-demo are local | Plant settings and user roles on the API. Delete reset-demo |
| `/app/architecture`, `/dev/architecture` | Internal map | Dev only | Keep off the production build |

## 3. Inventory: file groups that must change

| Group | Files | Role today | What has to happen |
| --- | --- | --- | --- |
| Demo dataset | `src/data/*.ts`, `src/services/dataset.ts` | Builds products, customers, orders, insights, activity, graph with a seeded random generator (`src/data/seed.ts`) | Not loaded by any production page. Keep only as fixtures for tests |
| Browser services | `src/services/insight.service.ts`, `approval.service.ts`, `activity.service.ts`, `agent.service.ts`, `metric.service.ts`, `brain.service.ts`, `business.service.ts`, `ingestion.service.ts` | Read and mutate that dataset | Become thin clients of the API, or be deleted |
| Browser stores | `src/store/business.store.ts`, `factory.store.ts`, `factoryBrain.live.store.ts`, `sensors.store.ts`, `floorAlerts.store.ts`, `vision.store.ts` | Persist demo profile and streams in the browser | Session and UI state only. Plant data stays on the server |
| Sensor simulation | `SensorService.cs`, `SimulatorHostedService.cs`, `src/services/sensors.server.ts`, `src/services/factory.tools.ts` | Advance a fake tick for six lines and a fixed machine list | Ingest endpoint accepts signed messages from the plant. Simulator cannot run when `ASPNETCORE_ENVIRONMENT=Production` |
| Agent run | `AgentRunService.cs`, `src/_legacy_api/agents/[agentId]/run/route.ts` | Copies the last insight for that agent and labels the source `demo` | Tool loop over real queries, model call, persisted insight |
| RAG | `FactoryBrain.Backend/FactoryBrain.Infrastructure/Rag/*`, `RagController.cs`, `src/services/rag/*`, `src/app/api/rag/*` | Chunking, hybrid retrieve, and pgvector exist. Default embedder is a hash (`HashEmbeddingService`). Corpus is seeded manuals | Plant uploads PDFs. Hosted embeddings. Reindex. Ask refuses to answer with zero hits |
| Vision | `VisionService.cs`, `src/data/vision.ts` | Four sample filenames and a fixed random seed | Image upload, model, machine id |
| Seed | `DbInitializer.cs` | On every startup, inserts agents, policies, manuals, line board, sensors, QC, alerts, orders, and demo users if empty | Production startup migrates schema only. Seed is a dev command |
| Auth | `AuthController.cs`, `AuthService.cs`, `TokenService.cs` | Login, refresh cookie, and JWT exist. No page in `src/` calls `/api/auth` | UI login, route guard, role checks on write APIs |
| Legacy API | `src/_legacy_api/**` | Archived Next handlers | Do not mount them. Delete after the .NET routes are the only implementation |

## 4. Target shape

One plant (later, many plants) in Postgres.

```
Floor devices / ERP / QC / WhatsApp
        │  signed ingest
        ▼
ASP.NET API  ──  Postgres + pgvector
        │         users, plants, lines, machines,
        │         readings, orders, defects,
        │         documents, chunks, insights,
        │         approvals, audit
        ▼
Next.js UI   (no factory numbers in the browser store)
```

Agents are three jobs with tools, not three story scripts:

| Agent | Reads | Writes | Human gate |
| --- | --- | --- | --- |
| Line Efficiency | Line output, SAM/target, WIP, order due dates | Insight: bottleneck operation and a suggested move | Auto only if the plant set risk to low. Otherwise approval |
| Maintenance & Uptime | Machine readings the plant actually sends | Insight: machine, signal, trend | Approval before any work order |
| Manager Orchestrator | The two insights above, open orders, uploaded policies | Morning brief and a recommended action | Always approval for anything that moves people or stops a line |

RAG is the document half of that:

1. A manager uploads a manual, SOP, or buyer AQL note.
2. The API extracts text, chunks it, embeds it with the configured hosted model, and stores vectors in pgvector.
3. Ask embeds the question with the same model and returns hits above the threshold.
4. The model may only use those hits plus the live rows it was given. No hit means no fabricated manual quote.

## 5. Work, in order

Each step names the handoff. Do not start a later step while the human handoff for that step is still open.

### Step 0 — Lock the first plant

**Human**

- Name the plant, lines, and machines that will be in the first release. A coding agent must not invent Line 1–6.
- Name the systems that exist: RFID or bundle scan, machine PLC or none, energy meter or none, ERP or spreadsheets, QC software or paper, WhatsApp or none, cameras or none.
- Choose the model provider and who holds the API key.
- Choose who may approve a line move (role), and which actions are forbidden to run automatically.
- Confirm Bangla source documents may be stored and embedded.

**Agent**

- Add a `Plant` aggregate and `plant_id` on every operational table.
- Write this choice into `PRODUCT.md` only after the human answers. Do not guess line counts.

### Step 1 — Stop the demo from booting

**Human**

- Provide a Postgres 16 database with the `vector` extension, and a connection string that is not the sample in `.env.example`.
- Confirm the first environment is staging, not the sewing floor, until Step 6.

**Agent**

- Split `DbInitializer` so Production runs migrations only.
- Move the current seed behind `dotnet run -- seed-demo`, never on Production startup.
- Fail Production startup when `SIMULATOR_ENABLED=true`, when the embedder is `local` or `stub`, or when `LLM_API_KEY` is empty.
- Delete “Enter demo”, “Reset demo”, simulated pills, and the static sewing-floor sample on `/` once sign-in exists.
- Keep `src/data` only under tests.

### Step 2 — Identity

**Human**

- Name the first admin email. Set the password themselves. Do not send the password to the coding agent.
- List roles: admin, production manager, supervisor, viewer.

**Agent**

- The API already has login, refresh cookie, and JWT (`AuthController`). Add a sign-in page and a guard on `/app/*` that calls it.
- Send the access token on API calls. Stop treating the browser as logged in because `onboardingComplete` is true.
- Enforce roles on `POST` and `PATCH` (approve, agent run, ingest, settings, document upload).
- Remove seeded demo users from any path that runs in Production.

### Step 3 — Plant master data

**Human**

- Deliver the line list, machine list, operations, and targets (a spreadsheet is enough). This is the handoff. The agent does not design the plant.

**Agent**

- Tables and CRUD for lines, machines, operations, and targets, scoped by `plant_id`.
- Overview and the line board read these tables. If the ingest has not arrived, the board shows the lines with status “no reading”, not a generated efficiency.
- Factory Brain graph (`/app/brain`) is a query of these rows plus orders. Remove `startSyntheticSensorStream`.

### Step 4 — Ingest real signals

**Human**

- For each source from Step 0, provide a sample payload, the network path, and who operates the device.
- If a source does not exist, say so. That card stays disconnected.

**Agent**

- Replace `SensorService` tick generation with `POST /api/ingest/{source}` that validates a signed body and inserts `SensorReading` rows.
- Derive the line board from the latest readings and the targets from Step 3. Same for QC if the plant’s payload includes defects.
- Integrations page shows the last successful message time from the database. It cannot mark a source connected by itself.
- WhatsApp, if the plant uses it, sends from the API with their Business account. The chat bubble in `WhatsAppAlert.tsx` is not a send.

### Step 5 — Working agents

**Human**

- Approve the tool list and the approval rules from Step 0.
- Provide the LLM key to the staging secret store.
- Sit one shift review: ten agent outputs, accept or reject each, before Production.

**Agent**

- Rewrite `AgentRunService.RunAsync`. It must not read the latest seeded insight and copy it.
- Give each agent tools that query only that plant’s lines, readings, orders, and open insights.
- Call the configured model with those tool results. Persist the model’s insight, confidence, and evidence ids.
- If risk is above the plant threshold, insert an `ApprovalRequest` and do not apply the action.
- Approvals page loads and writes through the API. Audit every approve and reject into the activity log.
- Morning brief is a summary of last shift’s real insights, not `BriefService` demo copy.

### Step 6 — Working RAG

**Human**

- Upload the real corpus: machine manuals, line SOPs, buyer AQL notes, and any Bangla documents that may be stored. This is the handoff. A coding agent must not generate manual text.
- Provide the embedding API key (can be the same provider as chat only if the human says so).

**Agent**

- Upload API: file in, text extracted, chunked with the existing `TextChunker`, embedded with `OpenAiEmbeddingService` or the Gemini embedder, stored on `DocumentChunk`.
- Reindex endpoint already sketched on `RagController`. Make it refuse the hash embedder in Production.
- Ask calls `RagService.RetrieveAsync` and passes hits to the model. Zero hits returns a stated empty answer.
- Remove the client RAG index (`src/services/rag`, `.cache/rag-index.json`) from the request path. One index, in Postgres.
- Settings shows provider, model, and document count. It never shows the key.

### Step 7 — Vision, only if the plant has cameras or phones

**Human**

- Say whether the first release includes photos. If not, hide `/app/vision`.
- If yes, name who captures the photo and provide a small labeled set so the prompt can be checked. Do not use the four sample filenames as production.

**Agent**

- `VisionService.Analyze` accepts an uploaded image and a machine id. It calls a vision model and stores the file outside the database (object storage the human names).
- The result is an insight plus an approval when the repair would stop a machine.

### Step 8 — Deploy

**Human**

- Domain, TLS, where Postgres runs, and who can reach the API from the floor network.
- A backup owner.
- A go / no-go after a staging week on live ingest with agents in approval-only mode.

**Agent**

- One compose or host config: API, web, Postgres with pgvector. Migrations on boot. Seed command absent.
- Health check stays `GET /health`.
- Secrets only in the host environment.
- A runbook: how to add a user, upload a manual, and see the last ingest time.

## 6. Handoff table

| ID | Human must do this before the agent continues | Agent then does this |
| --- | --- | --- |
| H0 | First plant, source list, approval rules, model vendor | Plant model and settings schema |
| H1 | Database URL for staging | Production boot without seed or simulator |
| H2 | First admin, roles | Sign-in and API authorization |
| H3 | Line, machine, and target spreadsheet | Master data API and empty line board |
| H4 | Sample payloads or “this source does not exist” | Ingest, real line board, honest integrations |
| H5 | LLM key and a shift review of 10 outputs | Real agent runs and approvals |
| H6 | Manuals and SOPs, embedding key | Upload, embed, Ask with citations |
| H7 | Vision in or out; sample photos if in | Upload and model, or hide the page |
| H8 | Host, domain, backup owner, go / no-go | Deploy config and runbook |

If a human cell is empty, the agent stops that step and asks. It does not fill the cell with demo rows.

## 7. Order of pages for the coding agent

Do not restyle while this work is in progress. Wire data, then delete the demo path.

1. Auth guard and sign-in (`src/app`, `AuthController`).
2. Stop using `dataset` on `/app`, `/app/approvals`, `/app/insights`, `/app/activity`, `/app/agents`, `/app/brain`.
3. Line board and overview from Step 3 and Step 4.
4. Agent run and approvals from Step 5.
5. Ask and document upload from Step 6.
6. Vision or hide it, Step 7.
7. Landing and onboarding lose “Enter demo”.
8. Delete or quarantine `src/data` runtime imports and `DbInitializer` production seed.

## 8. Checks before anyone calls it deployable

- New empty database, Production settings: API starts, UI signs in, every operational page is empty and says what to add.
- After the human’s spreadsheet: those lines appear, efficiencies stay blank until ingest.
- One real ingest message changes one line. A second plant id cannot read it.
- Agent run with the key set writes a new insight whose text is not in `src/data/insights.ts`.
- Agent run with the key missing fails. It does not fall back to a canned finding.
- Ask on an empty index says the library is empty.
- Ask after one uploaded SOP quotes that file and no other.
- Approve and reject appear in the activity log with the user id.
- `SIMULATOR_ENABLED=true` in Production prevents startup.
- Bangla and English both render the empty states and the new errors.

## 9. Out of scope until the plant asks

- More than one plant in the same UI.
- Automatic line balancing that moves workers without approval.
- Training a custom vision model. The first vision step is a hosted model on the plant’s photos.
- Replacing the ERP. BunonBrain reads orders the plant already has.
