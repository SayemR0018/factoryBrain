// Business Brain entities + edges derived from seed.
import type { Product } from "./products";
import type { Customer } from "./customers";
import type { Supplier } from "./suppliers";
import { policies } from "./policies";
import type { Order } from "./orders";

export type EntityKind =
  | "product"
  | "customer"
  | "supplier"
  | "policy"
  | "workflow"
  | "goal"
  | "risk";

export type BrainEntity = {
  id: string;
  kind: EntityKind;
  label: string;
  labelBn: string;
  weight: number; // 0..1 importance for layout
  meta?: Record<string, string | number>;
};

export type BrainEdge = {
  id: string;
  source: string;
  target: string;
  weight: number; // 0..1
  strong?: boolean;
  label?: string;
};

export function buildGraph(
  products: Product[],
  customers: Customer[],
  suppliers: Supplier[],
  orders: Order[],
  goalsList: Array<{ id: string; label: string; labelBn: string }>,
  policyCount = policies.length
): { nodes: BrainEntity[]; edges: BrainEdge[] } {
  const nodes: BrainEntity[] = [];
  const edges: BrainEdge[] = [];

  // Top products by 30d revenue (limit ~25)
  const productRevenue = new Map<string, number>();
  for (const o of orders) {
    if (o.daysAgo <= 30) productRevenue.set(o.productId, (productRevenue.get(o.productId) ?? 0) + o.totalBdt);
  }
  const topProducts = [...productRevenue.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([id]) => products.find((p) => p.id === id)!)
    .filter(Boolean);

  for (const p of topProducts) {
    nodes.push({
      id: p.id,
      kind: "product",
      label: p.name,
      labelBn: p.nameBn,
      weight: 0.7,
      meta: { sku: p.sku, price: p.priceBdt, category: p.category }
    });
    edges.push({
      id: `e-${p.id}-${p.supplierId}`,
      source: p.id,
      target: p.supplierId,
      weight: 0.5,
      label: "supplied by"
    });
  }

  // Top customers by LTV (limit 18)
  const topCustomers = [...customers].sort((a, b) => b.ltvBdt - a.ltvBdt).slice(0, 18);
  for (const c of topCustomers) {
    nodes.push({
      id: c.id,
      kind: "customer",
      label: c.name,
      labelBn: c.name,
      weight: 0.6,
      meta: { region: c.region, ltv: c.ltvBdt, churnRisk: c.churnRisk }
    });
  }

  // Suppliers
  for (const s of suppliers) {
    nodes.push({
      id: s.id,
      kind: "supplier",
      label: s.name,
      labelBn: s.name,
      weight: 0.5,
      meta: { region: s.region, leadTimeDays: s.leadTimeDays, onTime: s.onTimeRate }
    });
  }

  // Customer → Product edges (last 30d, top pairs)
  const pairCounts = new Map<string, number>();
  for (const o of orders) {
    if (o.daysAgo > 30) continue;
    if (!topCustomers.find((c) => c.id === o.customerId)) continue;
    if (!topProducts.find((p) => p.id === o.productId)) continue;
    const key = `${o.customerId}|${o.productId}`;
    pairCounts.set(key, (pairCounts.get(key) ?? 0) + o.quantity);
  }
  for (const [key, w] of pairCounts) {
    const [c, p] = key.split("|");
    edges.push({
      id: `e-${c}-${p}`,
      source: c,
      target: p,
      weight: Math.min(1, w / 20),
      strong: w > 8
    });
  }

  // Policies
  for (const p of policies.slice(0, policyCount)) {
    nodes.push({
      id: p.id,
      kind: "policy",
      label: p.title,
      labelBn: p.titleBn,
      weight: 0.5,
      meta: { type: p.type, effective: p.effectiveDate }
    });
  }

  // Workflows (synthesised from policy + supplier + product flow)
  const workflows = [
    { id: "wf:order-fulfilment", label: "Order fulfilment", labelBn: "অর্ডার সম্পন্নকরণ" },
    { id: "wf:restock", label: "Restock decision", labelBn: "রিস্টক সিদ্ধান্ত" },
    { id: "wf:return", label: "Return handling", labelBn: "ফেরত প্রক্রিয়া" }
  ];
  for (const w of workflows) {
    nodes.push({
      id: w.id,
      kind: "workflow",
      label: w.label,
      labelBn: w.labelBn,
      weight: 0.5
    });
  }
  edges.push({ id: "e-wf-fulfilment-p1", source: "wf:order-fulfilment", target: "policy:return-1", weight: 0.5 });
  edges.push({ id: "e-wf-restock-sup1", source: "wf:restock", target: "sup-1", weight: 0.5 });

  // Goals
  for (const g of goalsList) {
    nodes.push({
      id: g.id,
      kind: "goal",
      label: g.label,
      labelBn: g.labelBn,
      weight: 0.6
    });
  }

  // Risks (derived from analytics)
  const risks = [
    { id: "risk:dhaka-dip", label: "Dhaka revenue dip", labelBn: "ঢাকা আয় হ্রাস" },
    { id: "risk:stockout", label: "Stockout risk", labelBn: "স্টকআউট ঝুঁকি" },
    { id: "risk:churn", label: "Repeat-purchase decline", labelBn: "পুনরায় কেনা হ্রাস" }
  ];
  for (const r of risks) {
    nodes.push({ id: r.id, kind: "risk", label: r.label, labelBn: r.labelBn, weight: 0.7 });
  }

  edges.push({ id: "e-risk-dhaka-c1", source: "risk:dhaka-dip", target: topCustomers[0]?.id ?? "", weight: 0.5 });
  edges.push({ id: "e-risk-stockout-p1", source: "risk:stockout", target: topProducts[0]?.id ?? "", weight: 0.7, strong: true });
  edges.push({ id: "e-risk-churn-c2", source: "risk:churn", target: topCustomers[1]?.id ?? "", weight: 0.5 });

  return { nodes, edges };
}