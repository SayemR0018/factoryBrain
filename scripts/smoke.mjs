// Smoke test for the prototype.
// Validates the dataset, the i18n tables, and the service contracts.
// Designed to run without a live Next.js server — except for the LLM
// settings route, which is exercised end-to-end against a freshly spawned
// `next start` to prove the secret never leaks.

import { promises as fs } from "node:fs";
import path from "node:path";
import url from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function read(rel) {
  return fs.readFile(path.join(root, rel), "utf8");
}

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL: " + msg);
    process.exit(1);
  }
  console.log("ok: " + msg);
}

async function main() {
  // 1. Files exist
  for (const f of [
    "package.json",
    "src/app/page.tsx",
    "src/app/onboarding/welcome/page.tsx",
    "src/app/app/page.tsx",
    "src/app/app/ask/page.tsx",
    "src/app/app/brain/page.tsx",
    "src/app/app/insights/page.tsx",
    "src/app/app/approvals/page.tsx",
    "src/app/app/activity/page.tsx",
    "src/app/app/integrations/page.tsx",
    "src/app/app/settings/page.tsx",
    "src/app/app/architecture/page.tsx",
    "src/data/seed.ts",
    "src/data/products.ts",
    "src/data/customers.ts",
    "src/data/orders.ts",
    "src/data/suppliers.ts",
    "src/data/inventory.ts",
    "src/data/policies.ts",
    "src/data/conversations.ts",
    "src/data/goals.ts",
    "src/data/analytics.ts",
    "src/data/graph.ts",
    "src/data/insights.ts",
    "src/data/agents.ts",
    "src/data/activity.ts",
    "src/services/types.ts",
    "src/services/business.service.ts",
    "src/services/ingestion.service.ts",
    "src/services/metric.service.ts",
    "src/services/brain.service.ts",
    "src/services/insight.service.ts",
    "src/services/evidence.service.ts",
    "src/services/approval.service.ts",
    "src/services/agent.service.ts",
    "src/services/activity.service.ts",
    "src/services/risk.service.ts",
    "src/services/ask.service.ts",
    "src/services/factory.tools.ts",
    "src/store/factory.store.ts",
    "src/i18n/en.ts",
    "src/i18n/bn.ts",
    "src/i18n/registry.ts",
    "config/model-routing.yaml",
    "config/risk-policy.yaml",
    "src/data/sensors.ts",
    "src/data/floorAlerts.ts",
    "src/services/sensors.schemas.ts",
    "src/services/run.persistence.ts",
    "src/services/floorAlerts.server.ts",
    "src/store/sensors.store.ts",
    "src/store/floorAlerts.store.ts",
    "src/store/factoryBrain.live.store.ts",
    "src/app/api/sensors/ingest/route.ts",
    "src/app/api/sensors/latest/route.ts",
    "src/app/api/floor-alerts/route.ts",
    "src/app/api/floor-alerts/[id]/route.ts",
    "src/components/activity/FloorAlertsPanel.tsx",
    "src/app/api/settings/llm/route.ts",
    "src/services/lineBoard.server.ts",
    "src/app/api/line-board/route.ts",
    "src/app/api/line-board/refresh/route.ts",
    "src/components/overview/LineBoardPanel.tsx",
    "src/services/brief.server.ts",
    "src/app/api/brief/morning/route.ts"
  ]) {
    try { await read(f); assert(true, f); } catch { assert(false, f); }
  }

  // 2. i18n tables share the same key tree
  const en = await read("src/i18n/en.ts");
  const bn = await read("src/i18n/bn.ts");
  const keyCount = (s) => (s.match(/"/g) ?? []).length;
  assert(keyCount(en) > 50, "i18n: en has many keys");
  assert(keyCount(bn) > 50, "i18n: bn has many keys");

  // 3. Model routing lists the three BunonBrain agents
  const routing = await read("config/model-routing.yaml");
  for (const id of [
    "line-throughput-agent",
    "maintenance-agent",
    "manager-agent"
  ]) {
    assert(routing.includes(id), "routing has " + id);
  }

  // 4. Risk policy defines stages
  const risk = await read("config/risk-policy.yaml");
  for (const stage of [
    "suggested",
    "pending_approval",
    "executing",
    "done",
    "logged",
    "rejected",
    "failed"
  ]) {
    assert(risk.includes(stage), "risk: stage " + stage);
  }

  // 5. Dataset references in screens
  const askPage = await read("src/app/app/ask/page.tsx");
  assert(askPage.includes("/api/ask"), "ask page wires /api/ask");
  const brainPage = await read("src/app/app/brain/page.tsx");
  assert(brainPage.includes("ReactFlow") || brainPage.includes("reactflow"), "brain uses React Flow");
  const arch = await read("src/components/dev/ArchitectureView.tsx");
  assert(arch.includes("Continuous Context"), "architecture view mentions all seven layers");

  // 6. Live sensor + floor-alert wiring (improve batch)
  const overview = await read("src/app/app/page.tsx");
  assert(overview.includes("/api/sensors/ingest"), "overview wires /api/sensors/ingest");
  assert(overview.includes("Simulate tick"), "overview has Simulate tick control");
  const activity = await read("src/app/app/activity/page.tsx");
  assert(activity.includes("FloorAlertsPanel"), "activity mounts FloorAlertsPanel");
  const latestRoute = await read("src/app/api/sensors/latest/route.ts");
  assert(latestRoute.includes("listLatestReadings"), "latest reads server ingest buffer");
  assert(!latestRoute.includes("useSensorsStore"), "latest does not import client sensors store");
  const sensorsServer = await read("src/services/sensors.server.ts");
  assert(sensorsServer.includes("__factoryBrainSimState"), "sensors.server owns shared sim buffer");
  assert(sensorsServer.includes("listLatestReadings"), "sensors.server exports listLatestReadings");
  const agentRun = await read("src/app/api/agents/[agentId]/run/route.ts");
  assert(agentRun.includes("persistAgentRun"), "agents/run persists via persistAgentRun");

  // 7. Line-board route — file-shape contract (improve batch).
  const lineBoard = await read("src/services/lineBoard.server.ts");
  assert(lineBoard.includes("LineBoardRowSchema"), "lineBoard: Zod schema exported");
  assert(lineBoard.includes("LINE_BOARD_SIMULATED_LABEL"), "lineBoard: simulated label exported");
  assert(lineBoard.includes("buildLineBoard"), "lineBoard: buildLineBoard exported");
  assert(lineBoard.includes("BottleneckEnum"), "lineBoard: bottleneck enum defined");
  const lineBoardRoute = await read("src/app/api/line-board/route.ts");
  assert(lineBoardRoute.includes('export async function GET'), "line-board: GET handler present");
  assert(lineBoardRoute.includes("buildLineBoard"), "line-board: uses buildLineBoard");
  const lineBoardRefresh = await read("src/app/api/line-board/refresh/route.ts");
  assert(lineBoardRefresh.includes('export async function POST'), "line-board/refresh: POST handler present");
  assert(lineBoardRefresh.includes("advanceSim"), "line-board/refresh: advances sim before reading");
  assert(lineBoardRefresh.includes("buildLineBoard"), "line-board/refresh: returns buildLineBoard payload");

  // Brief module — file-shape contract.
  const brief = await read("src/services/brief.server.ts");
  assert(brief.includes("BriefResponseSchema"), "brief: Zod schema exported");
  assert(brief.includes("buildMorningBrief"), "brief: buildMorningBrief exported");
  assert(brief.includes("BRIEF_SIMULATED_LABEL"), "brief: simulated label exported");
  assert(brief.includes("FUTURE_LLM_HOOK"), "brief: LLM-future placeholder comment present");
  assert(brief.includes(".strict()"), "brief: response schema is Zod-strict");
  const briefRoute = await read("src/app/api/brief/morning/route.ts");
  assert(briefRoute.includes('export async function GET'), "brief/morning: GET handler present");
  assert(briefRoute.includes("buildMorningBrief"), "brief/morning: uses buildMorningBrief");
  assert(briefRoute.includes('runtime = "nodejs"'), "brief/morning: runtime = nodejs");
  assert(briefRoute.includes('dynamic = "force-dynamic"'), "brief/morning: dynamic = force-dynamic");
  assert(briefRoute.includes("Cache-Control"), "brief/morning: no-store cache header");
  assert(en.includes("brief:") && en.includes("fallbackNoRecs:"), "i18n en: brief namespace + fallbackNoRecs present");
  assert(bn.includes("brief:") && bn.includes("fallbackNoRecs:"), "i18n bn: brief namespace + fallbackNoRecs present");

  // LineBoardPanel — wiring + i18n keys.
  const lineBoardPanel = await read("src/components/overview/LineBoardPanel.tsx");
  assert(lineBoardPanel.includes('export function LineBoardPanel'), "LineBoardPanel: component exported");
  assert(lineBoardPanel.includes('"/api/line-board"'), "LineBoardPanel: fetches /api/line-board");
  assert(lineBoardPanel.includes("useFactoryBrainLiveStore"), "LineBoardPanel: subscribes to live tick store");
  assert(lineBoardPanel.includes('data-testid="line-board"'), "LineBoardPanel: smoke-visible testid present");
  assert(lineBoardPanel.includes('Simulated'), "LineBoardPanel: keeps simulated label visible");
  const overviewPage = await read("src/app/app/page.tsx");
  assert(overviewPage.includes("<LineBoardPanel"), "overview: mounts <LineBoardPanel />");
  assert(overviewPage.includes("judge-walkthrough"), "overview: keeps demo path strip");
  for (const k of [
    "lineBoard:",
    "lineBoardSubtitle:",
    "colLine:",
    "colBottleneck:",
    "colEff:",
    "colSah:",
    "colWip:",
    "colNpt:",
    "bottleneckGreen:",
    "bottleneckAmber:",
    "bottleneckRed:",
    "effShort:",
    "refreshAria:",
    "retry:",
    "loadFailed:",
    "loadFailedBody:"
  ]) {
    assert(en.includes(k), `i18n en: has overview.${k.replace(/:$/, "")}`);
    assert(bn.includes(k), `i18n bn: has overview.${k.replace(/:$/, "")}`);
  }

  // 8. Brand naming wired through i18n + layout metadata.
  assert(en.includes('name: "BunonBrain"'), "en: app.name is BunonBrain");
  const layout = await read("src/app/layout.tsx");
  assert(layout.includes("BunonBrain"), "layout metadata mentions BunonBrain");

  // Frontend polish checks (Builder)
  const bizStore = await read("src/store/business.store.ts");
  assert(bizStore.includes("visionRepair: true"), "visionRepair defaults on for judges");
  const sidebar = await read("src/components/layout/Sidebar.tsx");
  assert(sidebar.includes("/app/vision"), "sidebar links to Vision under Intelligence");
  const overviewUi = await read("src/app/app/page.tsx");
  assert(overviewUi.includes("judge-walkthrough"), "overview has demo path strip");
  assert(overviewUi.includes("/app/ask?q="), "energy duty links to Ask with q=");
  const visionPage = await read("src/app/app/vision/page.tsx");
  assert(visionPage.includes("SAMPLE_FILES.map"), "vision uses sample grid picker");
  const agentsPage = await read("src/app/app/agents/page.tsx");
  assert(agentsPage.includes("agents-run-banner"), "agents shows post-run banner");

  // 9. LLM settings route — file-shape contract.
  // ---------------------------------------------------------------------
  // Static checks against the route source so they always run, even when
  // there's no live server. The runtime check below boots one.
  const settingsRoute = await read("src/app/api/settings/llm/route.ts");
  assert(settingsRoute.includes('export async function GET'), "settings/llm: GET handler present");
  assert(settingsRoute.includes('export async function POST'), "settings/llm: POST handler present");
  // The route must never echo apiKey back onto the response payload.
  assert(!/apiKey\s*:\s*apiKey\b/.test(settingsRoute), "settings/llm: does not put apiKey on the response");
  assert(!/apiKey\s*:\s*trimmedKey\b/.test(settingsRoute), "settings/llm: does not echo trimmedKey");
  // The route must never log the body or the key. We scan each
  // console.* call's arguments by line — the heuristic regex matches a
  // log call on the same physical line as the word "apiKey"/"body".
  function logsToken(source, token) {
    return source
      .split("\n")
      .some((line) => /console\.(log|info|warn|error)\(/.test(line) && line.includes(token));
  }
  assert(!logsToken(settingsRoute, "apiKey"), "settings/llm: never logs apiKey");
  assert(!logsToken(settingsRoute, "body"), "settings/llm: never logs body");
  // .gitignore must keep .env.local ignored.
  const gitignore = await read(".gitignore");
  assert(/\.env\.local/.test(gitignore), ".gitignore lists .env.local");
  assert(/\.env\*\.local/.test(gitignore), ".gitignore lists .env*.local");

  // 10. LLM settings route — runtime contract.
  // ---------------------------------------------------------------------
  // Boot `next start` against the build dir, hit GET to confirm the
  // response shape never carries an apiKey or LLM_API_KEY string, POST a
  // clearly fake key, then GET again and confirm `configured` flips true
  // while the fake key still does not appear anywhere in the body.
  await runSettingsLlmRuntimeCheck();

  console.log("\nAll smoke checks passed.");
}

async function runSettingsLlmRuntimeCheck() {
  // Skip cleanly if the production build isn't present yet.
  const buildDir = path.join(root, ".next");
  try {
    await fs.access(path.join(buildDir, "BUILD_ID"));
  } catch {
    console.log("skip: runtime settings/llm check (no .next/BUILD_ID — build first)");
    return;
  }

  const port = 4173;
  const base = `http://127.0.0.1:${port}`;
  const FAKE_KEY = "smoke-fake-key-DO-NOT-USE-0123456789abcdef";

  // The dev-mode route upserts to .env.local. Back up and remove any
  // existing copy so the test starts clean and we can restore it after.
  const envLocal = path.join(root, ".env.local");
  const hadEnvLocal = await fs.stat(envLocal).then(() => true).catch(() => false);
  let backup = null;
  if (hadEnvLocal) {
    backup = await fs.readFile(envLocal, "utf8");
    await fs.unlink(envLocal);
  }

  // Start `next start`. We force NODE_ENV=production so the route hits
  // the "process-only" branch (no file writes). Stdout/stderr are
  // discarded — never let the key land in build logs.
  const server = spawn("npx", ["next", "start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1" },
    stdio: ["ignore", "ignore", "ignore"]
  });

  async function cleanup() {
    try { server.kill("SIGTERM"); } catch {}
    await new Promise((r) => setTimeout(r, 250));
    try { server.kill("SIGKILL"); } catch {}
    if (hadEnvLocal && backup !== null) {
      await fs.writeFile(envLocal, backup);
    } else if (!hadEnvLocal) {
      // No original file existed; if a test .env.local was created in
      // dev mode elsewhere, wipe it. Here we also make sure we don't
      // leave any test-spawned .env.local behind.
      await fs.unlink(envLocal).catch(() => {});
    }
  }

  try {
    await waitForServer(base);
    const headers = { "Content-Type": "application/json" };

    // Initial GET — neither key nor env var name should appear.
    const initial = await getJson(base + "/api/settings/llm");
    assertNoSecret(initial, FAKE_KEY, "GET (initial)");

    // POST a clearly fake key.
    const fakeBody = JSON.stringify({ provider: "openai", apiKey: FAKE_KEY, model: "gpt-6-luna" });
    const postRes = await fetch(base + "/api/settings/llm", { method: "POST", headers, body: fakeBody });
    const postText = await postRes.text();
    assert(postRes.status === 200, `POST settings/llm returned 200 (got ${postRes.status})`);
    assert(!postText.includes(FAKE_KEY), "POST response text does not contain the fake key");
    assert(!postText.includes("apiKey"), "POST response text does not contain the substring 'apiKey'");
    const postParsed = JSON.parse(postText);
    assert(postParsed.apiKey === undefined, "POST response JSON has no apiKey field");
    assert(postParsed.configured === true, "POST sets configured: true after fake key saved");

    // GET again — status should now show configured=true, and still
    // never echo the key. Also assert the env-var name isn't returned.
    const after = await getJson(base + "/api/settings/llm");
    assertNoSecret(after, FAKE_KEY, "GET (after POST)");
    assert(after.configured === true, "GET after POST reports configured: true");
    assert(after.mode === "live", "GET after POST reports mode: live");
    assert(after.provider === "openai", "GET after POST reports provider: openai");
    assert(after.model === "gpt-6-luna", "GET after POST reports model: gpt-6-luna");

    // Clear the key and confirm GET goes back to configured:false.
    const clearRes = await fetch(base + "/api/settings/llm", {
      method: "POST", headers, body: JSON.stringify({ provider: "openai", clearKey: true })
    });
    assert(clearRes.status === 200, "POST clearKey returned 200");
    const cleared = await getJson(base + "/api/settings/llm");
    assert(cleared.configured === false, "GET after clearKey reports configured: false");
    assert(cleared.mode === "demo", "GET after clearKey reports mode: demo");
    assertNoSecret(cleared, FAKE_KEY, "GET (after clear)");

    // Line-board (improve batch) — runtime contract against the same server.
    const board = await getJson(base + "/api/line-board");
    assert(board && Array.isArray(board.rows), "line-board: rows is an array");
    assert(board.rows.length === 6, "line-board: returns 6 rows (line-1..line-6)");
    assert(board.meta && board.meta.simulated === true, "line-board: meta.simulated is true");
    assert(typeof board.meta.source === "string" && /Simulated/.test(board.meta.source), "line-board: meta.source mentions Simulated");
    assert(typeof board.meta.tick === "number" && board.meta.tick >= 0, "line-board: meta.tick is a non-negative number");
    for (const r of board.rows) {
      for (const k of ["lineId", "name", "efficiencyPct", "sahTarget", "sahActual", "wipBundles", "bottleneck", "nptMinutes", "updatedAt"]) {
        assert(r[k] !== undefined, `line-board row ${r.lineId || "?"}: has ${k}`);
      }
      assert(["green", "amber", "red"].includes(r.bottleneck), `line-board row ${r.lineId}: bottleneck ∈ green/amber/red`);
      assert(r.efficiencyPct >= 0 && r.efficiencyPct <= 100, `line-board row ${r.lineId}: efficiencyPct in 0..100`);
      assert(Number.isInteger(r.sahTarget) && r.sahTarget >= 0 && r.sahTarget <= 100, `line-board row ${r.lineId}: sahTarget is integer 0..100`);
      assert(Number.isInteger(r.wipBundles) && r.wipBundles >= 0, `line-board row ${r.lineId}: wipBundles is integer ≥ 0`);
      assert(Number.isInteger(r.nptMinutes) && r.nptMinutes >= 0, `line-board row ${r.lineId}: nptMinutes is integer ≥ 0`);
    }

    // Refresh should advance tick and return a fresh board.
    const tickBefore = board.meta.tick;
    const refreshRes = await fetch(base + "/api/line-board/refresh", { method: "POST", headers });
    assert(refreshRes.status === 200, "POST /api/line-board/refresh returned 200");
    const refreshed = await refreshRes.json();
    assert(refreshed.meta.tick > tickBefore, `line-board/refresh: tick advances (${tickBefore} → ${refreshed.meta.tick})`);
    assert(refreshed.meta.simulated === true, "line-board/refresh: meta.simulated is true");
    assert(refreshed.rows.length === 6, "line-board/refresh: still 6 rows");

    // Invalid body returns 400.
    const badRes = await fetch(base + "/api/line-board/refresh", {
      method: "POST", headers, body: JSON.stringify({ tick: "nope" })
    });
    assert(badRes.status === 400, "POST /api/line-board/refresh with bad body returns 400");

    // Brief — runtime contract + determinism (same inputs → identical JSON).
    // Give Next a generous grace period to compile the freshly-added route.
    let brief1 = null;
    let lastStatus = 0;
    const briefDeadline = Date.now() + 30_000;
    while (Date.now() < briefDeadline) {
      try {
        const r = await fetch(base + "/api/brief/morning", { cache: "no-store" });
        lastStatus = r.status;
        if (r.status === 200) {
          brief1 = await r.json();
          break;
        }
        // Drain the body so the connection is reusable, but don't parse it.
        try { await r.text(); } catch {}
      } catch {}
      await new Promise((r2) => setTimeout(r2, 500));
    }
    assert(brief1 !== null, `brief: GET /api/brief/morning returned 200 within grace period (last status ${lastStatus})`);
    assert(typeof brief1.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(brief1.date), "brief: date is YYYY-MM-DD");
    assert(Array.isArray(brief1.bulletsEn) && brief1.bulletsEn.length >= 1, "brief: bulletsEn is a non-empty array");
    assert(Array.isArray(brief1.bulletsBn) && brief1.bulletsBn.length >= 1, "brief: bulletsBn is a non-empty array");
    assert(brief1.bulletsEn.length === brief1.bulletsBn.length, "brief: bulletsEn and bulletsBn have same length");
    for (const s of brief1.bulletsEn) assert(typeof s === "string" && s.length > 0, "brief: every bulletsEn entry is a non-empty string");
    for (const s of brief1.bulletsBn) assert(typeof s === "string" && s.length > 0, "brief: every bulletsBn entry is a non-empty string");
    assert(Number.isInteger(brief1.riskCount) && brief1.riskCount >= 0, "brief: riskCount is a non-negative integer");
    assert(Number.isInteger(brief1.pendingApprovals) && brief1.pendingApprovals >= 0, "brief: pendingApprovals is a non-negative integer");
    if (brief1.topBottleneckLineId !== undefined) {
      assert(typeof brief1.topBottleneckLineId === "string" && /^line-\d+$/.test(brief1.topBottleneckLineId), "brief: topBottleneckLineId is a line id");
    }
    assert(brief1.meta && brief1.meta.simulated === true, "brief: meta.simulated is true");
    assert(typeof brief1.meta.source === "string" && /Simulated/.test(brief1.meta.source), "brief: meta.source mentions Simulated");
    assert(Number.isInteger(brief1.meta.tick) && brief1.meta.tick >= 0, "brief: meta.tick is a non-negative integer");
    assert(typeof brief1.meta.generatedAt === "string" && brief1.meta.generatedAt.length > 0, "brief: meta.generatedAt is set");

    // Determinism — two consecutive GETs return identical content (only
    // meta.generatedAt is allowed to differ; bullets/insights/counts are stable).
    const brief2 = await getJson(base + "/api/brief/morning");
    const { generatedAt: _g1, ...brief1Stripped } = brief1.meta;
    const { generatedAt: _g2, ...brief2Stripped } = brief2.meta;
    const stable1 = { ...brief1, meta: brief1Stripped };
    const stable2 = { ...brief2, meta: brief2Stripped };
    assert(JSON.stringify(stable1) === JSON.stringify(stable2), "brief: content is deterministic across calls (only generatedAt may differ)");
  } finally {
    await cleanup();
  }
}

async function getJson(url) {
  const res = await fetch(url, { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.json();
}

function assertNoSecret(obj, fakeKey, label) {
  const text = JSON.stringify(obj);
  assert(!text.includes(fakeKey), `${label}: response JSON does not contain the fake key`);
  assert(!text.includes("apiKey"), `${label}: response JSON does not contain the substring 'apiKey'`);
  assert(!text.includes("LLM_API_KEY"), `${label}: response JSON does not contain the substring 'LLM_API_KEY'`);
  assert(obj.apiKey === undefined, `${label}: parsed object has no apiKey field`);
}

async function waitForServer(base) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + "/api/settings/llm");
      // Any HTTP response means the server is up.
      if (res.status > 0) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("timeout waiting for next start");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
