"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, ArrowDownRight, AlertTriangle, Sparkles, ShieldCheck, PlugZap, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { useT } from "@/lib/useT";
import { Panel } from "@/components/ui/Panel";
import { Sparkline } from "@/components/ui/Sparkline";
import { StageBadge, RiskPill } from "@/components/ui/StatusPill";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { Button } from "@/components/ui/Button";
import { LineBoardPanel } from "@/components/overview/LineBoardPanel";
import { BriefCard } from "@/components/overview/BriefCard";
import { metricService } from "@/services/metric.service";
import { insightService } from "@/services/insight.service";
import { approvalService } from "@/services/approval.service";
import { activityService } from "@/services/activity.service";
import { businessService } from "@/services/business.service";
import { factoryTools } from "@/services/factory.tools";
import type { EnergyDutyTool } from "@/services/factory.tools";
import { useAppStore } from "@/store/app.store";
import { useBusinessStore } from "@/store/business.store";
import { connectedSourceCount } from "@/store/business.store";
import { useFactoryBrainLiveStore, type TickSnapshot } from "@/store/factoryBrain.live.store";
import { formatBDT, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { useMounted } from "@/lib/persist";
import type { SensorReading } from "@/data/sensors";

/** Periodically (or manually) POST /api/sensors/ingest and store the
 *  resulting snapshot. Reuses the SensorReading types from the route. */
function useLiveIngest({ intervalMs = 6000 }: { intervalMs?: number }) {
  const setSnapshot = useFactoryBrainLiveStore((s) => s.setSnapshot);
  const setFetching = useFactoryBrainLiveStore((s) => s.setFetching);
  const setError = useFactoryBrainLiveStore((s) => s.setError);
  const inflight = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (inflight.current) inflight.current.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setFetching(true);
    try {
      const res = await fetch("/api/sensors/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`ingest_${res.status}`);
      const data = (await res.json()) as TickSnapshot & { readings: SensorReading[] };
      setSnapshot({
        tick: data.tick,
        lines: data.lines ?? [],
        machines: data.machines ?? [],
        readings: data.readings ?? [],
        appliedAt: new Date().toISOString()
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "ingest_failed");
      }
    } finally {
      if (inflight.current === ctrl) inflight.current = null;
      setFetching(false);
    }
  }, [setSnapshot, setFetching, setError]);

  useEffect(() => {
    // First tick on mount.
    void run();
    const id = setInterval(() => {
      void run();
    }, intervalMs);
    return () => {
      clearInterval(id);
      if (inflight.current) inflight.current.abort();
    };
  }, [run, intervalMs]);

  return { run };
}

export default function OverviewPage() {
  const { t, locale } = useT();
  const search = useSearchParams();
  const mounted = useMounted();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 800);
    return () => clearInterval(id);
  }, []);

  const health = useMemo(() => metricService.health(), [tick]);
  const profile = useMemo(() => businessService.getProfile(), [tick, mounted]);
  const name = profile.businessName || profile.industry || "Your business";

  const pinned = useMemo(() => insightService.feed({ stage: "suggested" }).slice(0, 3), [tick]);
  const approvals = useMemo(() => approvalService.pending().slice(0, 2), [tick]);
  const activity = useMemo(() => activityService.recent({ limit: 5 }), [tick]);
  const sourcesCount = mounted ? connectedSourceCount() : 0;

  // First-time arrival on Overview after onboarding: mark + tour trigger.
  useEffect(() => {
    if (!mounted) return;
    if (!useAppStore.getState().onboardedAt && useBusinessStore.getState().onboardingComplete) {
      useAppStore.getState().markOnboarded();
    }
  }, [mounted]);

  const revDelta = health.revenuePrev30 > 0 ? (health.revenue30 - health.revenuePrev30) / health.revenuePrev30 : 0;
  const custDelta = health.activeCustomersPrev > 0 ? (health.activeCustomers - health.activeCustomersPrev) / health.activeCustomersPrev : 0;

  // Live simulated sensor stream (extends the page; existing KPIs above are unchanged).
  const { run: runTick } = useLiveIngest({ intervalMs: 6000 });
  const snapshot = useFactoryBrainLiveStore((s) => s.snapshot);
  const fetching = useFactoryBrainLiveStore((s) => s.fetching);
  const liveError = useFactoryBrainLiveStore((s) => s.error);

  // Snapshot-derived KPIs. A small local history buffer keeps a 12-point
  // sparkline per metric so cards visibly move over time.
  const [sparks, setSparks] = useState<{ eff: number[]; uptime: number[]; energy: number[] }>({
    eff: [],
    uptime: [],
    energy: []
  });
  const liveLines = snapshot?.lines ?? [];
  const liveMachines = snapshot?.machines ?? [];
  const avgEff = liveLines.length
    ? liveLines.reduce((acc, l) => acc + l.efficiency, 0) / liveLines.length
    : 0;
  const avgUptime = liveLines.length
    ? liveLines.reduce((acc, l) => acc + l.uptime, 0) / liveLines.length
    : 0;
  const totalEnergy = liveLines.reduce((acc, l) => acc + l.energyKwh, 0);
  const machinesDown = liveMachines.filter((m) => m.status === "down").length;
  const machinesAtRisk = liveMachines.filter((m) => m.status === "at_risk").length;

  useEffect(() => {
    if (!snapshot) return;
    setSparks((s) => ({
      eff: pushSample(s.eff, avgEff, 12),
      uptime: pushSample(s.uptime, avgUptime, 12),
      energy: pushSample(s.energy, totalEnergy, 12)
    }));
  }, [snapshot, avgEff, avgUptime, totalEnergy]);

  // Deterministic compressor duty recommendation. Re-derives whenever the
  // live snapshot advances so the card visibly responds to the tick.
  const energyRec = useMemo<EnergyDutyTool | null>(() => {
    if (!snapshot) return null;
    try {
      return factoryTools.recommend_energy_duty({ timeframe: "1h" });
    } catch {
      return null;
    }
  }, [snapshot]);

  return (
    <div className="px-6 md:px-8 py-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <p className="text-caption text-fg-tertiary">{greetingFor(t, name)}</p>
        <h1 className="mt-1 text-display font-semibold tracking-tight">{name}</h1>
      </motion.div>

      <div
        className="mt-4 flex flex-wrap items-center gap-2 text-caption"
        data-tour="judge-walkthrough"
        aria-label="Demo walkthrough"
      >
        <span className="mono-pill text-fg-tertiary">
          {locale === "bn" ? "ডেমো পথ:" : "Demo path:"}
        </span>
        <span className="mono-pill border border-border-subtle bg-surface-2 px-2 py-1 rounded-sm text-fg-secondary">
          1. {locale === "bn" ? "সিমুলেট টিক" : "Simulate tick"}
        </span>
        <Link href="/app/agents" className="mono-pill border border-border-subtle bg-surface-2 px-2 py-1 rounded-sm text-accent hover:underline">
          2. {locale === "bn" ? "এজেন্ট রান" : "Run agents"}
        </Link>
        <Link href="/app/activity" className="mono-pill border border-border-subtle bg-surface-2 px-2 py-1 rounded-sm text-accent hover:underline">
          3. {locale === "bn" ? "ফ্লোর অ্যালার্ট" : "Floor alerts"}
        </Link>
        <Link href="/app/vision" className="mono-pill border border-border-subtle bg-surface-2 px-2 py-1 rounded-sm text-accent hover:underline">
          4. Vision
        </Link>
        <Link href="/app/ask?q=compressor%20duty" className="mono-pill border border-border-subtle bg-surface-2 px-2 py-1 rounded-sm text-accent hover:underline">
          5. Ask
        </Link>
      </div>

      {/* Morning brief — deterministic demo summary (no LLM). */}
      <div className="mt-6">
        <BriefCard />
      </div>

      <Panel
        className="mt-6"
        title={t("overview.businessHealth")}
        subtitle={t("overview.trend")}
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="overview-kpis">
          <Link href="/app/insights?filter=revenue" className="block">
            <Metric
              label={t("overview.revenue")}
              value={formatBDT(health.revenue30, locale)}
              delta={revDelta}
              locale={locale}
              spark={health.revenueTrend}
            />
          </Link>
          <Link href="/app/insights?filter=customers" className="block">
            <Metric
              label={t("overview.customers")}
              value={formatNumber(health.activeCustomers, locale)}
              delta={custDelta}
              locale={locale}
            />
          </Link>
          <Link href="/app/insights?filter=stockout" className="block">
            <Metric
              label={t("overview.inventory")}
              value={`${health.inventoryAtRisk}`}
              delta={-0.18}
              locale={locale}
              note="at risk < 14d"
            />
          </Link>
        </div>
      </Panel>

      {/* Live sensor tick — extends the page without touching existing layout. */}
      <Panel
        className="mt-6"
        title="Factory Brain — live tick"
        subtitle={
          snapshot
            ? `Last simulated update ${formatRelative(snapshot.appliedAt, locale)} · tick ${snapshot.tick}`
            : "Awaiting first simulated tick…"
        }
        right={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption border border-border-subtle bg-[var(--accent-soft)] text-accent"
              aria-label="Simulated data"
            >
              Simulated
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void runTick()}
              disabled={fetching}
              data-testid="simulate-tick"
            >
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw size={14} className={fetching ? "animate-spin" : undefined} />
                Simulate tick
              </span>
            </Button>
          </div>
        }
      >
        {!snapshot ? (
          <p className="text-caption text-fg-tertiary">
            {liveError
              ? `Tick failed: ${liveError}. Retrying…`
              : "Calling /api/sensors/ingest on mount…"}
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <LiveMetric
              label="Avg line efficiency"
              value={formatPercent(avgEff, locale)}
              delta={sparkDelta(sparks.eff)}
              spark={sparks.eff}
              locale={locale}
              note={`${liveLines.length} lines`}
              goodDir="up"
            />
            <LiveMetric
              label="Avg uptime"
              value={formatPercent(avgUptime, locale)}
              delta={sparkDelta(sparks.uptime)}
              spark={sparks.uptime}
              locale={locale}
              note="rolling 6s"
              goodDir="up"
            />
            <LiveMetric
              label="Energy (kWh)"
              value={formatNumber(Math.round(totalEnergy), locale)}
              delta={sparkDelta(sparks.energy)}
              spark={sparks.energy}
              locale={locale}
              note="accumulated"
              goodDir="down"
            />
            <LiveMetric
              label="Machines down"
              value={`${machinesDown}`}
              delta={null}
              locale={locale}
              note={`${machinesAtRisk} at risk`}
              tone={machinesDown > 0 ? "risk" : "neutral"}
            />
            <LiveMetric
              label="Latest readings"
              value={`${snapshot.readings.length}`}
              delta={null}
              locale={locale}
              note={`sim tick ${snapshot.tick}`}
            />
          </div>
        )}
      </Panel>

      {/* Live line board — six lines with traffic-light bottleneck, efficiency
          vs SAH, WIP, NPT. Auto-refreshes when the Simulate tick above fires. */}
      <div className="mt-4">
        <LineBoardPanel />
      </div>

      {/* Deterministic compressor duty recommendation. Explicit
          Simulated / not-RL labeling so the demo surface never reads as a
          learned policy. */}
      <Panel
        className="mt-6"
        title="Energy duty recommendation"
        subtitle={
          energyRec
            ? `${energyRec.basedOn.window} window · ${energyRec.basedOn.sensorReadings} energy readings · ${energyRec.basedOn.lineCount} lines`
            : "Awaiting first energy reading…"
        }
        right={
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-caption border border-border-subtle bg-[var(--accent-soft)] text-accent"
              aria-label="Simulated — not reinforcement learning"
              data-testid="energy-duty-simulated-pill"
            >
              Simulated · not RL
            </span>
          </div>
        }
      >
        {!energyRec ? (
          <p className="text-caption text-fg-tertiary">
            The compressor duty card surfaces once the live tick streams its first energy reading.
          </p>
        ) : (
          <EnergyDutyCard rec={energyRec} locale={locale} />
        )}
      </Panel>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Panel className="lg:col-span-2" title={t("overview.importantToday")} subtitle="Top insights from the workforce">
          <div data-tour="overview-important">
            {pinned.length === 0 && <p className="text-caption text-fg-tertiary">{t("overview.nothingImportant")}</p>}
            <ul className="space-y-2.5">
              {pinned.map((i) => (
                <li key={i.id} className="surface-2 p-3">
                  <Link href={`/app/insights?focus=${i.id}`} className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body text-fg-primary truncate">{locale === "bn" ? i.titleBn : i.title}</p>
                      <p className="mt-0.5 text-caption text-fg-tertiary truncate">{i.agentLabel}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <RiskPill tier={i.recommendation.riskTier} label={t(`risk.${i.recommendation.riskTier}`) as string} />
                      <StageBadge stage={i.stage} label={t(`insights.stages.${i.stage}`) as string} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel title={t("overview.recommendedActions")} subtitle="Decisions for you">
          <div data-tour="overview-actions">
            {approvals.length === 0 ? (
              <p className="text-caption text-fg-tertiary">{t("approvals.empty")}</p>
            ) : (
              <ul className="space-y-2.5">
                {approvals.map((a) => (
                  <li key={a.id} className="surface-2 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-body text-fg-primary truncate">{locale === "bn" ? a.titleBn : a.title}</p>
                        <p className="mt-0.5 text-caption text-fg-tertiary truncate">{a.recommendation.action}</p>
                      </div>
                      <RiskBadge tier={a.recommendation.riskTier} label={t(`risk.${a.recommendation.riskTier}`) as string} size="sm" />
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <Button
                        variant="success"
                        size="sm"
                        onClick={() => {
                          approvalService.approve(a.id);
                          setTick((n) => n + 1);
                        }}
                      >
                        {t("approvals.approve")}
                      </Button>
                      <Link
                        href={`/app/approvals?focus=${a.id}`}
                        className="text-caption text-accent hover:underline"
                      >
                        {t("approvals.viewDetails")}
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </div>

      <Panel className="mt-6" title={t("overview.recentActivity")} subtitle="">
        {activity.length === 0 ? (
          <p className="text-caption text-fg-tertiary">{t("overview.noActivity")}</p>
        ) : (
          <ul className="divide-y divide-border-subtle">
            {activity.map((a) => (
              <li key={a.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span className="size-7 rounded-md bg-surface-2 flex items-center justify-center text-fg-tertiary">
                    {a.actor === "user" ? <ShieldCheck size={14} /> : <Sparkles size={14} />}
                  </span>
                  <div className="min-w-0">
                    <p className="text-body text-fg-primary truncate">
                      <span className="text-fg-secondary">{a.actorLabel}</span>{" "}
                      <span>{locale === "bn" ? a.verbBn : a.verb}</span>{" "}
                      {a.target && <span className="text-fg-secondary">{locale === "bn" ? a.targetBn : a.target}</span>}
                    </p>
                  </div>
                </div>
                <span className="text-caption text-fg-tertiary shrink-0">{formatRelative(a.isoDate, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {sourcesCount < 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 surface-2 p-4 flex items-start gap-3"
        >
          <span className="size-7 rounded-md bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center shrink-0 text-accent">
            <PlugZap size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-primary">{t("overview.nudgeConnect")}</p>
            <p className="text-caption text-fg-tertiary mt-1">{t("overview.nudgeConnectBody")}</p>
          </div>
          <Link href="/app/integrations" className="text-caption text-accent hover:underline inline-flex items-center gap-1">
            {t("common.search")} <ArrowUpRight size={12} />
          </Link>
        </motion.div>
      )}

      {health.dhakaDip.pct < -0.05 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-6 surface-2 p-4 flex items-start gap-3">
          <span className="size-7 rounded-md bg-[var(--risk-medium-soft)] border border-[var(--risk-medium-border)] flex items-center justify-center shrink-0">
            <AlertTriangle size={14} className="text-[var(--risk-medium)]" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body text-fg-primary">
              {locale === "bn"
                ? `ঢাকার আয় ${(health.dhakaDip.pct * 100).toFixed(1)}% কমেছে — সিঙ্গেল সবচেয়ে বড় ঝুঁকি।`
                : `Dhaka revenue down ${(health.dhakaDip.pct * 100).toFixed(1)}% — single largest risk.`}
            </p>
            <p className="text-caption text-fg-tertiary mt-1">
              {locale === "bn" ? "অনুমোদন ও কার্যকলাপ স্ক্রিনে বিস্তারিত।" : "Details in Approvals and Activity."}
            </p>
          </div>
          <Link href="/app/insights?focus=ins-1" className="text-caption text-accent hover:underline inline-flex items-center gap-1">
            {t("common.search")} <ArrowDownRight size={12} className="rotate-45" />
          </Link>
        </motion.div>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  delta,
  locale,
  spark,
  note
}: {
  label: string;
  value: string;
  delta: number;
  locale: "en" | "bn";
  spark?: number[];
  note?: string;
}) {
  const isUp = delta >= 0;
  return (
    <div className="surface-2 p-4">
      <p className="text-caption text-fg-tertiary">{label}</p>
      <p className="mt-1 text-[28px] leading-[34px] font-semibold tracking-tight">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        <span
          className={
            "inline-flex items-center gap-1 text-caption " +
            (isUp ? "text-[var(--risk-low)]" : "text-[var(--risk-high)]")
          }
        >
          {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {formatPercent(Math.abs(delta), locale)}
        </span>
        {note && <span className="text-caption text-fg-tertiary">{note}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline values={spark} width={220} height={36} stroke={isUp ? "var(--risk-low)" : "var(--risk-high)"} />
        </div>
      )}
    </div>
  );
}

function greetingFor(t: (k: string, p?: Record<string, string | number>) => string, name: string) {
  const h = new Date().getHours();
  if (h < 12) return t("overview.greetingMorning", { name });
  if (h < 18) return t("overview.greetingAfternoon", { name });
  return t("overview.greetingEvening", { name });
}

/** Append a sample to a fixed-length rolling buffer, dropping the oldest. */
function pushSample(buf: number[], next: number, cap: number): number[] {
  const seed = Number.isFinite(next) ? next : 0;
  if (buf.length < cap) return [...buf, seed];
  return [...buf.slice(1), seed];
}

function sparkDelta(values: number[]): number | null {
  if (!values || values.length < 2) return null;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return null;
  return (last - first) / Math.abs(first);
}

function LiveMetric({
  label,
  value,
  delta,
  spark,
  locale,
  note,
  goodDir = "up",
  tone = "neutral"
}: {
  label: string;
  value: string;
  delta: number | null;
  spark?: number[];
  locale: "en" | "bn";
  note?: string;
  goodDir?: "up" | "down";
  tone?: "neutral" | "risk";
}) {
  const isUp = delta !== null && delta >= 0;
  const positive = goodDir === "up" ? isUp : !isUp;
  const deltaColor =
    tone === "risk"
      ? "text-[var(--risk-high)]"
      : delta === null
      ? "text-fg-tertiary"
      : positive
      ? "text-[var(--risk-low)]"
      : "text-[var(--risk-high)]";
  return (
    <div className="surface-2 p-4">
      <p className="text-caption text-fg-tertiary">{label}</p>
      <p className="mt-1 text-[28px] leading-[34px] font-semibold tracking-tight">{value}</p>
      <div className="mt-1.5 flex items-center gap-2">
        {delta !== null && (
          <span className={"inline-flex items-center gap-1 text-caption " + deltaColor}>
            {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {formatPercent(Math.abs(delta), locale)}
          </span>
        )}
        {note && <span className="text-caption text-fg-tertiary">{note}</span>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3">
          <Sparkline
            values={spark}
            width={220}
            height={36}
            stroke={positive ? "var(--risk-low)" : "var(--risk-high)"}
          />
        </div>
      )}
    </div>
  );
}

/** Renders the deterministic compressor duty recommendation: current →
 *  recommended duty %, expected kWh saved, rationale, and a deep-link to
 *  the related manual (doc-5 — "Energy spike on Line 4 compressor").
 *  No ML / RL surface here — the headline explicitly states that. */
function EnergyDutyCard({ rec, locale }: { rec: EnergyDutyTool; locale: "en" | "bn" }) {
  const delta = rec.currentDutyPct - rec.recommendedDutyPct;
  const tone =
    rec.score > 0.6 ? "high" : rec.score >= 0.3 ? "medium" : "low";
  const toneSoft = `risk-${tone}-soft` as const;
  const toneBorder = `risk-${tone}-border` as const;
  const toneFg = `risk-${tone}` as const;
  const rationale = locale === "bn" ? rec.rationaleBn : rec.rationaleEn;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-tour="energy-duty-card">
      <div className="surface-2 p-4">
        <p className="text-caption text-fg-tertiary">Current compressor duty</p>
        <p className="mt-1 text-[28px] leading-[34px] font-semibold tracking-tight">
          {rec.currentDutyPct}%
        </p>
        <p className="mt-1 text-caption text-fg-tertiary">
          {locale === "bn" ? "ফ্লোর-ব্যাপী গড়" : "Floor-wide average"}
        </p>
      </div>
      <div className="surface-2 p-4">
        <p className="text-caption text-fg-tertiary">Recommended duty</p>
        <p className="mt-1 text-[28px] leading-[34px] font-semibold tracking-tight">
          {rec.recommendedDutyPct}%
        </p>
        <p className="mt-1 text-caption text-fg-tertiary">
          {delta > 0
            ? locale === "bn"
              ? `${delta}% কমানোর পরামর্শ`
              : `Trim by ${delta}%`
            : locale === "bn"
            ? "পরিবর্তনের প্রয়োজন নেই"
            : "No change required"}
        </p>
      </div>
      <div className="surface-2 p-4">
        <p className="text-caption text-fg-tertiary">
          {locale === "bn" ? "প্রত্যাশিত সঞ্চয় (kWh)" : "Expected kWh saved"}
        </p>
        <p className="mt-1 text-[28px] leading-[34px] font-semibold tracking-tight">
          {rec.expectedKwhSaved.toFixed(1)}
        </p>
        <p className="mt-1 text-caption text-fg-tertiary">
          {locale === "bn" ? `${rec.basedOn.window} উইন্ডোতে` : `Over ${rec.basedOn.window} window`}
        </p>
      </div>

      <div className="md:col-span-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3 mt-1">
        <div
          className="inline-flex items-start gap-2 px-3 py-2 rounded-md border"
          style={{
            backgroundColor: `var(--${toneSoft})`,
            borderColor: `var(--${toneBorder})`
          }}
        >
          <span
            className="mt-0.5 inline-flex items-center gap-1 text-caption font-medium"
            style={{ color: `var(--${toneFg})` }}
          >
            {locale === "bn" ? `স্কোর ${rec.score.toFixed(2)}` : `Score ${rec.score.toFixed(2)}`}
          </span>
          <p className="text-caption text-fg-primary">{rationale}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/app/ask?q=compressor%20duty%20Line%204"
            className="text-caption text-accent hover:underline inline-flex items-center gap-1"
            data-testid="energy-duty-manual-link"
          >
            {locale === "bn" ? "Ask: Line 4 কম্প্রেসর ম্যানুয়াল" : "Ask: Line 4 compressor manual"}
            <ArrowUpRight size={12} />
          </Link>
          <Link
            href="/app/agents"
            className="text-caption text-fg-tertiary hover:text-fg-primary"
          >
            {locale === "bn" ? "এজেন্ট →" : "Run an agent →"}
          </Link>
        </div>
      </div>
    </div>
  );
}