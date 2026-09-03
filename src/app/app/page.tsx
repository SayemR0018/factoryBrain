"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowUpRight, ArrowDownRight, AlertTriangle, Sparkles, ShieldCheck, PlugZap } from "lucide-react";
import { motion } from "framer-motion";
import { useT } from "@/lib/useT";
import { Panel } from "@/components/ui/Panel";
import { Sparkline } from "@/components/ui/Sparkline";
import { StageBadge, RiskPill } from "@/components/ui/StatusPill";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { Button } from "@/components/ui/Button";
import { metricService } from "@/services/metric.service";
import { insightService } from "@/services/insight.service";
import { approvalService } from "@/services/approval.service";
import { activityService } from "@/services/activity.service";
import { businessService } from "@/services/business.service";
import { useAppStore } from "@/store/app.store";
import { useBusinessStore } from "@/store/business.store";
import { connectedSourceCount } from "@/store/business.store";
import { formatBDT, formatNumber, formatPercent, formatRelative } from "@/lib/format";
import { useMounted } from "@/lib/persist";

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

  return (
    <div className="px-6 md:px-8 py-6 max-w-6xl mx-auto">
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
        <p className="text-caption text-fg-tertiary">{greetingFor(t, name)}</p>
        <h1 className="mt-1 text-display font-semibold tracking-tight">{name}</h1>
      </motion.div>

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