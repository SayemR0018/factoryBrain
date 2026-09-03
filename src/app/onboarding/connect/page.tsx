"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useT } from "@/lib/useT";
import { Button, DemoChip } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useBusinessStore } from "@/store/business.store";
import { ingestionService } from "@/services/ingestion.service";
import { SOURCE_FORMS, listSourceIds, maskValue, type SourceForm } from "@/services/ingestion-forms";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";

type CardState = {
  expanded: boolean;
  values: Record<string, string>;
  error: string | null;
  loading: boolean;
  step: number;
  steps: string[];
};

export default function ConnectPage() {
  const { t } = useT();
  const router = useRouter();
  const sources = useBusinessStore((s) => s.sources);
  const upsertSource = useBusinessStore((s) => s.upsertSource);
  const [state, setState] = useState<Record<string, CardState>>({});
  const [showFormFor, setShowFormFor] = useState<string | null>(null);

  // Seed any new source with empty form state
  useEffect(() => {
    setState((cur) => {
      const next = { ...cur };
      for (const id of listSourceIds()) {
        if (!next[id]) {
          next[id] = { expanded: false, values: {}, error: null, loading: false, step: 0, steps: [] };
        }
      }
      return next;
    });
  }, []);

  const connectedIds = useMemo(() => sources.filter((s) => s.connected).map((s) => s.id), [sources]);
  const connectedCount = connectedIds.length;
  const canContinue = connectedCount >= 1;

  function patch(id: string, patchObj: Partial<CardState>) {
    setState((cur) => ({ ...cur, [id]: { ...cur[id], ...patchObj } }));
  }

  async function submit(id: string) {
    const form = SOURCE_FORMS[id];
    const s = state[id];
    patch(id, { loading: true, error: null, step: 1, steps: ["Validating"] });
    const result = await ingestionService.connect(id, s.values, (step, label) =>
      patch(id, { step, steps: [...(state[id]?.steps ?? []), label] })
    );
    patch(id, { loading: false, expanded: false });
    if (!result.ok) {
      patch(id, { error: result.error ?? "Could not connect." });
    }
  }

  function useDemo(id: string) {
    const form = SOURCE_FORMS[id];
    patch(id, { values: { ...form.demoValues() }, error: null });
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      <Link href="/onboarding/profile" className="inline-flex items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary mb-8">
        <ArrowLeft size={12} /> Back
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-[28px] md:text-[36px] font-semibold tracking-tight">{t("onboarding.connect.title")}</h1>
        <p className="mt-3 text-body text-fg-secondary max-w-xl">{t("onboarding.connect.subtitle")}</p>
      </motion.div>

      <div className="mt-6 flex items-center gap-2">
        <DemoChip>Demo data sources</DemoChip>
        <span className="text-caption text-fg-tertiary">
          {connectedCount} of {listSourceIds().length} connected
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {listSourceIds().map((id) => {
          const form = SOURCE_FORMS[id];
          const s = state[id] ?? { expanded: false, values: {}, error: null, loading: false, step: 0, steps: [] };
          const source = sources.find((x) => x.id === id);
          const done = !!source?.connected;
          const showForm = s.expanded && !done;
          return (
            <div key={id} className="surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-body text-fg-primary">{form.title}</p>
                  <p className="mt-1 text-caption text-fg-tertiary truncate">
                    {done && source?.value ? maskValue(id, source.value) : "Click Connect to enter details"}
                  </p>
                </div>
                {done && (
                  <span className="inline-flex items-center gap-1 mono-pill text-[var(--risk-low)] border border-[var(--risk-low-border)] bg-[var(--risk-low-soft)] px-2 py-1 rounded-sm shrink-0">
                    <Check size={11} /> {t("integrations.connected")}
                  </span>
                )}
              </div>

              <div className="mt-3 flex items-center gap-2 flex-wrap">
                {done ? (
                  <>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        upsertSource(id, { connected: false, records: 0, lastSync: null, value: undefined, filename: undefined });
                      }}
                    >
                      {t("integrations.disconnect")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => patch(id, { expanded: true, error: null })}>
                      {t("integrations.edit")}
                    </Button>
                  </>
                ) : showForm ? (
                  <Button variant="ghost" size="sm" onClick={() => patch(id, { expanded: false, error: null })}>
                    {t("common.cancel")}
                  </Button>
                ) : (
                  <Button variant="primary" size="sm" onClick={() => patch(id, { expanded: true, error: null })}>
                    {t("integrations.connect")}
                  </Button>
                )}

                {!done && (
                  <button
                    type="button"
                    onClick={() => useDemo(id)}
                    className="ml-auto inline-flex items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary"
                  >
                    <Sparkles size={11} /> {t("connect.useDemo")}
                  </button>
                )}
              </div>

              <AnimatePresence initial={false}>
                {showForm && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 pt-4 border-t border-border-subtle space-y-3">
                      {form.fields.map((f) => (
                        <FieldRow
                          key={f.key}
                          field={f}
                          value={s.values[f.key] ?? ""}
                          onChange={(v) => patch(id, { values: { ...s.values, [f.key]: v }, error: null })}
                        />
                      ))}
                      {s.error && (
                        <p className="text-caption text-[var(--risk-high)]">{s.error}</p>
                      )}
                      {s.loading && (
                        <div>
                          <div className="flex items-center gap-2 text-caption text-fg-secondary">
                            <span className="mono-pill text-fg-tertiary">{s.step}/3</span>
                            <span className="truncate">{s.steps[s.steps.length - 1] ?? "—"}</span>
                          </div>
                          <div className="mt-1.5 h-1 rounded bg-surface overflow-hidden">
                            <div className="h-full bg-accent transition-all duration-200" style={{ width: `${(s.step / 3) * 100}%` }} />
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-end gap-2 pt-2">
                        <Button variant="primary" size="sm" onClick={() => submit(id)} disabled={s.loading}>
                          {s.loading ? "…" : t("common.confirm")} <ArrowRight size={12} />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      <div className="mt-10 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => router.push("/onboarding/understanding")}
          className="text-caption text-fg-tertiary hover:text-fg-primary"
        >
          {t("connect.skip")}
        </button>
        <Tooltip content={canContinue ? "" : t("onboarding.connect.needOne")}>
          <span>
            <Button
              variant="primary"
              size="lg"
              disabled={!canContinue}
              onClick={() => router.push("/onboarding/understanding")}
            >
              {t("onboarding.connect.cta")} <ArrowRight size={14} />
            </Button>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}

function FieldRow({
  field,
  value,
  onChange
}: {
  field: SourceForm["fields"][number];
  value: string;
  onChange: (v: string) => void;
}) {
  const { t } = useT();
  if (field.type === "file") {
    return (
      <label className="block">
        <span className="text-caption text-fg-secondary mb-1.5 block">{field.label}</span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => onChange(e.target.files?.[0]?.name ?? "")}
          className="block w-full text-caption text-fg-primary file:mr-3 file:h-7 file:px-2 file:rounded file:border file:border-border-subtle file:bg-surface-2 file:text-fg-secondary file:text-caption hover:file:border-border-strong"
        />
      </label>
    );
  }
  if (field.type === "tel" && field.countryCodes) {
    return (
      <label className="block">
        <span className="text-caption text-fg-secondary mb-1.5 block">{field.label}</span>
        <div className="flex items-stretch gap-2">
          <select
            value={value && /^\+\d+/.test(value) ? value.match(/^\+\d+/)![0] : field.countryCodes[0]}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 rounded-md bg-surface-2 border border-border-subtle px-2 text-caption text-fg-primary"
          >
            {field.countryCodes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <Input
            type="tel"
            inputMode="numeric"
            value={value.replace(/^\+\d+\s*/, "")}
            onChange={(e) => {
              const code = value.match(/^\+\d+/) ? value.match(/^\+\d+/)![0] : field.countryCodes![0];
              onChange(`${code} ${e.target.value}`);
            }}
            placeholder={field.placeholder}
          />
        </div>
      </label>
    );
  }
  return (
    <label className="block">
      <span className="text-caption text-fg-secondary mb-1.5 block">{field.label}</span>
      <Input
        type={field.type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
      />
    </label>
  );
}