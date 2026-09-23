# JUDGES.md — BunonBrain walkthrough (~8 minutes)

This is the script the judges can follow end-to-end. It exercises every new
slice that landed in this push: live sensor tick, vision analyze, manual RAG,
deterministic energy duty, agent-driven Insights + FloorAlerts, and the
evidence soft-fix that guarantees every persisted Insight carries real
`previewIds` + non-zero counts.

Open <http://localhost:3000> (or the deployed URL).

> Demo factory profile: **BunonBrain / Factory Brain, mid-tier BD RMG plant.**
> Every screen, seed record, and copy assumes this single profile.
> Set `NEXT_PUBLIC_APP_NAME` only if you intentionally want a different one.

---

## 1. Overview → Simulate tick (~30s)

1. Click **Try now** on the landing page.
2. Click through onboarding (Welcome → Profile → Connect → Understanding → Ready → **Open Factory Brain**).
3. On `/app`, scroll to the **Live sensor feed** panel.
4. Press **Simulate tick** three or four times. Each press:
   - Pushes one new RFID bundle / machine telemetry / energy meter reading
     through `/api/sensors/ingest`.
   - Updates the **Live tick** card (readings, latest sources).
   - Refreshes the KPI cards (line efficiency, uptime, inventory, energy).
5. Notice the new **Energy duty recommendation** card directly below the
   live-tick panel. It shows:
   - Current vs recommended compressor duty (0–100 %).
   - Expected kWh saved over the next hour.
   - A "Simulated · not RL" pill — the score is a **transparent deterministic
     rule** (avg `deltaPct` from per-line energy totals + peak/median ratio
     from the latest energy `SensorReading`s). No ML, no reinforcement
     learning.

## 2. Run Maintenance + Line agents (~60s)

1. Sidebar → **Agents**.
2. Open the **Maintenance & Uptime** agent detail, click **Run now**.
   - An Insight appears under `/app/insights` with risk tier `medium` or
     `high` (depending on the score) and lands in `/app/approvals`.
   - Activity gets a new entry tagged `maintenance-agent`.
3. Open the **Line Throughput** agent detail, click **Run now**.
   - A bottleneck-recommendation Insight is persisted with a `lineId`
     reference and risk-tier `low`/`medium`.
   - For `maintenance-agent` and `manager-agent`, an **energy duty** Insight
     is layered on top when `recommend_energy_duty` score ≥ 0.3.
4. Re-open `/app/insights` — filter by risk. Confirm the new rows cite
   `inventory` / `orders` / `policies` records with real `previewIds` and
   non-zero `count` values. **No `count: 0` empty cite stubs.**

## 3. Activity → Floor alerts (~30s)

1. Sidebar → **Activity**.
2. The **Floor alerts** sub-panel (right column) shows one or more
   `whatsapp_sim`-channel rows per Insight that was elevated into the
   approval queue (risk `medium` or `high`, or maintenance/line throughput
   confidence ≥ 0.6).
3. Each alert is bound to its Insight id and carries the Bangla + English
   body that the agent emitted. Severity renders as `warn` or `critical`
   matching the risk tier.

## 4. Vision → sample analyze (~30s)

1. Sidebar → **Vision repair** (`/app/vision`).
2. Click **Choose one of the staged images** → pick any sample.
3. Click **Analyze**. The route `POST /api/vision/analyze` returns a
   bilingual repair instruction (Bangla + English).
4. The result is persisted as an Insight with real `manuals` / `inventory`
   previewIds, so `/app/insights` will show a new row even from the vision
   flow.

## 5. Ask → manual citation (~45s)

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
5. Switch language via the topbar — the Bangla query ("লাইন ৩ কেন পিছিয়ে?")
   returns a Bangla answer with the same evidence rows.

## 6. Energy duty card (revisit, ~20s)

1. Back to `/app`. The card now reflects the latest run:
   - Current duty (rolling average of per-machine duty cycles)
   - Recommended duty (50–95 % safe window)
   - Expected kWh saved
   - Inline rationale, tinted by risk tier
2. Click the **manuals** link in the card — it deep-links to the
   "Energy spike on Line 4 compressor" manual doc that powers the
   recommendation rationale.

---

## What this push added (summary)

- **Vision repair** wired to `/api/vision/analyze`, with bilingual output and
  persisted Insight citations.
- **Manual RAG** via `search_manual` — same corpus serves Ask and Agent.
- **Deterministic energy duty** via `recommend_energy_duty` — transparent
  rule, `simulated: true` label, no RL. Overview card + Maintenance/Manager
  agent integration + FloorAlert on score ≥ 0.3.
- **Evidence soft-fix** in `gatherStoreEvidence` — every persisted Insight
  carries real `previewIds` + non-zero `count` drawn from
  `dataset.{orders,inventory,policies,suppliers,customers,products}`. Falls
  back to a representative row only when the dataset itself is empty.
- **Demo-company consistency** — landing, onboarding, layout metadata,
  topbar fallback, `.env.example`, README aligned to a single voice:
  *BunonBrain / Factory Brain, mid-tier Bangladeshi garment plant.*

## Verification

```bash
npx tsc --noEmit    # clean
npm run build       # 27 routes, all green
npm run smoke       # all smoke checks passed
```
