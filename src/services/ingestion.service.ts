import { dataset } from "./dataset";
import type { IngestionSourcePublic } from "./types";
import { useBusinessStore } from "@/store/business.store";
import { SOURCE_FORMS } from "./ingestion-forms";

const labels: Record<string, { label: string; labelBn: string }> = {
  sheets: { label: "Google Sheets", labelBn: "গুগল শীটস" },
  shopify: { label: "Shopify", labelBn: "শপিফাই" },
  whatsapp: { label: "WhatsApp", labelBn: "হোয়াটসঅ্যাপ" },
  facebook: { label: "Facebook", labelBn: "ফেসবুক" },
  instagram: { label: "Instagram", labelBn: "ইনস্টাগ্রাম" },
  csv: { label: "CSV / Excel", labelBn: "CSV / এক্সেল" },
  documents: { label: "Documents", labelBn: "নথি" }
};

const objectTypeMap: Record<string, string[]> = {
  sheets: ["products", "orders"],
  shopify: ["products", "orders", "customers"],
  whatsapp: ["conversations"],
  facebook: ["orders", "customers"],
  instagram: ["orders", "customers"],
  csv: ["products", "orders", "customers", "inventory"],
  documents: ["policies", "suppliers"]
};

/** Per-source "what we'd pull" record count, used as a stable baseline. */
const baselineRecordCount = (id: string): number => {
  switch (id) {
    case "sheets":
      return dataset.products.length + 1200;
    case "shopify":
      return dataset.orders.length;
    case "whatsapp":
      return dataset.conversations.length * 4;
    case "facebook":
      return 412;
    case "instagram":
      return 318;
    case "csv":
      return 2400;
    case "documents":
      return dataset.policies.length * 2;
    default:
      return 0;
  }
};

/** Sources that simulate a sync failure once, to surface the error path. */
const FAILING_SOURCES = new Set<string>([]); // deterministic — none today

export const ingestionService = {
  list(): IngestionSourcePublic[] {
    return useBusinessStore.getState().sources.map((s) => {
      const base = baselineRecordCount(s.id);
      return {
        id: s.id,
        label: labels[s.id]?.label ?? s.id,
        labelBn: labels[s.id]?.labelBn ?? s.id,
        objectTypes: objectTypeMap[s.id] ?? s.objectTypes,
        status: s.connected ? "connected" : "available",
        lastSync: s.lastSync,
        /** When connected, use the stored record count. Otherwise report the baseline as a "what you get" preview. */
        records: s.connected ? Math.max(s.records || 0, base) : base,
        value: s.value,
        filename: s.filename
      };
    });
  },
  get(id: string) {
    return this.list().find((s) => s.id === id);
  },
  /**
   * Connect or refresh a source. Validates shape via the form definition
   * and writes the entered values plus a fresh record count + timestamp to the store.
   */
  async connect(
    id: string,
    values: Record<string, string>,
    onStep?: (step: number, label: string) => void
  ): Promise<{ ok: boolean; error?: string; records: number }> {
    const form = SOURCE_FORMS[id];
    if (!form) return { ok: false, error: "Unknown source", records: 0 };
    const error = form.validate(values);
    if (error) return { ok: false, error, records: 0 };
    const steps = ["Authenticating", "Reading object types", "Reconciling records"];
    if (onStep) for (let i = 0; i < steps.length; i++) onStep(i + 1, steps[i]);
    // Simulated handshake timing.
    await new Promise((r) => setTimeout(r, 380));
    const base = baselineRecordCount(id);
    const next = useBusinessStore.getState().sources.find((s) => s.id === id);
    const previous = next?.records ?? 0;
    const isRefresh = !!next?.connected;
    const delta = isRefresh ? Math.max(0, Math.round(Math.random() * 12) - 2) : 0;
    const records = isRefresh ? previous + delta : base;
    const valueString = serialiseValue(id, values);
    const filename = id === "csv" ? (values.file || "products-export.csv") : undefined;
    useBusinessStore.getState().upsertSource(id, {
      connected: true,
      lastSync: new Date().toISOString(),
      records,
      value: valueString,
      filename
    });
    return { ok: true, records };
  },
  /** Manual sync — like connect() but keeps existing value/filename. May simulate a transient failure. */
  async sync(id: string, onStep?: (step: number, label: string) => void): Promise<{ ok: boolean; error?: string }> {
    const cur = useBusinessStore.getState().sources.find((s) => s.id === id);
    if (!cur?.connected) return { ok: false, error: "Not connected" };
    const steps = ["Refreshing token", "Reading changes", "Reconciling"];
    if (onStep) for (let i = 0; i < steps.length; i++) onStep(i + 1, steps[i]);
    await new Promise((r) => setTimeout(r, 600 + Math.random() * 600));
    if (FAILING_SOURCES.has(id)) return { ok: false, error: "Network timeout" };
    const previous = cur.records || 0;
    const delta = Math.max(0, Math.round(Math.random() * 12) - 2);
    useBusinessStore.getState().upsertSource(id, {
      lastSync: new Date().toISOString(),
      records: previous + delta
    });
    return { ok: true };
  },
  disconnect(id: string) {
    useBusinessStore.getState().upsertSource(id, {
      connected: false,
      lastSync: null,
      // Keep value but zero records so derived counts update everywhere.
      records: 0
    });
  },
  connectedIds(): string[] {
    return useBusinessStore.getState().sources.filter((s) => s.connected).map((s) => s.id);
  },
  connectedCount(): number {
    return this.connectedIds().length;
  }
};

function serialiseValue(id: string, v: Record<string, string>): string {
  if (id === "whatsapp") return `${v.country ?? ""} ${v.phone ?? ""}`.trim();
  if (id === "csv") return v.drive || v.file || "";
  return v.url || v.domain || v.handle || v.folder || v.token || "";
}