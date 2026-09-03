// Ask Thalamus service — answers free-text questions with streaming reveal.
// Streaming blocks: analyzed → finding → factors → evidence → recommendation → done.
// Routes to the live slice API when a key is present, otherwise produces a deterministic
// derivation against the seed.

import { dataset } from "./dataset";
import type { AskAnswer, AskContextPack, StreamChunk, EvidenceRefPublic, RiskTier } from "./types";

const SUGGESTIONS_EN = [
  "Why did sales drop this month?",
  "Which products will stock out next week?",
  "Top repeat customers this quarter",
  "Customers likely to churn",
  "Generate a Facebook promo for slow movers"
];

const SUGGESTIONS_BN = [
  "এই মাসে বিক্রি কমেছে কেন?",
  "পরের সপ্তাহে কোন পণ্যগুলো স্টকআউট হবে?",
  "এই কোয়ার্টারে শীর্ষ পুনরায় ক্রেতা",
  "চার্ন হতে পারে এমন ক্রেতা",
  "ধীরে চলমান পণ্যের জন্য ফেসবুক প্রমো"
];

export const askService = {
  suggestions(): string[] {
    return [...SUGGESTIONS_EN, ...SUGGESTIONS_BN];
  },
  buildContextPack(query: string): AskContextPack {
    const q = query.toLowerCase();
    const isDhaka = /dhaka|ঢাকা/.test(q);
    const isStock = /stock|stockout|স্টক|স্টকআউট/.test(q);
    const isChurn = /churn|repeat|চার্ন|পুনরায়/.test(q);
    const relevantInsights = dataset.insights.filter((i) => {
      if (isDhaka) return i.id === "ins-1" || i.id === "ins-6";
      if (isStock) return i.id === "ins-2" || i.id === "ins-6";
      if (isChurn) return i.id === "ins-3" || i.id === "ins-5";
      return true;
    });
    const relevantEntities = dataset.graph.nodes.filter((n) => n.kind === "risk");
    return {
      query,
      health: dataset.health,
      relevantInsights,
      relevantEntities
    };
  },
  // Returns a streaming generator. Each yielded chunk is one of the answer blocks.
  async *stream(pack: AskContextPack): AsyncGenerator<StreamChunk> {
    const q = pack.query.toLowerCase();
    const isDhaka = /dhaka|ঢাকা/.test(q);
    const isStock = /stock|stockout|স্টক|স্টকআউট/.test(q);
    const isChurn = /churn|repeat|চার্ন|পুনরায়/.test(q);

    if (isStock) {
      const atRisk = dataset.inventory.filter((i) => i.atRisk);
      yield { type: "block", index: 0, payload: { kind: "analyzed", items: [
        { domain: "inventory", count: dataset.inventory.length },
        { domain: "orders", count: dataset.orders.filter((o) => o.daysAgo <= 30).length }
      ]}};
      await sleep(180);
      yield { type: "block", index: 1, payload: { kind: "finding",
        en: `${atRisk.length} products are projected to hit stockout within 14 days at current daily demand. Two planted SKUs (Coral Apparel Pro, Harvest Grocery Max) are critical.`,
        bn: `${atRisk.length}টি পণ্য বর্তমান দৈনিক চাহিদায় ১৪ দিনের মধ্যে স্টকআউট হবে। দুটি পণ্য সবচেয়ে গুরুতর।`
      }};
      await sleep(160);
      const factors = [
        { label: "Critical SKUs (<8d)", labelBn: "গুরুতর SKU (<৮ দিন)", magnitude: String(atRisk.filter((i) => i.daysUntilStockout < 8).length), magnitudeBn: bn(atRisk.filter((i) => i.daysUntilStockout < 8).length) },
        { label: "At-risk SKUs", labelBn: "ঝুঁকিপূর্ণ SKU", magnitude: String(atRisk.length), magnitudeBn: bn(atRisk.length) }
      ];
      yield { type: "factor", index: 2, payload: factors };
      await sleep(160);
      const evidence: EvidenceRefPublic[] = [
        { domain: "inventory", count: atRisk.length, previewIds: atRisk.slice(0, 6).map((i) => i.productId) }
      ];
      yield { type: "evidence", index: 3, payload: evidence };
      await sleep(140);
      yield { type: "recommendation", index: 4, payload: {
        title: "Restock critical SKUs now",
        titleBn: "এখনই গুরুতর SKU রিস্টক করুন",
        action: "Submit restock orders; approval above ৳25,000.",
        actionBn: "রিস্টক অর্ডার জমা দিন; ২৫,০০০ টাকার উপরে অনুমোদন প্রয়োজন।",
        riskTier: "medium" as RiskTier
      }};
      yield { type: "done", index: 5, payload: { confidence: 0.88 } };
      return;
    }

    if (isChurn) {
      const customers = dataset.customers.filter((c) => c.churnRisk >= 0.7).slice(0, 50);
      yield { type: "block", index: 0, payload: { kind: "analyzed", items: [
        { domain: "orders", count: dataset.orders.filter((o) => o.daysAgo <= 60).length },
        { domain: "customers", count: dataset.customers.length }
      ]}};
      await sleep(160);
      yield { type: "block", index: 1, payload: { kind: "finding",
        en: `Repeat-purchase rate dropped by ${(dataset.health.churnRisePct * 100).toFixed(1)}% last 30 days vs the previous 30. ${customers.length} customers are at high churn risk.`,
        bn: `গত ৩০ দিনে পুনরায় কেনার হার ${(dataset.health.churnRisePct * 100).toFixed(1)}% কমেছে। ${bn(customers.length)} জন ক্রেতা উচ্চ চার্ন ঝুঁকিতে।`
      }};
      await sleep(160);
      const factors = [
        { label: "Δ repeat rate", labelBn: "পুনরায় কেনার হারের পরিবর্তন", magnitude: `${(dataset.health.churnRisePct * 100).toFixed(1)}%`, magnitudeBn: `${(dataset.health.churnRisePct * 100).toFixed(1)}%` },
        { label: "At-risk customers", labelBn: "ঝুঁকিপূর্ণ ক্রেতা", magnitude: String(customers.length), magnitudeBn: bn(customers.length) }
      ];
      yield { type: "factor", index: 2, payload: factors };
      await sleep(140);
      const evidence: EvidenceRefPublic[] = [
        { domain: "customers", count: customers.length, filter: { churnRisk: ">=0.7" } }
      ];
      yield { type: "evidence", index: 3, payload: evidence };
      await sleep(140);
      yield { type: "recommendation", index: 4, payload: {
        title: "Send win-back message to top 50 at-risk customers",
        titleBn: "শীর্ষ ৫০ ঝুঁকিপূর্ণ ক্রেতাকে উইন-ব্যাক বার্তা পাঠান",
        action: "Draft in Bangla + English; queue for review.",
        actionBn: "বাংলা + ইংরেজিতে খসড়া; পর্যালোচনার জন্য সারিবদ্ধ।",
        riskTier: "medium" as RiskTier
      }};
      yield { type: "done", index: 5, payload: { confidence: 0.74 } };
      return;
    }

    // Default → Dhaka dip (the headline answer for the demo)
    {
      const dhaka = dataset.byDay.slice(-30).reduce((a, b) => a + (b.byRegion.Dhaka?.revenueBdt ?? 0), 0);
      const prev = dataset.byDay.slice(-60, -30).reduce((a, b) => a + (b.byRegion.Dhaka?.revenueBdt ?? 0), 0);
      const pct = prev > 0 ? (dhaka - prev) / prev : 0;
      yield { type: "block", index: 0, payload: { kind: "analyzed", items: [
        { domain: "orders", count: dataset.orders.filter((o) => o.daysAgo <= 30).length, filter: { window: "30d" } },
        { domain: "orders", count: dataset.orders.filter((o) => o.daysAgo > 30 && o.daysAgo <= 60).length, filter: { window: "previous 30d" } },
        { domain: "customers", count: dataset.customers.filter((c) => c.region === "Dhaka").length, filter: { region: "Dhaka" } }
      ]}};
      await sleep(180);
      yield { type: "block", index: 1, payload: { kind: "finding",
        en: `Dhaka revenue fell ${(pct * 100).toFixed(1)}% over the last 30 days while every other region held flat. Two product categories and three weekdays concentrate the loss. Delivery complaints in Dhaka rose 38% in the same window.`,
        bn: `গত ৩০ দিনে ঢাকার আয় ${(pct * 100).toFixed(1)}% কমেছে; অন্যান্য অঞ্চল সমান ছিল। হ্রাস দুটি ক্যাটাগরি ও তিনটি কর্মদিবসে কেন্দ্রীভূত। একই সময়ে ঢাকায় ডেলিভারি অভিযোগ ৩৮% বেড়েছে।`
      }};
      await sleep(160);
      const factors = [
        { label: "Dhaka revenue Δ", labelBn: "ঢাকা আয়ের পরিবর্তন", magnitude: `${(pct * 100).toFixed(1)}%`, magnitudeBn: `${(pct * 100).toFixed(1)}%` },
        { label: "Other regions Δ", labelBn: "অন্যান্য অঞ্চলের পরিবর্তন", magnitude: "+0.4%", magnitudeBn: "+০.৪%" },
        { label: "Dhaka delivery complaints (7d)", labelBn: "ঢাকা ডেলিভারি অভিযোগ (৭ দিন)", magnitude: "+38%", magnitudeBn: "+৩৮%" }
      ];
      yield { type: "factor", index: 2, payload: factors };
      await sleep(140);
      const evidence: EvidenceRefPublic[] = [
        { domain: "orders", count: dataset.orders.filter((o) => o.region === "Dhaka" && o.daysAgo <= 30).length, filter: { region: "Dhaka", window: "30d" } },
        { domain: "conversations", count: 3, filter: { theme: "delivery" } }
      ];
      yield { type: "evidence", index: 3, payload: evidence };
      await sleep(140);
      yield { type: "recommendation", index: 4, payload: {
        title: "Investigate Dhaka delivery SLA breaches",
        titleBn: "ঢাকা ডেলিভারি SLA লঙ্ঘন তদন্ত",
        action: "Open an investigation; do not change pricing yet.",
        actionBn: "তদন্ত শুরু করুন; এখনই দাম পরিবর্তন করবেন না।",
        riskTier: "low" as RiskTier
      }};
      yield { type: "done", index: 5, payload: { confidence: 0.82 } };
    }
  }
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function bn(n: number) {
  const map: Record<number, string> = { 0: "০", 1: "১", 2: "২", 3: "৩", 4: "৪", 5: "৫", 6: "৬", 7: "৭", 8: "৮", 9: "৯" };
  return String(n).replace(/[0-9]/g, (d) => map[Number(d)]);
}