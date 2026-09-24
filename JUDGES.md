# JUDGES.md — BunonBrain walkthrough (~8 minutes)

This is the script the judges can follow end-to-end. It walks every screen
in the order a real floor manager would hit them: land on the page, drop
into the demo, see the live line board + morning brief, tick the
simulator, drive an agent, look at the floor alert, run the vision
analyser, ask a question, peek at QC, and (optionally) wire a live LLM.
Every step points at a **Simulated** label where synthetic data is in
play — the demo never pretends to be live.

Open <http://localhost:3000> (or the deployed URL).

> Demo factory profile: **BunonBrain / Factory Brain, mid-tier BD RMG plant.**
> Every screen, seed record, and copy assumes this single profile.
> Set `NEXT_PUBLIC_APP_NAME` only if you intentionally want a different one.
>
> Pair this script with **HANDOFF.md** at the repo root — it carries the
> architecture diagram, the API map, env-var names, and the
> Simulated-vs-Next-work split.

---

## 0. Landing → Enter demo (~20s)

1. Open `/`.
2. Click the **Enter demo** primary CTA (top-right and bottom of the
   landing page). Both links go straight to `/app` — no forced onboarding.
3. The landing CTAs **do not require an account, an LLM key, or any
   external source**. The whole app runs on synthetic data.

---

## 1. Overview at `/app` — Line Board + Morning brief + Energy (~60s)

The Overview page is the home base. It's the only page that re-renders
on every Simulate tick. Read top-to-bottom:

1. **Demo path strip** — five chips (`Simulate tick`, `Run agents`,
   `Floor alerts`, `Vision`, `Ask`). These are shortcuts to the rest of
   the demo.
2. **Morning brief card** (Step 1 in the path). Locale-aware bullets in
   English + বাংলা. Top bullet deep-links to the bottleneck line via
   `/app/brain?node=<lineId>`. Footer chips count pending approvals and
   risks. A `Demo · no LLM` chip keeps the honesty label visible.
3. **Business health** — revenue / customers / inventory health, with the
   30-day trend sparkline.
4. **Factory Brain — live tick** — five KPIs and the **Simulate tick**
   button. Each press POSTs `/api/sensors/ingest` and bumps the shared
   sim tick in `useFactoryBrainLiveStore`. Everything else on `/app`
   re-renders on the same tick (Line Board, QC, Brief, Energy).
5. **Live line board** — six lines, traffic-light bottleneck
   (`green` / `amber` / `red`), efficiency vs SAH with a target tick,
   WIP and NPT minutes. A `Simulated` pill sits in the header right.
6. **QC defects & rework** — top operations by defect rate or rework
   rate (toggle), per-row 8-week sparkline, **Flag issue** button that
   POSTs `/api/qc/flag` and persists a real Insight via
   `insightService.upsertCustom()`. A "Demo · no LLM" chip stays
   visible.
7. **Energy duty recommendation** — deterministic rule (no RL), carries a
   `Simulated · not RL` pill. Shows current vs recommended compressor
   duty and expected kWh saved over the next hour.
8. **Important today + Recommended actions** — pinned insights and
   pending approvals with inline approve buttons.
9. **Recent activity** — every decision lands here.

> **Honesty contract.** Every synthetic surface carries a Simulated label.
> If a chip or pill is missing, that's a bug — file it.

---

## 2. Simulate tick (~30s)

1. On `/app`, scroll to the **Factory Brain — live tick** panel.
2. Press **Simulate tick** three or four times. Each press:
   - Pushes one new RFID bundle / machine telemetry / energy meter
     reading through `POST /api/sensors/ingest`.
   - Updates the **Live tick** card (readings, latest sources).
   - Refreshes the Line Board, QC panel, and BriefCard via the shared
     `useFactoryBrainLiveStore` tick subscription.
3. The **Energy duty recommendation** card directly below the live-tick
   panel recomputes deterministically:
   - Current vs recommended compressor duty (0–100 %).
   - Expected kWh saved over the next hour.
   - Inline rationale, tinted by risk tier.
   - A "Simulated · not RL" pill — the score is a **transparent
     deterministic rule** (avg `deltaPct` from per-line energy totals +
     peak/median ratio from the latest energy `SensorReading`s). No ML,
     no reinforcement learning.

---

## 3. Agents (~60s)

1. Sidebar → **Agents**.
2. Open the **Maintenance & Uptime** agent detail, click **Run now**.
   - An Insight appears under `/app/insights` with risk tier `medium` or
     `high` (depending on the score) and lands in `/app/approvals`.
   - Activity gets a new entry tagged `maintenance-agent`.
3. Open the **Line Throughput** agent detail, click **Run now**.
   - A bottleneck-recommendation Insight is persisted with a `lineId`
     reference and risk-tier `low`/`medium`.
   - For `maintenance-agent` and `manager-agent`, an **energy duty**
     Insight is layered on top when `recommend_energy_duty` score ≥ 0.3.
4. Re-open `/app/insights` — filter by risk. Confirm the new rows cite
   `inventory` / `orders` / `policies` records with real `previewIds` and
   non-zero `count` values. **No `count: 0` empty cite stubs.**
5. Approve one of the new items from `/app/approvals` — the activity log
   gets a second entry tagged `approved`, and the line on the Line Board
   that the agent referenced may shift from `amber` to `green` once the
   simulated execution completes.

---

## 4. Floor alerts (~30s)

1. Sidebar → **Activity**.
2. The **Floor alerts** sub-panel (right column) shows one or more
   `whatsapp_sim`-channel rows per Insight that was elevated into the
   approval queue (risk `medium` or `high`, or maintenance/line
   throughput confidence ≥ 0.6).
3. Each alert is bound to its Insight id and carries the Bangla + English
   body that the agent emitted. Severity renders as `warn` or `critical`
   matching the risk tier.
4. Tap a row to expand the alert — the linked Insight can be approved or
   rejected inline, mirroring `/app/approvals`.

---

## 5. Vision (~30s)

1. Sidebar → **Vision repair** (`/app/vision`) — enabled by default;
   toggle in Settings if missing.
2. Pick any staged sample tile → click **Analyze**.
3. `POST /api/vision/analyze` returns a bilingual repair instruction
   (Bangla + English).
4. The result is persisted as an Insight with real `manuals` /
   `inventory` previewIds, so `/app/insights` will show a new row even
   from the vision flow.

---

## 6. Ask / RAG (~45s)

1. Sidebar → **Ask BunonBrain** (`/app/ask`).
2. Type something like **"compressor duty"** or **"Line 3 bottleneck"** —
   the answer streams in three phases (analyzed → finding → evidence →
   recommendation → done).
3. The **Evidence** block lists manual citations pulled by
   `factoryTools.search_manual`. Token-overlap ranking:
   - Title match × 3
   - Body match × 1 (Bangla body + 0.5 boost)
   - Tag match × 2
4. Click a manual citation to open the source. The same corpus is reused
   by the Manager agent, so the Ask and Agent surfaces cite the *same*
   manuals.
5. Switch language via the topbar — the Bangla query
   ("লাইন ৩ কেন পিছিয়ে?") returns a Bangla answer with the same
   evidence rows.

---

## 7. QC (~30s)

1. Sidebar → **QC defects** (Operations group).
2. The page renders the same top-5 table as the Overview slot, plus a
   full 36-cell grid (6 operations × 6 lines), sortable by
   operation / line / defect / rework.
3. Click **Flag issue** on any top row. `POST /api/qc/flag` returns a
   deterministic `qc-flag-<op>-<line>` insight id (idempotent) and the
   flagged row appears under `/app/insights` with the matching risk tier
   (`high` ≥ 6 % worst rate, `medium` ≥ 3 %, otherwise `low`).
4. The page is wired to the same `useFactoryBrainLiveStore` tick as the
   Overview slot, so a Simulate tick refreshes both at once.

---

## 8. Settings → LLM (optional, ~30s)

This step is **optional**. The demo runs end-to-end without an LLM
key — every Ask / agent answer is generated deterministically from the
dataset, with a `Demo · no LLM` chip visible.

1. Sidebar → **Settings**.
2. Scroll to **LLM / Live Ask**.
3. Choose a provider (`openai` / `gemini` / `anthropic`), paste a key,
   optionally pick a model. Click **Save LLM settings**.
   - In development, the key is written to `.env.local`.
   - In production, the route mutates the running process only and tells
     you to set the key in the Vercel project env.
   - The key is **never** echoed back. `GET /api/settings/llm` returns
     `{ configured, provider, model, mode }` — no secret in the response.
4. The next `/api/ask` or `/api/agents/:id/run` call now uses the live
   provider; the chip flips from `Demo mode` to `Live mode`.
5. To clear the key, click **Clear key** and confirm.

> If you want to keep the demo deterministic for the live walkthrough,
> skip this step. The Simulated labels are honest either way.

---

## What this build added (summary)

- **Live line board** (`/api/line-board`, `LineBoardPanel`) — six lines,
  traffic-light bottleneck, efficiency vs SAH, auto-refreshes on the
  shared Simulate tick.
- **Morning brief card** (`/api/brief/morning`, `BriefCard`) — EN/BN
  bullets + deep-links to bottleneck, risks, and pending approvals.
- **QC defects & rework** (`/api/qc/defects`, `/api/qc/flag`, `/app/qc`)
  — top operations, 8-week trends, Flag issue button that persists a
  real Insight.
- **Integrations re-organised** — floor sensors (RFID / machine
  telemetry / energy) sit at the top with the Simulated + calibration
  notes; pilot sources (Documents / CSV / Sheets) below; social /
  commerce sources moved into a disclosed "Not for RMG pilot" group.
- **Deterministic energy duty** — pure rule, `Simulated · not RL` label.
- **Manual RAG** via `search_manual` — same corpus serves Ask and
  Manager agent.
- **Evidence soft-fix** in `gatherStoreEvidence` — every persisted
  Insight carries real `previewIds` + non-zero `count`.
- **HANDOFF.md** at the repo root — architecture, API map, env names,
  Simulated-vs-Next-work split.

## Verification

```bash
npx tsc --noEmit    # clean
npm run build       # all routes green
npm run smoke       # all smoke checks passed (file-shape + runtime + determinism + flag idempotence)
```

> See **HANDOFF.md** for the full route table, env-var list, and the four
> bridges to a real pilot (Vercel, Supabase/Redis, real RAG, VLM, WhatsApp).