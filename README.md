# BunonBrain — Factory Brain for a mid-tier BD RMG plant

> One demo factory profile: BunonBrain / Factory Brain, mid-tier Bangladeshi garment plant.

BunonBrain is a Next.js 15 / TypeScript dashboard for a mid-tier Bangladeshi garment (RMG) plant. It surfaces an **AI workforce** — three agents (Line Throughput, Maintenance & Uptime, Manager Orchestrator) — built on top of a live **Factory Brain** graph and a synthetic sensor stream shaped like real RFID bundle scans, machine telemetry, and energy meter readings. The current build runs on deterministic mock data so the demo works with zero external accounts. A small live slice can be enabled by setting `LLM_API_KEY`.

Every screen, every seed record and every piece of copy in this build assumes the **same** demo plant — a mid-tier Bangladeshi garment manufacturer. Rename `NEXT_PUBLIC_APP_NAME` only if you intentionally want a different demo profile.

Built for the IndustrySphere AI Challenge at CloudCamp Bangladesh (International AI Builders Congress 2026).

---

## Stack

- **Next.js 15.0.3** (App Router) + **React 18.3** + **TypeScript 5.6** (strict)
- **Tailwind 3.4** with CSS-variable-bound tokens (theme switching without rebuilding)
- **Zustand 5** for client state (app / business / ask history / factory)
- **React Flow 11** for the Factory Brain graph
- **Framer Motion 11** for animations (respects `prefers-reduced-motion`)
- **Lucide React** icons, **clsx** + **tailwind-merge** via `cn()`
- **next-themes** + inline bootstrap script (zero-flash light/dark)
- **driver.js** for the guided product tour
- **Zod** for body validation on `/api/*`
- **Mulberry32** seeded PRNG in `data/seed.ts` — every demo run is identical
- **Bilingual EN / বাংলা** via a single typed `Dict` registry

---

## Environment variables

Copy `.env.example` to `.env.local` (or `.env`) and edit:

| Var | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SHOW_ARCHITECTURE` | `false` | When `true`, `/dev/architecture` renders the internal layer map. `/app/architecture` always 404s. |
| `NEXT_PUBLIC_APP_NAME` | `BunonBrain` | Display name in titles and the topbar. |
| `LLM_PROVIDER` | _(empty)_ | `gemini` \| `openai` \| `anthropic`. When empty, the Ask / Agent routes fall back to demo. |
| `LLM_API_KEY` | _(empty)_ | Provider API key. Server-only — never prefix `NEXT_PUBLIC_`. |
| `LLM_MODEL` | provider default | e.g. `gpt-4.1-mini`, `claude-3-5-sonnet-latest`, `gemini-1.5-pro`. |

**Demo vs LLM mode.** The app ships with all `LLM_*` unset. Every Ask BunonBrain question and every agent Run button then returns a deterministic, bilingual, evidence-cited answer drawn from the seeded dataset. The UI shows a small **"Demo"** chip on the Ask page and **"demo"** in the activity log.

When `LLM_PROVIDER` + `LLM_API_KEY` are set, `/api/ask` and `/api/agents/:agentId/run` route the request through the configured provider, validate the response with Zod, and return a structured answer. If the live call fails, the route **gracefully falls back to the demo answer** and the SSE stream emits an `event: notice` so the UI surfaces the warning inline.

---

## Features (current build)

| Area | What ships |
|---|---|
| **Onboarding** | Welcome → Profile → Connect (10 demo sources including RFID / machine telemetry / energy meter) → Understanding → Ready. |
| **Overview** | Line efficiency / active orders / machine health KPI cards, important-today + recommended-actions rows with inline approval, sources nudge when `<3` connected. |
| **Ask BunonBrain** | Bilingual streaming answer (analyzed → finding → factors → evidence → recommendation → done), suggestions, recent history, copy / regenerate / save-to-insights buttons, source-mode chip (Demo / Live). |
| **Factory Brain** | React Flow graph of 9 entity kinds (line, machine, order, buyer, supplier, process, target, compliance, risk). Hover floating card, dim unrelated nodes, search filter, freeze toggle, MiniMap, deep-link via `?node=`. Live-renders as the synthetic sensor stream updates. |
| **Insights** | Pipeline grouped by stage, filter by agent / risk, deep-link via `?focus=`, ring highlight on the target card for ~2.4 s. |
| **Agents** | Three-agent constellation — manager orchestrator routes free-text questions to the line-throughput and maintenance agents, who read factory tools (`get_line_status`, `get_machine_health`, `get_energy_usage`, `search_manual`). |
| **Approvals** | Risk-tiered pending list, keyboard shortcuts (`a` approve, `r` reject, `j`/`k` navigate), bulk-approve-low, undo toast, deep-link via `?focus=`. |
| **Activity** | Append-only audit log of every decision (user + agent), source-tagged so demo / live runs are distinguishable. |
| **Integrations** | 10 sources (RFID bundle scans, machine telemetry, energy meter, Sheets, Shopify, WhatsApp, Facebook, Instagram, CSV, Documents). Sensor sources are labelled **Simulated** with a calibration note (NASA C-MAPSS, Kaggle Bosch, UCI SECOM). |
| **Settings** | Sub-nav (Profile · Appearance · Agents · Risk · Notifications · Data · Advanced). Per-agent autonomy override, risk thresholds, notifications, import/export config JSON, restart tour, reset demo. |
| **Global search** | `⌘K` / `Ctrl+K` command palette. Index of pages, agents, insights, approvals, activity, lines, machines, suppliers, compliance docs, integrations, settings. Fuzzy match, grouped results, deep links with focus params, recent searches, suggested queries. |
| **Light + dark themes** | next-themes + inline bootstrap. No FOUC. Per-button CSS variables keep contrast ≥ 4.5:1 in both themes. |
| **Guided tour** | driver.js, fires once on first Overview visit, restartable from the help button or `/app/settings → Advanced`. |

---

## Architecture (prototype)

```
UI (Next.js App Router, Tailwind, framer-motion)
   ↓
src/services/*.service.ts        typed contracts (the seam)
   ↓
mock adapter (seeded dataset, in-memory)   ←   live LLM slice (optional)
   ↓
Zustand stores (app / business / ask history / factory, all persisted to localStorage)
```

The seed dataset is built once at module load by `src/services/dataset.ts`. **Every demo run produces the same numbers** — the same Line 3 efficiency dip, the same Bearing 2-5 trending toward failure, the same Compressor energy spike. Reset to a clean state from `/app/settings → Reset demo` (or via `localStorage`).

### Folder map

```
src/
├── app/
│   ├── page.tsx                     Landing
│   ├── api/
│   │   ├── ask/route.ts             Live Ask (mock SSE + LLM)
│   │   └── agents/[agentId]/run/    Live agent run (mock JSON + LLM)
│   ├── onboarding/                  Welcome · Profile · Connect · Understanding · Ready
│   ├── app/                         Overview · Ask · Brain · Insights · Agents · Approvals · Activity · Integrations · Settings
│   └── dev/architecture/            Internal layer map (env-gated)
├── components/
│   ├── ui/                          Button · Input · Panel · Modal · Drawer · Tooltip · Chip · RiskBadge · Skeleton · EmptyState · StatusPill · LanguageToggle · Toast
│   ├── layout/                      Sidebar · Topbar · CommandPalette · MobileShell
│   ├── agents/                      AgentAvatar · Brain3D
│   ├── brand/                       BrandMark · BrandGlyph (SVG fallback)
│   ├── insights/InsightCard.tsx
│   ├── evidence/EvidenceBlock.tsx
│   ├── activity/WhatsAppAlert.tsx
│   ├── dev/ArchitectureView.tsx
│   └── tour/Tour.tsx                driver.js wiring
├── data/                            Seed dataset (lines · machines · orders · suppliers · buyers · policies · goals)
├── services/                        Typed contracts (brain, insight, agent, approval, activity, ingestion, ask, risk, search, business, evidence, factory.tools)
├── store/                           Zustand stores (app · business · ask · factory)
├── i18n/                            en.ts · bn.ts · registry.ts
├── lib/                             format · motion · persist · cn · useT
└── config/                          tokens.ts
config/
├── model-routing.yaml               3-agent routing table
└── risk-policy.yaml                 tiers, execution caps, maintenance threshold
```

---

## Run locally

### Prerequisites

- **Node.js ≥ 18.17** (developed and verified on Node 24.x).
- **npm ≥ 9** (ships with Node 18+). Yarn or pnpm also work, but the lockfile is `package-lock.json`.
- A modern browser. The mobile shell renders at ≤ 560px.

### 1. Install

```bash
cd bunonbrain
npm install
```

### 2. (Optional) Configure the live LLM slice

```bash
cp .env.example .env.local
```

Edit `.env.local` to set `LLM_PROVIDER` and `LLM_API_KEY` if you want live answers. Otherwise skip — the demo works offline.

### 3. Start

```bash
npm run dev
```

Open **http://localhost:3000**.

### 4. Build / start production

```bash
npm run build
npm run start
```

---

## Walkthrough script (~8 minutes)

1. Landing → **Try now**.
2. Profile: industry, what you produce, buyers, goals → **Continue**.
3. Connect: tap each demo source → **Continue**.
4. Understanding: press **Begin**, watch the derivation steps.
5. Ready → **Open Factory Brain**. Hover a node, see its neighbours dim. Click any node to inspect.
6. `/app` — KPI cards, important-today, recommended-actions. Inline-approve one of the actions.
7. `/app/ask` → ask *"Why is Line 3 behind today?"* and *"লাইন ৩ কেন পিছিয়ে?"*. Watch the streaming reveal.
8. `/app/approvals` → approve / reject with keyboard (`a`, `r`, `j`, `k`).
9. `/app/insights` → click an insight to expand factors + evidence.
10. `/app/agents` → click an agent, toggle autonomy, hit **Run now**.
11. `/app/activity` — every decision logged.
12. `/app/integrations` — connect a sensor source, watch the simulated handshake animation.
13. `/app/settings` → change theme, density, risk threshold. Then **Advanced → Restart tour**.

---

## Demo hardening

- **Offline-capable**: zero env = full demo with no network.
- **Reset demo**: `/app/settings → Advanced → Reset demo` (or `localStorage.removeItem("bunonbrain:onboardedAt")` etc.).
- **Deterministic**: same dataset on every load.
- **Mobile**: every screen responsive at ≤ 560px; bottom-tab shell on `/app/**`.
- **Bilingual**: every string flows through `src/i18n/registry.ts`. Numbers / currency / dates use `Intl` with `bn-BD`.
- **Hydration-safe**: persisted state is gated behind `useMounted()`; theme bootstrap runs inline before React hydration.

---

## Privacy note

BunonBrain is a **prototype** that runs entirely in the browser. The seed dataset is committed to the repo. Nothing leaves your machine unless you set `LLM_API_KEY` and ask a question — in which case the question + a derived context pack are sent to the configured LLM provider under that provider's own terms. Connect flows write only to `localStorage`. The repo contains no real customer data.

---

## Sensor feed disclaimer

The RFID bundle-scan, machine-telemetry and energy-meter integrations are **simulated**. Patterns are calibrated against NASA C-MAPSS (motor degradation curves), Kaggle Bosch (pass/fail along a line) and UCI SECOM (multivariate sensor anomaly detection). A real pilot needs a hardware partner; this build is a credible demo of the agentic orchestration layer on top.
