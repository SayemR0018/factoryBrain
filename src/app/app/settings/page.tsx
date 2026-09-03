"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Building2,
  Palette,
  Bot,
  ShieldAlert,
  Bell,
  Database,
  Wrench,
  Save,
  Trash2,
  Download,
  Upload,
  Play,
  Sun,
  Moon,
  Monitor,
  Sparkles
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/lib/useT";
import { useBusinessStore } from "@/store/business.store";
import { useAppStore } from "@/store/app.store";
import { riskService } from "@/services/risk.service";
import { Panel } from "@/components/ui/Panel";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatBDT } from "@/lib/format";
import { cn } from "@/lib/cn";
import { goals } from "@/data/goals";
import { agentService } from "@/services/agent.service";

type SectionId = "profile" | "appearance" | "agents" | "risk" | "notifications" | "data" | "advanced";

const SECTIONS: Array<{ id: SectionId; iconKey: string; labelKey: string }> = [
  { id: "profile", iconKey: "Building2", labelKey: "settings.businessProfile" },
  { id: "appearance", iconKey: "Palette", labelKey: "settings.appearance" },
  { id: "agents", iconKey: "Bot", labelKey: "settings.autonomy" },
  { id: "risk", iconKey: "ShieldAlert", labelKey: "settings.risk" },
  { id: "notifications", iconKey: "Bell", labelKey: "settings.notifications" },
  { id: "data", iconKey: "Database", labelKey: "settings.dataSources" },
  { id: "advanced", iconKey: "Wrench", labelKey: "settings.advanced" }
];

export default function SettingsPage() {
  const { t, locale } = useT();
  const router = useRouter();
  const search = useSearchParams();
  const sectionParam = search?.get("section") as SectionId | null;
  const [active, setActive] = useState<SectionId>("profile");
  const [savedKey, setSavedKey] = useState<string | null>(null);

  // Honor ?section= deep links from the command palette.
  useEffect(() => {
    if (sectionParam && SECTIONS.some((s) => s.id === sectionParam)) {
      setActive(sectionParam);
    }
  }, [sectionParam]);

  // Auto-clear "Saved" indicator.
  useEffect(() => {
    if (!savedKey) return;
    const t1 = setTimeout(() => setSavedKey(null), 1800);
    return () => clearTimeout(t1);
  }, [savedKey]);

  function flash(key: string) {
    setSavedKey(key);
  }

  function onSelectSection(id: SectionId) {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set("section", id);
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <div className="px-6 md:px-8 py-6 max-w-5xl mx-auto" data-tour="settings">
      <h1 className="text-display font-semibold tracking-tight">{t("settings.title")}</h1>
      <p className="mt-1 text-caption text-fg-tertiary">{t("settings.subtitle")}</p>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6">
        <nav
          aria-label="Settings sections"
          className="md:sticky md:top-20 md:self-start"
        >
          <ul className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelectSection(s.id)}
                  aria-current={active === s.id ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 w-full px-3 h-9 rounded-md text-caption transition-colors text-left whitespace-nowrap",
                    active === s.id
                      ? "bg-[var(--accent-soft)] text-accent border border-[var(--accent-border)]"
                      : "text-fg-secondary hover:text-fg-primary hover:bg-surface-2 border border-transparent"
                  )}
                >
                  <SectionIcon name={s.iconKey} />
                  {t(s.labelKey) as string}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-4">
          {active === "profile" && <ProfileSection flash={flash} savedKey={savedKey} />}
          {active === "appearance" && <AppearanceSection flash={flash} savedKey={savedKey} />}
          {active === "agents" && <AgentsSection />}
          {active === "risk" && <RiskSection flash={flash} savedKey={savedKey} />}
          {active === "notifications" && <NotificationsSection flash={flash} savedKey={savedKey} />}
          {active === "data" && <DataSection />}
          {active === "advanced" && <AdvancedSection router={router} />}
        </div>
      </div>
    </div>
  );
}

function SectionIcon({ name }: { name: string }) {
  switch (name) {
    case "Building2":
      return <Building2 size={13} />;
    case "Palette":
      return <Palette size={13} />;
    case "Bot":
      return <Bot size={13} />;
    case "ShieldAlert":
      return <ShieldAlert size={13} />;
    case "Bell":
      return <Bell size={13} />;
    case "Database":
      return <Database size={13} />;
    case "Wrench":
      return <Wrench size={13} />;
    default:
      return <Sparkles size={13} />;
  }
}

function Saved({ savedKey, id }: { savedKey: string | null; id: string }) {
  if (savedKey !== id) return null;
  return (
    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-caption text-risk-low">
      <Save size={10} className="inline mr-1" />
      Saved
    </motion.p>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-2 sm:gap-4 py-2.5 border-b border-border-subtle last:border-b-0">
      <div>
        <p className="text-body text-fg-primary">{label}</p>
        {hint && <p className="mt-0.5 text-caption text-fg-tertiary">{hint}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function ProfileSection({ flash, savedKey }: { flash: (k: string) => void; savedKey: string | null }) {
  const { t } = useT();
  const profile = useBusinessStore((s) => s.profile);
  const setProfile = useBusinessStore((s) => s.setProfile);

  const goalOptions = useMemo(() => goals.slice(0, 7).map((g) => g.label), []);

  function toggleGoal(label: string) {
    const cur = profile.goals.includes(label);
    const next = cur ? profile.goals.filter((g) => g !== label) : [...profile.goals, label].slice(0, 3);
    setProfile({ goals: next });
    flash("profile");
  }

  return (
    <Panel title={t("settings.businessProfile")}>
      <Row label={t("settings.businessName")} hint="Shown in greetings and exports">
        <Input
          value={profile.businessName}
          onChange={(e) => setProfile({ businessName: e.target.value })}
          onBlur={() => flash("profile")}
        />
      </Row>
      <Row label={t("settings.industry")}>
        <Input
          value={profile.industry}
          onChange={(e) => setProfile({ industry: e.target.value })}
          onBlur={() => flash("profile")}
        />
      </Row>
      <Row label={t("settings.city")}>
        <Input
          value={profile.city}
          onChange={(e) => setProfile({ city: e.target.value })}
          onBlur={() => flash("profile")}
        />
      </Row>
      <Row label={t("settings.currency")} hint="ISO code, used in exports">
        <Input
          value={profile.currency}
          onChange={(e) => setProfile({ currency: e.target.value.toUpperCase().slice(0, 3) })}
          onBlur={() => flash("profile")}
        />
      </Row>
      <Row label={t("settings.timezone")}>
        <Input
          value={profile.timezone}
          onChange={(e) => setProfile({ timezone: e.target.value })}
          onBlur={() => flash("profile")}
        />
      </Row>
      <Row label={t("settings.fiscalMonthStart")} hint="Day of month your fiscal month starts">
        <Input
          type="number"
          min={1}
          max={28}
          value={profile.fiscalMonthStart}
          onChange={(e) => setProfile({ fiscalMonthStart: Math.max(1, Math.min(28, Number(e.target.value) || 1)) })}
          onBlur={() => flash("profile")}
          className="w-24 text-right"
        />
      </Row>
      <Row label={t("settings.whatYouSell")}>
        <textarea
          value={profile.whatYouSell}
          onChange={(e) => setProfile({ whatYouSell: e.target.value })}
          onBlur={() => flash("profile")}
          className="min-h-20 w-full rounded-md bg-surface-2 border border-border-subtle px-3 py-2 text-body text-fg-primary focus:outline-none focus:border-border-strong"
        />
      </Row>
      <Row label={t("settings.customers")}>
        <textarea
          value={profile.customers}
          onChange={(e) => setProfile({ customers: e.target.value })}
          onBlur={() => flash("profile")}
          className="min-h-20 w-full rounded-md bg-surface-2 border border-border-subtle px-3 py-2 text-body text-fg-primary focus:outline-none focus:border-border-strong"
        />
      </Row>
      <Row label={t("settings.goals")} hint="Pick up to three">
        <div className="flex flex-wrap gap-1.5">
          {goalOptions.map((g) => (
            <Chip
              key={g}
              active={profile.goals.includes(g)}
              onClick={() => toggleGoal(g)}
              disabled={!profile.goals.includes(g) && profile.goals.length >= 3}
              ariaLabel={g}
            >
              {g}
            </Chip>
          ))}
        </div>
      </Row>
      <div className="mt-3 flex justify-end"><Saved savedKey={savedKey} id="profile" /></div>
    </Panel>
  );
}

function AppearanceSection({ flash, savedKey }: { flash: (k: string) => void; savedKey: string | null }) {
  const { t } = useT();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const density = useBusinessStore((s) => s.density);
  const setDensity = useBusinessStore((s) => s.setDensity);

  return (
    <Panel title={t("settings.appearance")}>
      <Row label={t("settings.language")}>
        <LanguageToggle />
      </Row>
      <Row label={t("settings.theme")} hint="Light, dark, or follow system">
        <div className="inline-flex rounded-md border border-border-subtle p-0.5 bg-surface-2" role="radiogroup">
          {[
            { v: "light", Icon: Sun, label: t("settings.themeLight") },
            { v: "dark", Icon: Moon, label: t("settings.themeDark") },
            { v: "system", Icon: Monitor, label: t("settings.themeSystem") }
          ].map((o) => {
            const active = theme === o.v;
            return (
              <Tooltip key={o.v} content={o.label as string}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => { setTheme(o.v as any); flash("appearance"); }}
                  className={cn(
                    "size-8 rounded inline-flex items-center justify-center transition-colors",
                    active
                      ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]"
                      : "text-fg-secondary hover:text-fg-primary"
                  )}
                >
                  <o.Icon size={14} />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </Row>
      <Row label={t("settings.density")}>
        <div className="inline-flex rounded-md border border-border-subtle p-0.5 bg-surface-2">
          {(["comfortable", "compact"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => { setDensity(d); flash("appearance"); }}
              aria-pressed={density === d}
              className={cn(
                "h-8 px-3 text-caption rounded transition-colors",
                density === d ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]" : "text-fg-secondary hover:text-fg-primary"
              )}
            >
              {t(d === "comfortable" ? "settings.densityComfortable" : "settings.densityCompact") as string}
            </button>
          ))}
        </div>
      </Row>
      <div className="mt-3 flex justify-end"><Saved savedKey={savedKey} id="appearance" /></div>
    </Panel>
  );
}

function AgentsSection() {
  const { t } = useT();
  const agents = useMemo(() => agentService.list(), []);
  const agentMode = useBusinessStore((s) => s.agentMode);
  const setAgentMode = useBusinessStore((s) => s.setAgentMode);
  const globalPaused = useBusinessStore((s) => s.globalPaused);
  const setGlobalPaused = useBusinessStore((s) => s.setGlobalPaused);

  return (
    <>
      <Panel title={t("settings.autonomy")}>
        <Row label={t("settings.globalPause")} hint="Stops every agent immediately">
          <label className="inline-flex items-center gap-2 text-caption text-fg-primary">
            <input
              type="checkbox"
              checked={globalPaused}
              onChange={(e) => setGlobalPaused(e.target.checked)}
              className="accent-accent"
            />
            {globalPaused ? "All agents paused" : "All agents running"}
          </label>
        </Row>
        <Row label={t("settings.perAgentMode")} hint="Override each agent's autonomy">
          <div className="space-y-2">
            {agents.map((a) => {
              const m = agentMode[a.id] ?? "auto";
              return (
                <div
                  key={a.id}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-md border border-border-subtle bg-surface-2"
                >
                  <div className="min-w-0">
                    <p className="text-body text-fg-primary">{a.name}</p>
                    <p className="text-caption text-fg-tertiary truncate">{a.purpose}</p>
                  </div>
                  <div className="inline-flex rounded-md border border-border-subtle bg-canvas p-0.5 shrink-0">
                    {(["auto", "approval", "paused"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={m === mode}
                        onClick={() => setAgentMode(a.id, mode)}
                        className={cn(
                          "h-7 px-2.5 text-caption rounded transition-colors",
                          m === mode ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]" : "text-fg-secondary hover:text-fg-primary"
                        )}
                      >
                        {t(`agents.autonomy.${mode}`) as string}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Row>
      </Panel>
    </>
  );
}

function RiskSection({ flash, savedKey }: { flash: (k: string) => void; savedKey: string | null }) {
  const { t, locale } = useT();
  const thresholds = useBusinessStore((s) => s.thresholds);
  const setThresholds = useBusinessStore((s) => s.setThresholds);
  const approvalGate = useBusinessStore((s) => s.approvalGate);
  const setApprovalGate = useBusinessStore((s) => s.setApprovalGate);
  const autoApproveBelow = useBusinessStore((s) => s.autoApproveBelow);
  const setAutoApproveBelow = useBusinessStore((s) => s.setAutoApproveBelow);
  // Legacy local-only fallback for the inventory threshold, kept for backward compatibility.
  const legacyThreshold = riskService.read().inventoryOrderThresholdBdt;
  const [legacy, setLegacy] = useState(legacyThreshold);

  return (
    <Panel title={t("settings.risk")}>
      <Row label={t("settings.thresholdOrderValue")} hint="Orders above this need approval">
        <Input
          type="number"
          value={thresholds.orderValueBdt}
          onChange={(e) => setThresholds({ orderValueBdt: Number(e.target.value) || 0 })}
          onBlur={() => flash("risk")}
          className="w-32 text-right"
        />
      </Row>
      <Row label={t("settings.thresholdDiscount")} hint="Discounts above this % need approval">
        <Input
          type="number"
          value={thresholds.discountPct}
          onChange={(e) => setThresholds({ discountPct: Number(e.target.value) || 0 })}
          onBlur={() => flash("risk")}
          className="w-24 text-right"
        />
      </Row>
      <Row label={t("settings.thresholdInventorySpend")} hint="Restock purchases above this need approval">
        <Input
          type="number"
          value={thresholds.inventorySpendBdt}
          onChange={(e) => setThresholds({ inventorySpendBdt: Number(e.target.value) || 0 })}
          onBlur={() => flash("risk")}
          className="w-32 text-right"
        />
      </Row>
      <Row label={t("settings.thresholdMessageVolume")} hint="Outbound message batches above this need approval">
        <Input
          type="number"
          value={thresholds.messageVolume}
          onChange={(e) => setThresholds({ messageVolume: Number(e.target.value) || 0 })}
          onBlur={() => flash("risk")}
          className="w-24 text-right"
        />
      </Row>
      <Row label={t("settings.inventoryOrderThreshold")} hint="Inventory Agent auto-suggests below this; approval above">
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={legacy}
            onChange={(e) => setLegacy(Number(e.target.value))}
            className="w-32 text-right"
          />
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              riskService.update({ inventoryOrderThresholdBdt: legacy || 25000 });
              flash("risk");
            }}
          >
            <Save size={12} /> {t("settings.save")}
          </Button>
        </div>
        <p className="mt-1 text-caption text-fg-tertiary">
          Current: {formatBDT(legacy, locale)}
        </p>
      </Row>
      <Row label={t("settings.approvalGate")} hint="Which risk tiers need approval">
        <div className="inline-flex rounded-md border border-border-subtle bg-surface-2 p-0.5">
          {(["low", "medium", "high"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={approvalGate[r]}
              onClick={() => { setApprovalGate({ [r]: !approvalGate[r] }); flash("risk"); }}
              className={cn(
                "h-8 px-3 text-caption rounded transition-colors",
                approvalGate[r] ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]" : "text-fg-secondary hover:text-fg-primary"
              )}
            >
              {t(`risk.${r}`) as string}
            </button>
          ))}
        </div>
      </Row>
      <Row label={t("settings.autoApproveBelow")} hint="Skip approval under this tier">
        <select
          value={autoApproveBelow}
          onChange={(e) => { setAutoApproveBelow(e.target.value as any); flash("risk"); }}
          className="h-9 rounded-md bg-surface-2 border border-border-subtle px-2 text-caption text-fg-primary"
        >
          <option value="never">Never</option>
          <option value="low">{t("risk.low") as string}</option>
          <option value="medium">{t("risk.medium") as string}</option>
          <option value="high">{t("risk.high") as string}</option>
        </select>
      </Row>
      <div className="mt-3 flex justify-end"><Saved savedKey={savedKey} id="risk" /></div>
    </Panel>
  );
}

function NotificationsSection({ flash, savedKey }: { flash: (k: string) => void; savedKey: string | null }) {
  const { t } = useT();
  const notifications = useBusinessStore((s) => s.notifications);
  const setNotifications = useBusinessStore((s) => s.setNotifications);

  return (
    <Panel title={t("settings.notifications")}>
      <Row label={t("settings.channelInApp")} hint="Show inside the dashboard">
        <Toggle
          checked={notifications.inApp}
          onChange={(v) => { setNotifications({ inApp: v }); flash("notifications"); }}
        />
      </Row>
      <Row label={t("settings.channelEmail")} hint="Daily digest to your inbox">
        <Toggle
          checked={notifications.email}
          onChange={(v) => { setNotifications({ email: v }); flash("notifications"); }}
        />
      </Row>
      <Row label={t("settings.channelWhatsapp")} hint="Approval asks via WhatsApp">
        <Toggle
          checked={notifications.whatsapp}
          onChange={(v) => { setNotifications({ whatsapp: v }); flash("notifications"); }}
        />
      </Row>
      <Row label={t("settings.digestTime")} hint="When the daily summary runs">
        <Input
          type="time"
          value={notifications.digestTime}
          onChange={(e) => setNotifications({ digestTime: e.target.value })}
          onBlur={() => flash("notifications")}
          className="w-32"
        />
      </Row>
      <div className="mt-3 flex justify-end"><Saved savedKey={savedKey} id="notifications" /></div>
    </Panel>
  );
}

function DataSection() {
  const { t } = useT();
  const router = useRouter();
  const exportConfig = useBusinessStore((s) => s.exportConfig);
  const importConfig = useBusinessStore((s) => s.importConfig);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function doExport() {
    const blob = new Blob([exportConfig()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "thalamus-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function doImport() {
    const r = importConfig(importText);
    setImportMsg(r.ok ? "Imported" : `Import failed: ${r.error ?? "unknown"}`);
    setImportText("");
    setTimeout(() => setImportMsg(null), 2400);
  }

  return (
    <>
      <Panel title={t("settings.dataSources")} subtitle={t("settings.dataSourcesBody")}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-body text-fg-primary">Integrations</p>
          <Button variant="secondary" size="sm" onClick={() => router.push("/app/integrations")}>
            {t("settings.openIntegrations")}
          </Button>
        </div>
      </Panel>

      <Panel className="mt-4" title={t("settings.advanced")}>
        <Row label={t("settings.exportConfig")} hint="Download a JSON snapshot of your settings">
          <Button variant="secondary" size="sm" onClick={doExport}>
            <Download size={12} /> JSON
          </Button>
        </Row>
        <Row label={t("settings.importConfig")} hint="Paste a JSON snapshot to restore">
          <div className="space-y-2">
            <textarea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder='{ "profile": {...}, "thresholds": {...} }'
              className="min-h-24 w-full rounded-md bg-surface-2 border border-border-subtle px-3 py-2 text-caption text-fg-primary font-mono focus:outline-none focus:border-border-strong"
            />
            <div className="flex items-center justify-end gap-2">
              {importMsg && <span className="text-caption text-fg-secondary">{importMsg}</span>}
              <Button variant="primary" size="sm" disabled={!importText.trim()} onClick={doImport}>
                <Upload size={12} /> Import
              </Button>
            </div>
          </div>
        </Row>
      </Panel>
    </>
  );
}

function AdvancedSection({ router }: { router: ReturnType<typeof useRouter> }) {
  const { t } = useT();
  const resetDemo = useAppStore((s) => s.resetDemo);
  const [confirmReset, setConfirmReset] = useState(false);

  function restartTour() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("thalamus:restart-tour"));
    }
  }

  function doReset() {
    resetDemo();
    router.replace("/onboarding/welcome");
  }

  return (
    <Panel title={t("settings.advanced")}>
      <Row label={t("settings.restartTour")} hint="Replay the onboarding walkthrough">
        <Button variant="secondary" size="sm" onClick={restartTour}>
          <Play size={12} /> {t("tour.restart")}
        </Button>
      </Row>
      <Row label={t("settings.resetDemo")} hint="Wipe everything and start over">
        {!confirmReset ? (
          <Button variant="danger" size="sm" onClick={() => setConfirmReset(true)}>
            <Trash2 size={12} /> {t("settings.resetDemo")}
          </Button>
        ) : (
          <div className="flex items-center justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmReset(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" size="sm" onClick={doReset}>
              {t("common.confirm")}
            </Button>
          </div>
        )}
      </Row>
    </Panel>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-11 rounded-full transition-colors",
        checked ? "bg-[var(--btn-primary-bg)]" : "bg-surface-2 border border-border-subtle"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-5 rounded-full transition-transform",
          checked ? "translate-x-5 bg-[var(--btn-primary-fg)]" : "translate-x-0.5 bg-fg-secondary"
        )}
      />
    </button>
  );
}
