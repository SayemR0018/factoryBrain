// Static agent roster — matches whitepaper's seven sub-agents.
export type AgentDef = {
  id: string;
  name: string;
  nameBn: string;
  purpose: string;
  purposeBn: string;
  risk: "low" | "medium" | "high";
  execution: "auto" | "approval_required" | "auto_suggest_with_threshold" | "per_policy";
  model: string;
  contextSlices: string[];
  status: "ready" | "draft";
};

export const agents: AgentDef[] = [
  {
    id: "sales-analyst",
    name: "Sales Analyst",
    nameBn: "সেলস বিশ্লেষক",
    purpose: "Summarise revenue, customer, and pipeline trends; explain anomalies",
    purposeBn: "আয়, ক্রেতা ও পাইপলাইন প্রবণতা সারসংক্ষেপ; অসঙ্গতি ব্যাখ্যা",
    risk: "low",
    execution: "auto",
    model: "Mid-tier reasoning (GPT-4.1-mini / Claude Sonnet small)",
    contextSlices: ["orders", "customers", "products"],
    status: "ready"
  },
  {
    id: "marketing-agent",
    name: "Marketing Agent",
    nameBn: "মার্কেটিং এজেন্ট",
    purpose: "Draft campaign copy, promos, and social posts in Bangla and English",
    purposeBn: "বাংলা ও ইংরেজিতে প্রচারণার কপি, প্রমোশন ও সোশ্যাল পোস্ট খসড়া",
    risk: "medium",
    execution: "approval_required",
    model: "Strong creative-writer (Claude Sonnet / GPT-4.1)",
    contextSlices: ["products", "customers", "campaigns"],
    status: "ready"
  },
  {
    id: "inventory-agent",
    name: "Inventory Agent",
    nameBn: "ইনভেন্টরি এজেন্ট",
    purpose: "Forecast demand and recommend restocks using statistical baseline + LLM rationale",
    purposeBn: "পরিসংখ্যানিক ভিত্তি + LLM যুক্তি ব্যবহার করে চাহিদা পূর্বাভাস ও রিস্টক সুপারিশ",
    risk: "medium",
    execution: "auto_suggest_with_threshold",
    model: "Structured-output (GPT-4.1 json_schema) + Holt-Winters forecast",
    contextSlices: ["products", "inventory", "orders", "suppliers"],
    status: "ready"
  },
  {
    id: "customer-success",
    name: "Customer Success",
    nameBn: "কাস্টমার সাকসেস",
    purpose: "Surface themes from chat, reviews, and feedback; flag churn risk",
    purposeBn: "চ্যাট, পর্যালোচনা ও প্রতিক্রিয়া থেকে থিম উন্মোচন; চার্ন ঝুঁকি চিহ্নিত",
    risk: "low",
    execution: "auto",
    model: "Mid-tier (Claude Sonnet / GPT-4.1-mini)",
    contextSlices: ["conversations", "customers", "orders"],
    status: "ready"
  },
  {
    id: "finance-agent",
    name: "Finance Agent",
    nameBn: "ফাইন্যান্স এজেন্ট",
    purpose: "Reason over cashflow, margins, and supplier commitments; every action reviewed",
    purposeBn: "ক্যাশফ্লো, মার্জিন ও সরবরাহকারী প্রতিশ্রুতি বিশ্লেষণ; প্রতিটি পদক্ষেপ পর্যালোচিত",
    risk: "high",
    execution: "approval_required",
    model: "Frontier-tier (Claude Opus / GPT-5 class)",
    contextSlices: ["orders", "suppliers", "products", "policies"],
    status: "ready"
  },
  {
    id: "policy-docs-agent",
    name: "Policy & Docs Agent",
    nameBn: "নীতি ও নথি এজেন্ট",
    purpose: "Interpret return policy, supplier agreements, contracts",
    purposeBn: "ফেরত নীতি, সরবরাহকারী চুক্তি, চুক্তিপত্র ব্যাখ্যা",
    risk: "high",
    execution: "approval_required",
    model: "Frontier-tier long-context (Claude Opus / GPT-5 class)",
    contextSlices: ["policies", "suppliers", "conversations"],
    status: "ready"
  },
  {
    id: "automation-agent",
    name: "Automation Agent",
    nameBn: "অটোমেশন এজেন্ট",
    purpose: "Execute actions on the side-effect surface; risk set per policy",
    purposeBn: "পার্শ্ব-প্রতিক্রিয়া পৃষ্ঠে পদক্ষেপ কার্যকর; ঝুঁকি নীতি অনুযায়ী",
    risk: "per_policy" as any,
    execution: "per_policy",
    model: "Tool-reliable (Claude Sonnet)",
    contextSlices: ["*"],
    status: "ready"
  }
];