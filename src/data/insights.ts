// Insight factory — produces the seeded insights that the demo surfaces.
// Each insight is derived from seed and carries explicit evidence refs.
import type { HealthSnapshot } from "./analytics";
import type { Order } from "./orders";
import type { InventoryRecord } from "./inventory";
import type { Customer } from "./customers";
import type { Product } from "./products";

export type InsightStage = "suggested" | "pending_approval" | "executing" | "done" | "logged" | "rejected" | "failed";

export type RiskTier = "low" | "medium" | "high";

export type EvidenceRef = {
  domain: "orders" | "customers" | "products" | "inventory" | "conversations" | "policies" | "suppliers";
  count: number;
  filter?: Record<string, string | number | boolean>;
  previewIds?: string[];
};

export type Insight = {
  id: string;
  agentId: string;
  agentLabel: string;
  title: string;
  titleBn: string;
  finding: string;
  findingBn: string;
  factors: Array<{ label: string; labelBn: string; magnitude: string; magnitudeBn: string }>;
  recommendation: {
    title: string;
    titleBn: string;
    action: string;
    actionBn: string;
    riskTier: RiskTier;
    targetStage: InsightStage;
  };
  evidence: EvidenceRef[];
  stage: InsightStage;
  createdAt: string;
  updatedAt: string;
  confidence: number; // 0..1
  pinned?: boolean;
};

const now = new Date();
const isoAgo = (ms: number) => new Date(now.getTime() - ms).toISOString();

export function buildInsights(
  health: HealthSnapshot,
  inventory: InventoryRecord[],
  products: Product[],
  customers: Customer[],
  orders: Order[]
): Insight[] {
  const out: Insight[] = [];

  // 1) Dhaka revenue dip — Sales Analyst (Low)
  {
    const dhakaOrders = orders.filter((o) => o.region === "Dhaka" && o.daysAgo <= 30);
    const dhakaPrev = orders.filter((o) => o.region === "Dhaka" && o.daysAgo > 30 && o.daysAgo <= 60);
    out.push({
      id: "ins-1",
      agentId: "sales-analyst",
      agentLabel: "Sales Analyst",
      title: "Dhaka revenue down 22% in the last 30 days",
      titleBn: "গত ৩০ দিনে ঢাকার আয় ২২% কমেছে",
      finding: "Dhaka revenue fell sharply while every other region held flat. The drop concentrates in two product categories and on three weekdays. Delivery delays in two Dhaka sub-zones are the most plausible driver; a smaller share traces to a competitor promo.",
      findingBn: "ঢাকার আয় উল্লেখযোগ্যভাবে কমেছে, অন্যান্য অঞ্চল সমান ছিল। হ্রাসটি দুটি পণ্য ক্যাটাগরি ও তিনটি কর্মদিবসে কেন্দ্রীভূত। ঢাকার দুটি সাব-জোনে ডেলিভারি বিলম্ব সম্ভাব্য প্রধান কারণ।",
      factors: [
        { label: "Dhaka revenue Δ", labelBn: "ঢাকা আয়ের পরিবর্তন", magnitude: `${(health.dhakaDip.pct * 100).toFixed(1)}%`, magnitudeBn: `${(health.dhakaDip.pct * 100).toFixed(1)}%` },
        { label: "Other regions Δ", labelBn: "অন্যান্য অঞ্চলের পরিবর্তন", magnitude: "+0.4%", magnitudeBn: "+০.৪%" },
        { label: "Delivery complaints (Dhaka, 7d)", labelBn: "ডেলিভারি অভিযোগ (ঢাকা, ৭ দিন)", magnitude: "+38%", magnitudeBn: "+৩৮%" }
      ],
      recommendation: {
        title: "Investigate Dhaka delivery SLA breaches",
        titleBn: "ঢাকা ডেলিভারি SLA লঙ্ঘন তদন্ত",
        action: "Open an investigation; do not change pricing yet.",
        actionBn: "তদন্ত শুরু করুন; এখনই দাম পরিবর্তন করবেন না।",
        riskTier: "low",
        targetStage: "logged"
      },
      evidence: [
        { domain: "orders", count: dhakaOrders.length, filter: { region: "Dhaka", window: "30d" }, previewIds: dhakaOrders.slice(0, 6).map((o) => o.id) },
        { domain: "orders", count: dhakaPrev.length, filter: { region: "Dhaka", window: "previous 30d" } }
      ],
      stage: "suggested",
      createdAt: isoAgo(60 * 60 * 1000),
      updatedAt: isoAgo(60 * 60 * 1000),
      confidence: 0.82,
      pinned: true
    });
  }

  // 2) Stockout risk — Inventory Agent (Medium)
  {
    const atRisk = inventory.filter((i) => i.atRisk);
    const critical = atRisk.filter((i) => i.daysUntilStockout < 8);
    out.push({
      id: "ins-2",
      agentId: "inventory-agent",
      agentLabel: "Inventory Agent",
      title: `${critical.length} products will stock out within a week`,
      titleBn: `${critical.length}টি পণ্য এক সপ্তাহের মধ্যে স্টকআউট হবে`,
      finding: "Two planted SKUs (Coral Apparel Pro, Harvest Grocery Max) plus four mid-velocity items are projected to hit zero stock within 7 days at current daily demand. Lead times range 6–14 days for the affected SKUs.",
      findingBn: "দুটি পণ্য এবং চারটি মাঝারি গতির পণ্য ৭ দিনের মধ্যে শূন্য স্টকে পৌঁছাবে। লিড টাইম ৬–১৪ দিন।",
      factors: [
        { label: "Critical SKUs", labelBn: "গুরুতর SKU", magnitude: String(critical.length), magnitudeBn: bn(critical.length) },
        { label: "Total at-risk", labelBn: "মোট ঝুঁকিপূর্ণ", magnitude: String(atRisk.length), magnitudeBn: bn(atRisk.length) },
        { label: "Order value at risk", labelBn: "ঝুঁকিপূর্ণ অর্ডার মূল্য", magnitude: "৳1.84L", magnitudeBn: "৳১.৮৪ লক্ষ" }
      ],
      recommendation: {
        title: `Restock ${critical.length} critical SKUs`,
        titleBn: `${bn(critical.length)}টি গুরুতর SKU রিস্টক করুন`,
        action: "Submit restock orders to suppliers via the automation layer.",
        actionBn: "সরবরাহকারীদের কাছে রিস্টক অর্ডার জমা দিন।",
        riskTier: "medium",
        targetStage: "pending_approval"
      },
      evidence: [
        { domain: "inventory", count: atRisk.length, previewIds: atRisk.slice(0, 6).map((i) => i.productId) },
        { domain: "products", count: critical.length }
      ],
      stage: "pending_approval",
      createdAt: isoAgo(3 * 60 * 60 * 1000),
      updatedAt: isoAgo(3 * 60 * 60 * 1000),
      confidence: 0.88,
      pinned: true
    });
  }

  // 3) Churn rise — Customer Success (Low)
  {
    const churnHigh = customers.filter((c) => c.churnRisk >= 0.7).length;
    out.push({
      id: "ins-3",
      agentId: "customer-success",
      agentLabel: "Customer Success",
      title: "Repeat-purchase rate is trending down",
      titleBn: "পুনরায় কেনার হার কমছে",
      finding: "The share of last-30-day buyers who are repeat customers dropped from the previous 30-day window. Combined with the Dhaka dip, this points to a localised experience issue rather than a catalogue issue.",
      findingBn: "গত ৩০ দিনের ক্রেতাদের মধ্যে পুনরায় ক্রেতার অংশ আগের ৩০ দিনের তুলনায় কমেছে।",
      factors: [
        { label: "Δ repeat rate", labelBn: "পুনরায় কেনার হারের পরিবর্তন", magnitude: `${(health.churnRisePct * 100).toFixed(1)}%`, magnitudeBn: `${(health.churnRisePct * 100).toFixed(1)}%` },
        { label: "Customers at risk", labelBn: "ঝুঁকিপূর্ণ ক্রেতা", magnitude: String(churnHigh), magnitudeBn: bn(churnHigh) }
      ],
      recommendation: {
        title: "Send win-back message to top 50 at-risk customers",
        titleBn: "শীর্ষ ৫০ ঝুঁকিপূর্ণ ক্রেতাকে উইন-ব্যাক বার্তা পাঠান",
        action: "Draft the message in Bangla + English and queue for review.",
        actionBn: "বাংলা + ইংরেজিতে খসড়া তৈরি করে পর্যালোচনার জন্য সারিবদ্ধ করুন।",
        riskTier: "medium",
        targetStage: "suggested"
      },
      evidence: [
        { domain: "customers", count: churnHigh, filter: { churnRisk: ">=0.7" } },
        { domain: "orders", count: 214 }
      ],
      stage: "suggested",
      createdAt: isoAgo(8 * 60 * 60 * 1000),
      updatedAt: isoAgo(8 * 60 * 60 * 1000),
      confidence: 0.71
    });
  }

  // 4) Marketing: weekly basket plan (Medium)
  {
    out.push({
      id: "ins-4",
      agentId: "marketing-agent",
      agentLabel: "Marketing Agent",
      title: "Weekly basket plan: 8% off recurring grocery orders",
      titleBn: "সাপ্তাহিক বাস্কেট প্ল্যান: পুনরাবৃত্ত মুদি অর্ডারে ৮% ছাড়",
      finding: "From the conversations thread, multiple customers asked about a loyalty discount on weekly groceries. The basket cohort makes up 28% of monthly revenue and has the highest repeat rate in the dataset.",
      findingBn: "কথোপকথনের থ্রেড থেকে, একাধিক ক্রেতা সাপ্তাহিক মুদিতে লয়্যালটি ছাড়ের অনুরোধ করেছেন।",
      factors: [
        { label: "Basket cohort revenue share", labelBn: "বাস্কেট কোহোর্ট আয়ের অংশ", magnitude: "28%", magnitudeBn: "২৮%" },
        { label: "Repeat rate (basket)", labelBn: "পুনরায় কেনার হার (বাস্কেট)", magnitude: "61%", magnitudeBn: "৬১%" }
      ],
      recommendation: {
        title: "Approve the weekly-basket creative",
        titleBn: "সাপ্তাহিক বাস্কেট ক্রিয়েটিভ অনুমোদন",
        action: "Approve creative and send via WhatsApp.",
        actionBn: "ক্রিয়েটিভ অনুমোদন করে হোয়াটসঅ্যাপে পাঠান।",
        riskTier: "medium",
        targetStage: "pending_approval"
      },
      evidence: [
        { domain: "conversations", count: 6, previewIds: ["conv-5"] }
      ],
      stage: "pending_approval",
      createdAt: isoAgo(2 * 60 * 60 * 1000),
      updatedAt: isoAgo(2 * 60 * 60 * 1000),
      confidence: 0.74
    });
  }

  // 5) Finance: cashflow visibility (High)
  {
    out.push({
      id: "ins-5",
      agentId: "finance-agent",
      agentLabel: "Finance Agent",
      title: "Outstanding supplier commitments exceed safe threshold",
      titleBn: "বকেয়া সরবরাহকারী প্রতিশ্রুতি নিরাপদ সীমা অতিক্রম করেছে",
      finding: "Three supplier commitments total ৳4.18L with net-30 terms; against current cashflow projection this leaves a 12-day buffer. Recommend renegotiating one commitment.",
      findingBn: "তিনটি সরবরাহকারী প্রতিশ্রুতি মোট ৪.১৮ লক্ষ টাকা; বর্তমান ক্যাশফ্লো অনুমানের বিপরীতে ১২ দিনের বাফার থাকে।",
      factors: [
        { label: "Total committed", labelBn: "মোট প্রতিশ্রুত", magnitude: "৳4.18L", magnitudeBn: "৳৪.১৮ লক্ষ" },
        { label: "Cash buffer", labelBn: "ক্যাশ বাফার", magnitude: "12 days", magnitudeBn: "১২ দিন" }
      ],
      recommendation: {
        title: "Renegotiate Sylhet Tea & Beauty payment terms",
        titleBn: "সিলেট চা ও বিউটি পেমেন্ট শর্ত পুনর্বিবেচনা",
        action: "Request net-45 in exchange for 2% early-payment on smaller orders.",
        actionBn: "ছোট অর্ডারে ২% আগাম পেমেন্টের বিনিময়ে নেট-৪৫ অনুরোধ করুন।",
        riskTier: "high",
        targetStage: "pending_approval"
      },
      evidence: [
        { domain: "suppliers", count: 3, previewIds: ["sup-4", "sup-1", "sup-10"] },
        { domain: "policies", count: 1, previewIds: ["policy:supplier-agreement-1"] }
      ],
      stage: "pending_approval",
      createdAt: isoAgo(20 * 60 * 60 * 1000),
      updatedAt: isoAgo(20 * 60 * 60 * 1000),
      confidence: 0.83
    });
  }

  // 6) Automation: executed (already done)
  {
    out.push({
      id: "ins-6",
      agentId: "automation-agent",
      agentLabel: "Automation Agent",
      title: "Daily product sync completed",
      titleBn: "দৈনিক পণ্য সিঙ্ক সম্পন্ন",
      finding: "342 products reconciled against the catalogue source; 4 SKUs flagged for review.",
      findingBn: "৩৪২টি পণ্য ক্যাটালগ উৎসের সাথে সামঞ্জস্য করা হয়েছে; ৪টি SKU পর্যালোচনার জন্য চিহ্নিত।",
      factors: [],
      recommendation: {
        title: "No action required",
        titleBn: "কোনো পদক্ষেপ প্রয়োজন নেই",
        action: "Acknowledge.",
        actionBn: "স্বীকার করুন।",
        riskTier: "low",
        targetStage: "done"
      },
      evidence: [
        { domain: "products", count: 342 }
      ],
      stage: "done",
      createdAt: isoAgo(26 * 60 * 60 * 1000),
      updatedAt: isoAgo(26 * 60 * 60 * 1000),
      confidence: 0.99
    });
  }

  return out;
}

function bn(n: number) {
  const map: Record<number, string> = { 0: "০", 1: "১", 2: "২", 3: "৩", 4: "৪", 5: "৫", 6: "৬", 7: "৭", 8: "৮", 9: "৯" };
  return String(n).replace(/[0-9]/g, (d) => map[Number(d)]);
}