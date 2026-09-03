# THALAMUS — Business Brain for Bangladesh SMEs

> Understands your business, then assembles the AI that runs it.

THALAMUS is a Next.js 15 / TypeScript dashboard for Bangladesh retail SMEs. It surfaces an **AI workforce** — seven agents (Sales, Marketing, Inventory, Customer Success, Finance, Policy, Automation) — built on top of a live **Business Brain** graph. The current build runs on deterministic mock data so the demo works with zero external accounts. A small live slice can be enabled by setting `LLM_API_KEY`.

Built per the *Schrödinger's Lab Whitepaper* (BCOLBD 2026). This repository is the **prototype**; the production backend behind the service seam is the **target**.

---

## Stack

- **Next.js 15.0.3** (App Router) + **React 18.3** + **TypeScript 5.6** (strict)
- **Tailwind 3.4** with CSS-variable-bound tokens (theme switching without rebuilding)
- **Zustand 5** for client state (app / business / ask history)
- **React Flow 11** for the Business Brain graph
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
| `NEXT_PUBLIC_APP_NAME` | `THALAMUS` | Display name in titles and the topbar. |
| `LLM_PROVIDER` | _(empty)_ | `gemini` \| `openai` \| `anthropic`. When empty, the Ask / Agent routes fall back to demo. |
| `LLM_API_KEY` | _(empty)_ | Provider API key. Server-only — never prefix `NEXT_PUBLIC_`. |
| `LLM_MODEL` | provider default | e.g. `gpt-4.1-mini`, `claude-3-5-sonnet-latest`, `gemini-1.5-pro`. |

**Demo vs LLM mode.** The app ships with all `LLM_*` unset. Every Ask Thalamus question and every agent Run button then returns a deterministic, bilingual, evidence-cited answer drawn from the seeded dataset. The UI shows a small **"Demo"** chip on the Ask page and **"demo"** in the activity log.

When `LLM_PROVIDER` + `LLM_API_KEY` are set, `/api/ask` and `/api/agents/:agentId/run` route the request through the configured provider, validate the response with Zod, and return a structured answer. If the live call fails, the route **gracefully falls back to the demo answer** and the SSE stream emits an `event: notice` so the UI surfaces the warning inline.

---

## Features (current build)

| Area | What ships |
|---|---|
| **Onboarding** | Welcome → Profile → Connect (7 demo sources with real per-source input forms) → Understanding (7 derivation steps) → Ready. |
| **Overview** | Revenue / customers / inventory KPI cards, important-today + recommended-actions rows with inline approval, sources nudge when `<3` connected. |
| **Ask Thalamus** | Bilingual streaming answer (analyzed → finding → factors → evidence → recommendation → done), suggestions, recent history, copy / regenerate / save-to-insights buttons, source-mode chip (Demo / Live). |
| **Business Brain** | React Flow graph with hover floating card, dim unrelated nodes on hover, node size by importance, search filter, freeze toggle, MiniMap, deep-link via `?node=`. |
| **Insights** | Pipeline grouped by stage, filter by agent / risk, deep-link via `?focus=`, ring highlight on the target card for ~2.4 s. |
| **Agents** | Constellation canvas — Brain mascot at the centre, seven agent nodes in a radial layout with curved bezier connectors, hover lifts + dims, click opens a Drawer with autonomy toggle (auto / approval / paused) and Run Now. |
| **Approvals** | Risk-tiered pending list, keyboard shortcuts (`a` approve, `r` reject, `j`/`k` navigate), bulk-approve-low, undo toast, deep-link via `?focus=`. |
| **Activity** | Append-only audit log of every decision (user + agent), source-tagged so demo / live runs are distinguishable. |
| **Integrations** | 7 sources (Sheets, Shopify, WhatsApp, Facebook, Instagram, CSV, Documents). Connect form per source, demo data shortcut, disconnect confirmation, live sync. |
| **Settings** | Sub-nav (Profile · Appearance · Agents · Risk · Notifications · Data · Advanced). Per-agent autonomy override, risk thresholds, notifications, import/export config JSON, restart tour, reset demo. |
| **Global search** | `⌘K` / `Ctrl+K` command palette. 13-kind index (pages, agents, insights, approvals, activity, products, customers, suppliers, policies, workflows, goals, risks, integrations, settings). Fuzzy match, grouped results, deep links with focus params, recent searches, suggested queries. |
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
Zustand stores (app / business / ask history, all persisted to localStorage)
```

The seed dataset is built once at module load by `src/services/dataset.ts`. **Every demo run produces the same numbers** — the same Dhaka dip, the same two critical stockouts, the same repeat-purchase decline. Reset to a clean state from `/app/settings → Reset demo` (or via `localStorage`).

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
│   ├── insights/InsightCard.tsx
│   ├── evidence/EvidenceBlock.tsx
│   └── tour/Tour.tsx                driver.js wiring
├── data/                            Seed dataset (products · customers · orders · suppliers · policies · conversations · goals · agents · analytics)
├── services/                        Typed contracts (brain, insight, agent, approval, activity, ingestion, ask, risk, search, business, evidence)
├── store/                           Zustand stores
├── i18n/                            en.ts · bn.ts · registry.ts
├── lib/                             format · motion · persist · cn · useT
└── config/                          tokens.ts
config/
├── model-routing.yaml
└── risk-policy.yaml
```

---

## Run locally

### Prerequisites

- **Node.js ≥ 18.17** (developed and verified on Node 24.x).
- **npm ≥ 9** (ships with Node 18+). Yarn or pnpm also work, but the lockfile is `package-lock.json`.
- A modern browser. The mobile shell renders at ≤ 560px.

### 1. Install

```bash
cd thalamus
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
2. Profile: industry, what you sell, customers, goals → **Continue**.
3. Connect: tap each demo source → **Continue**.
4. Understanding: press **Begin**, watch the seven derivation steps.
5. Ready → **Open Business Brain**. Hover a node, see its neighbours dim. Click any node to inspect.
6. `/app` — KPI cards, important-today, recommended-actions. Inline-approve one of the actions.
7. `/app/ask` → ask *"Why did sales drop this month?"* and *"গত মাসে বিক্রি কমল কেন?"*. Watch the streaming reveal.
8. `/app/approvals` → approve / reject with keyboard (`a`, `r`, `j`, `k`).
9. `/app/insights` → click an insight to expand factors + evidence.
10. `/app/agents` → click an agent, toggle autonomy, hit **Run now**.
11. `/app/activity` — every decision logged.
12. `/app/integrations` — connect a new source, watch the handshake animation.
13. `/app/settings` → change theme, density, risk threshold. Then **Advanced → Restart tour**.

---

## Demo hardening

- **Offline-capable**: zero env = full demo with no network.
- **Reset demo**: `/app/settings → Advanced → Reset demo` (or `localStorage.removeItem("thalamus:onboardedAt")` etc.).
- **Deterministic**: same dataset on every load.
- **Mobile**: every screen responsive at ≤ 560px; bottom-tab shell on `/app/**`.
- **Bilingual**: every string flows through `src/i18n/registry.ts`. Numbers / currency / dates use `Intl` with `bn-BD`.
- **Hydration-safe**: persisted state is gated behind `useMounted()`; theme bootstrap runs inline before React hydration.

---

## Privacy note

THALAMUS is a **prototype** that runs entirely in the browser. The seed dataset is committed to the repo. Nothing leaves your machine unless you set `LLM_API_KEY` and ask a question — in which case the question + a derived context pack are sent to the configured LLM provider under that provider's own terms. Connect flows write only to `localStorage`. The repo contains no real customer data.
