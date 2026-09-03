"use client";

import { create } from "zustand";
import { persist as storage } from "@/lib/persist";

export type BusinessProfile = {
  businessName: string;
  industry: string;
  city: string;
  currency: string;
  timezone: string;
  fiscalMonthStart: number;
  whatYouSell: string;
  customers: string;
  goals: string[];
};

export type IngestionSource = {
  id: string;
  connected: boolean;
  lastSync: string | null;
  objectTypes: string[];
  records: number;
  /** The user-entered value (sheet URL, phone, etc.) — masked when displayed. */
  value?: string;
  /** Optional filename for CSV upload. */
  filename?: string;
};

type BusinessState = {
  onboardingComplete: boolean;
  profile: BusinessProfile;
  sources: IngestionSource[];
  /** Per-agent execution mode override (e.g., "auto" | "approval" | "paused"). */
  agentMode: Record<string, "auto" | "approval" | "paused">;
  /** Risk thresholds in BDT or %, used by Approvals/Insights to re-tier. */
  thresholds: {
    orderValueBdt: number;
    discountPct: number;
    inventorySpendBdt: number;
    messageVolume: number;
  };
  /** Which risk tiers require approval. */
  approvalGate: { low: boolean; medium: boolean; high: boolean };
  /** Auto-approve below this risk tier. */
  autoApproveBelow: "low" | "medium" | "high" | "never";
  /** Notifications: which channels are on, and the daily digest time. */
  notifications: { inApp: boolean; email: boolean; whatsapp: boolean; digestTime: string };
  /** UI density. */
  density: "comfortable" | "compact";
  /** Global pause flag. */
  globalPaused: boolean;
  /** Agent currently pre-selected from the Ask Thalamus page. */
  selectedAgentId: string | null;
  setProfile: (p: Partial<BusinessProfile>) => void;
  completeOnboarding: () => void;
  upsertSource: (id: string, patch: Partial<IngestionSource>) => void;
  bumpSource: (id: string, records: number) => void;
  setAgentMode: (id: string, mode: "auto" | "approval" | "paused") => void;
  setThresholds: (t: Partial<BusinessState["thresholds"]>) => void;
  setApprovalGate: (g: Partial<BusinessState["approvalGate"]>) => void;
  setAutoApproveBelow: (t: BusinessState["autoApproveBelow"]) => void;
  setNotifications: (n: Partial<BusinessState["notifications"]>) => void;
  setDensity: (d: BusinessState["density"]) => void;
  setGlobalPaused: (v: boolean) => void;
  setSelectedAgent: (id: string | null) => void;
  /** Returns all config as a JSON-safe blob. */
  exportConfig(): string;
  /** Replaces state from a previously-exported JSON blob. */
  importConfig(json: string): { ok: boolean; error?: string };
};

const safeGet = <T,>(key: string, fallback: T): T => storage.get<T>(key, fallback);

const defaultProfile: BusinessProfile = {
  businessName: "",
  industry: "",
  city: "Dhaka",
  currency: "BDT",
  timezone: "Asia/Dhaka",
  fiscalMonthStart: 1,
  whatYouSell: "",
  customers: "",
  goals: []
};

const defaultSources: IngestionSource[] = [
  { id: "sheets", connected: false, lastSync: null, objectTypes: ["products", "orders"], records: 0 },
  { id: "shopify", connected: false, lastSync: null, objectTypes: ["products", "orders", "customers"], records: 0 },
  { id: "whatsapp", connected: false, lastSync: null, objectTypes: ["conversations"], records: 0 },
  { id: "facebook", connected: false, lastSync: null, objectTypes: ["orders", "customers"], records: 0 },
  { id: "instagram", connected: false, lastSync: null, objectTypes: ["orders", "customers"], records: 0 },
  { id: "csv", connected: false, lastSync: null, objectTypes: ["products", "orders", "customers", "inventory"], records: 0 },
  { id: "documents", connected: false, lastSync: null, objectTypes: ["policies", "suppliers"], records: 0 }
];

export const useBusinessStore = create<BusinessState>((set, get) => ({
  onboardingComplete: safeGet<boolean>("thalamus:onboardingComplete", false),
  profile: safeGet<BusinessProfile>("thalamus:profile", defaultProfile),
  sources: safeGet<IngestionSource[]>("thalamus:sources", defaultSources),
  agentMode: safeGet<Record<string, "auto" | "approval" | "paused">>("thalamus:agentMode", {}),
  thresholds: safeGet<BusinessState["thresholds"]>("thalamus:thresholds", {
    orderValueBdt: 25000,
    discountPct: 10,
    inventorySpendBdt: 25000,
    messageVolume: 50
  }),
  approvalGate: safeGet<BusinessState["approvalGate"]>("thalamus:approvalGate", {
    low: false,
    medium: true,
    high: true
  }),
  autoApproveBelow: safeGet<BusinessState["autoApproveBelow"]>("thalamus:autoApproveBelow", "low"),
  notifications: safeGet<BusinessState["notifications"]>("thalamus:notifications", {
    inApp: true,
    email: false,
    whatsapp: false,
    digestTime: "08:00"
  }),
  density: safeGet<BusinessState["density"]>("thalamus:density", "comfortable"),
  globalPaused: safeGet<boolean>("thalamus:globalPaused", false),
  selectedAgentId: safeGet<string | null>("thalamus:selectedAgentId", null),
  setProfile: (p) => {
    const next = { ...get().profile, ...p };
    storage.set("thalamus:profile", next);
    set({ profile: next });
  },
  completeOnboarding: () => {
    storage.set("thalamus:onboardingComplete", true);
    set({ onboardingComplete: true });
  },
  upsertSource: (id, patch) => {
    const next = get().sources.map((s) => (s.id === id ? { ...s, ...patch } : s));
    storage.set("thalamus:sources", next);
    set({ sources: next });
  },
  bumpSource: (id, records) => {
    const next = get().sources.map((s) => (s.id === id ? { ...s, records: Math.max(0, s.records + records) } : s));
    storage.set("thalamus:sources", next);
    set({ sources: next });
  },
  setAgentMode: (id, mode) => {
    const next = { ...get().agentMode, [id]: mode };
    storage.set("thalamus:agentMode", next);
    set({ agentMode: next });
  },
  setThresholds: (t) => {
    const next = { ...get().thresholds, ...t };
    storage.set("thalamus:thresholds", next);
    set({ thresholds: next });
  },
  setApprovalGate: (g) => {
    const next = { ...get().approvalGate, ...g };
    storage.set("thalamus:approvalGate", next);
    set({ approvalGate: next });
  },
  setAutoApproveBelow: (v) => {
    storage.set("thalamus:autoApproveBelow", v);
    set({ autoApproveBelow: v });
  },
  setNotifications: (n) => {
    const next = { ...get().notifications, ...n };
    storage.set("thalamus:notifications", next);
    set({ notifications: next });
  },
  setDensity: (d) => {
    storage.set("thalamus:density", d);
    set({ density: d });
  },
  setGlobalPaused: (v) => {
    storage.set("thalamus:globalPaused", v);
    set({ globalPaused: v });
  },
  setSelectedAgent: (id) => {
    storage.set("thalamus:selectedAgentId", id);
    set({ selectedAgentId: id });
  },
  exportConfig() {
    const s = get();
    return JSON.stringify(
      {
        profile: s.profile,
        sources: s.sources,
        agentMode: s.agentMode,
        thresholds: s.thresholds,
        approvalGate: s.approvalGate,
        autoApproveBelow: s.autoApproveBelow,
        notifications: s.notifications,
        density: s.density
      },
      null,
      2
    );
  },
  importConfig(json) {
    try {
      const parsed = JSON.parse(json);
      const next: Partial<BusinessState> = {};
      if (parsed.profile) next.profile = { ...get().profile, ...parsed.profile };
      if (parsed.sources) next.sources = parsed.sources;
      if (parsed.agentMode) next.agentMode = parsed.agentMode;
      if (parsed.thresholds) next.thresholds = parsed.thresholds;
      if (parsed.approvalGate) next.approvalGate = parsed.approvalGate;
      if (parsed.autoApproveBelow) next.autoApproveBelow = parsed.autoApproveBelow;
      if (parsed.notifications) next.notifications = parsed.notifications;
      if (parsed.density) next.density = parsed.density;
      // Persist each
      const cur = get();
      const merged = { ...cur, ...next } as BusinessState;
      if (next.profile) storage.set("thalamus:profile", merged.profile);
      if (next.sources) storage.set("thalamus:sources", merged.sources);
      if (next.agentMode) storage.set("thalamus:agentMode", merged.agentMode);
      if (next.thresholds) storage.set("thalamus:thresholds", merged.thresholds);
      if (next.approvalGate) storage.set("thalamus:approvalGate", merged.approvalGate);
      if (next.autoApproveBelow) storage.set("thalamus:autoApproveBelow", merged.autoApproveBelow);
      if (next.notifications) storage.set("thalamus:notifications", merged.notifications);
      if (next.density) storage.set("thalamus:density", merged.density);
      set(merged);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }
}));

/** Returns how many sources are connected — used by Overview nudge. */
export function connectedSourceCount(): number {
  return useBusinessStore.getState().sources.filter((s) => s.connected).length;
}