// Seed activity log: built from the insight lifecycle.
// Real prototype: every state transition writes here.

export type ActivityItem = {
  id: string;
  actor: "user" | string; // user or agentId
  actorLabel: string;
  verb: string;
  verbBn: string;
  target?: string;
  targetBn?: string;
  outcome?: "approved" | "rejected" | "executed" | "completed" | "failed" | "flagged";
  isoDate: string;
};

const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

export function buildActivity(): ActivityItem[] {
  return [
    {
      id: "act-1",
      actor: "automation-agent",
      actorLabel: "Automation Agent",
      verb: "completed product sync",
      verbBn: "পণ্য সিঙ্ক সম্পন্ন করেছে",
      target: "342 products",
      targetBn: "৩৪২টি পণ্য",
      outcome: "completed",
      isoDate: ago(2 * 60 * 60 * 1000)
    },
    {
      id: "act-2",
      actor: "inventory-agent",
      actorLabel: "Inventory Agent",
      verb: "raised insight",
      verbBn: "অন্তর্দৃষ্টি উত্থাপন করেছে",
      target: "2 critical SKUs will stock out within a week",
      targetBn: "২টি গুরুতর SKU এক সপ্তাহের মধ্যে স্টকআউট হবে",
      outcome: "flagged",
      isoDate: ago(3 * 60 * 60 * 1000)
    },
    {
      id: "act-3",
      actor: "user",
      actorLabel: "You",
      verb: "connected",
      verbBn: "সংযুক্ত করেছেন",
      target: "Google Sheets (demo)",
      targetBn: "গুগল শীটস (ডেমো)",
      outcome: "completed",
      isoDate: ago(5 * 60 * 60 * 1000)
    },
    {
      id: "act-4",
      actor: "marketing-agent",
      actorLabel: "Marketing Agent",
      verb: "drafted campaign",
      verbBn: "প্রচারণার খসড়া তৈরি করেছে",
      target: "Weekly-basket plan (8% off)",
      targetBn: "সাপ্তাহিক বাস্কেট প্ল্যান (৮% ছাড়)",
      outcome: "flagged",
      isoDate: ago(6 * 60 * 60 * 1000)
    },
    {
      id: "act-5",
      actor: "finance-agent",
      actorLabel: "Finance Agent",
      verb: "proposed renegotiation",
      verbBn: "পুনর্বিবেচনা প্রস্তাব করেছে",
      target: "Sylhet Tea & Beauty terms",
      targetBn: "সিলেট চা ও বিউটি শর্তাবলী",
      outcome: "flagged",
      isoDate: ago(20 * 60 * 60 * 1000)
    },
    {
      id: "act-6",
      actor: "sales-analyst",
      actorLabel: "Sales Analyst",
      verb: "explained anomaly",
      verbBn: "অসঙ্গতি ব্যাখ্যা করেছে",
      target: "Dhaka revenue down 22% in last 30d",
      targetBn: "গত ৩০ দিনে ঢাকার আয় ২২% কমেছে",
      outcome: "completed",
      isoDate: ago(24 * 60 * 60 * 1000)
    }
  ];
}