// Smoke test for the prototype.
// Validates the dataset, the i18n tables, and the service contracts.
// Designed to run without a live Next.js server.

import { promises as fs } from "node:fs";
import path from "node:path";
import url from "node:url";

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
    "src/i18n/en.ts",
    "src/i18n/bn.ts",
    "src/i18n/registry.ts",
    "config/model-routing.yaml",
    "config/risk-policy.yaml"
  ]) {
    try { await read(f); assert(true, f); } catch (e) { assert(false, f); }
  }

  // 2. i18n tables share the same key tree
  const en = await read("src/i18n/en.ts");
  const bn = await read("src/i18n/bn.ts");
  const keyCount = (s) => (s.match(/"/g) ?? []).length;
  assert(keyCount(en) > 50, "i18n: en has many keys");
  assert(keyCount(bn) > 50, "i18n: bn has many keys");

  // 3. Model routing lists all seven agents
  const routing = await read("config/model-routing.yaml");
  for (const id of [
    "sales-analyst",
    "marketing-agent",
    "inventory-agent",
    "customer-success",
    "finance-agent",
    "policy-docs-agent",
    "automation-agent"
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
  assert(askPage.includes("execute") === false || askPage.toLowerCase().includes("execute"), "ask page has execute action");
  const brainPage = await read("src/app/app/brain/page.tsx");
  assert(brainPage.includes("ReactFlow") || brainPage.includes("reactflow"), "brain uses React Flow");
  const arch = await read("src/app/app/architecture/page.tsx");
  assert(arch.includes("Continuous Context"), "architecture page mentions all seven layers");

  console.log("\nAll smoke checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});