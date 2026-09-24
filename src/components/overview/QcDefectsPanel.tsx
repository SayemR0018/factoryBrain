"use client";

// QC defects & rework panel.
//
// Fetches GET /api/qc/defects (real API, not mocked component state) and
// renders a top-ops table with per-row sparkline + Flag issue button.
// Mirrors the BriefCard/LineBoardPanel patterns: sim-tick refresh
// coupling, locale-aware labels, DemoChip + simulated source pill.
//
// Clicking Flag issue POSTs to /api/qc/flag, which inserts a real Insight
// via insightService.upsertCustom() and emits an ActivityItem, then we
// toast + deep-link to /app/insights?focus=<insightId>.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Flag, RefreshCw } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Button, DemoChip } from "@/components/ui/Button";
import { Sparkline } from "@/components/ui/Sparkline";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useT } from "@/lib/useT";
import { cn } from "@/lib/cn";
import { formatRelative } from "@/lib/format";
import { useFactoryBrainLiveStore } from "@/store/factoryBrain.live.store";
import type { QcResponse, QcOperationStats, QcTopOperation } from "@/services/qc.defects.server";

type SortMode = "defect" | "rework";

function rateColor(rate: number): string {
  if (rate >= 6) return "text-[var(--risk-high)]";
  if (rate >= 3) return "text-[var(--risk-medium)]";
  return "text-[var(--risk-low)]";
}

function rateBg(rate: number): string {
  if (rate >= 6) return "bg-risk-high/15 border-risk-high/30 text-[var(--risk-high)]";
  if (rate >= 3) return "bg-risk-medium/15 border-risk-medium/30 text-[var(--risk-medium)]";
  return "bg-risk-low/15 border-risk-low/30 text-[var(--risk-low)]";
}

function trendFromWeeks(weeks: QcOperationStats["weeks"]): number[] {
  // Defect rate per week in chronological (oldest → newest) order. The
  // backend returns most-recent-first, so we reverse for the sparkline.
  return [...weeks].reverse().map((w) => (w.inspected > 0 ? (w.defects / w.inspected) * 100 : 0));
}

function operationLabel(op: string, locale: "en" | "bn"): string {
  // Operation vocabulary stays English-shaped (matches manuals + vision).
  // Capitalise for the chip; BN locale falls back to EN — operations are
  // noun-phrases that read the same in both locales.
  return op.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function QcDefectsPanel() {
  const { t, locale } = useT();
  const toast = useToast();

  const [data, setData] = useState<QcResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("defect");
  const [flagging, setFlagging] = useState<string | null>(null);

  const simTick = useFactoryBrainLiveStore((s) => s.snapshot?.tick);
  const inflight = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (inflight.current) inflight.current.abort();
    const ctrl = new AbortController();
    inflight.current = ctrl;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/qc/defects", {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal
      });
      if (!res.ok) throw new Error(`qc_${res.status}`);
      const json = (await res.json()) as QcResponse;
      setData(json);
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message ?? "qc_failed");
      }
    } finally {
      if (inflight.current === ctrl) inflight.current = null;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      if (inflight.current) inflight.current.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (simTick === undefined) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simTick]);

  // Index operations by (operation, lineId) so we can attach a trend to a
  // top-ops row.
  const opIndex = useMemo(() => {
    const m = new Map<string, QcOperationStats>();
    if (!data) return m;
    for (const cell of data.operations) {
      m.set(`${cell.operation}|${cell.lineId}`, cell);
    }
    return m;
  }, [data]);

  const topRows: QcTopOperation[] = useMemo(() => {
    if (!data) return [];
    return sortMode === "defect" ? data.topByDefectRate : data.topByReworkRate;
  }, [data, sortMode]);

  const subtitle = data
    ? `${t("qc.subtitle", { weeks: data.operations[0]?.weeks.length ?? 8 })} · tick #${data.meta?.generatedAt ? formatRelative(data.meta.generatedAt, locale as "en" | "bn") : ""}`
    : t("qc.subtitle", { weeks: 8 });

  const flagIssue = useCallback(
    async (row: QcTopOperation) => {
      const cell = opIndex.get(`${row.operation}|${row.lineId}`);
      setFlagging(`${row.operation}|${row.lineId}`);
      try {
        const res = await fetch("/api/qc/flag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            operation: row.operation,
            lineId: row.lineId,
            defectRatePct: row.defectRatePct,
            reworkRatePct: row.reworkRatePct
          }),
          cache: "no-store"
        });
        if (!res.ok) throw new Error(`flag_${res.status}`);
        const out = (await res.json()) as { insightId: string };
        toast.push({
          title: t("qc.flagToastTitle") as string,
          description: `${operationLabel(row.operation, locale as "en" | "bn")} · ${row.lineId} · ${t("qc.flagToastHref") as string}`,
          ttlMs: 5000
        });
      } catch (e) {
        toast.push({
          title: t("qc.flagFailedTitle") as string,
          description: (e as Error).message ?? "flag_failed",
          ttlMs: 4000
        });
      } finally {
        setFlagging(null);
      }
      void cell;
    },
    [opIndex, locale, toast, t]
  );

  const headerRight = (
    <div className="flex items-center gap-2">
      {data?.meta?.simulated && <DemoChip>{t("qc.simulatedChip")}</DemoChip>}
      <div className="hidden sm:inline-flex surface-2 rounded-md border border-border-subtle p-0.5">
        <button
          type="button"
          onClick={() => setSortMode("defect")}
          className={cn(
            "h-7 px-2 rounded-sm text-caption mono-pill",
            sortMode === "defect" ? "bg-accent text-[var(--accent-fg-on-bg)]" : "text-fg-secondary"
          )}
          aria-pressed={sortMode === "defect"}
        >
          {t("qc.sortDefect")}
        </button>
        <button
          type="button"
          onClick={() => setSortMode("rework")}
          className={cn(
            "h-7 px-2 rounded-sm text-caption mono-pill",
            sortMode === "rework" ? "bg-accent text-[var(--accent-fg-on-bg)]" : "text-fg-secondary"
          )}
          aria-pressed={sortMode === "rework"}
        >
          {t("qc.sortRework")}
        </button>
      </div>
      <Button
        variant="secondary"
        size="sm"
        onClick={refresh}
        disabled={loading}
        aria-label={t("qc.refreshAria")}
      >
        <RefreshCw size={14} className={cn(loading && "animate-spin")} />
      </Button>
    </div>
  );

  // --- Body ---------------------------------------------------------------

  let body: React.ReactNode;
  if (error && !data) {
    body = (
      <div>
        <EmptyState
          icon={<AlertTriangle size={20} />}
          title={t("qc.loadFailed")}
          body={t("qc.loadFailedBody")}
        />
        <div className="mt-3 flex justify-center">
          <Button variant="secondary" size="sm" onClick={refresh}>
            {t("qc.retry")}
          </Button>
        </div>
      </div>
    );
  } else if (loading && !data) {
    body = (
      <ul className="space-y-2" aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <li key={i} className="surface-2 h-12 rounded-md border border-border-subtle animate-pulse" />
        ))}
      </ul>
    );
  } else if (data) {
    body = (
      <div data-testid="qc-panel" data-simulated={data.meta.simulated ? "true" : "false"}>
        <ul role="list" className="space-y-2">
          {topRows.map((row) => {
            const cell = opIndex.get(`${row.operation}|${row.lineId}`);
            const series = cell ? trendFromWeeks(cell.weeks) : [];
            const flagKey = `${row.operation}|${row.lineId}`;
            const flagBusy = flagging === flagKey;
            const rate = sortMode === "defect" ? row.defectRatePct : row.reworkRatePct;
            return (
              <li
                key={flagKey}
                className="surface-2 p-3 rounded-md border border-border-subtle"
                data-testid={`qc-row-${row.operation}-${row.lineId}`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-fg-primary truncate">
                      {operationLabel(row.operation, locale as "en" | "bn")}
                    </p>
                    <p className="mono-pill text-fg-tertiary mt-0.5">{row.lineId}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "mono-pill inline-flex items-center gap-1 h-6 px-2 rounded-sm border",
                        rateBg(rate)
                      )}
                      aria-label={t("qc.rateAria", { op: row.operation, line: row.lineId, rate: rate.toFixed(2) })}
                    >
                      <span className="size-1.5 rounded-full bg-current" aria-hidden />
                      <span>
                        {sortMode === "defect"
                          ? t("qc.defectPct", { pct: rate.toFixed(2) })
                          : t("qc.reworkPct", { pct: rate.toFixed(2) })}
                      </span>
                    </span>
                    <span className="hidden sm:inline-flex mono-pill text-fg-tertiary h-6 px-2 items-center rounded-sm border border-border-subtle bg-surface">
                      {t("qc.defectPct", { pct: row.defectRatePct.toFixed(2) })}
                    </span>
                    <span className="hidden sm:inline-flex mono-pill text-fg-tertiary h-6 px-2 items-center rounded-sm border border-border-subtle bg-surface">
                      {t("qc.reworkPct", { pct: row.reworkRatePct.toFixed(2) })}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="w-32 sm:w-44 h-8">
                      {series.length > 1 ? (
                        <Sparkline
                          values={series}
                          width={176}
                          height={32}
                          stroke={
                            rate >= 6
                              ? "var(--risk-high)"
                              : rate >= 3
                              ? "var(--risk-medium)"
                              : "var(--risk-low)"
                          }
                        />
                      ) : (
                        <div className="h-full surface rounded border border-border-subtle" aria-hidden />
                      )}
                    </div>
                    <p className={cn("text-caption tabular-nums", rateColor(rate))}>
                      {rate >= 6
                        ? t("qc.trendHigh")
                        : rate >= 3
                        ? t("qc.trendWatch")
                        : t("qc.trendLow")}
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void flagIssue(row)}
                    disabled={flagBusy}
                    data-testid={`qc-flag-${row.operation}-${row.lineId}`}
                  >
                    <Flag size={12} /> {t("qc.flagIssue")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-caption text-fg-tertiary">
            {t("qc.sourceHint")}
          </p>
          <Link
            href="/app/qc"
            className="text-caption text-accent hover:underline inline-flex items-center gap-1"
          >
            {t("qc.openFull")} <ArrowUpRight size={12} />
          </Link>
        </div>
      </div>
    );
  } else {
    body = null;
  }

  return (
    <Panel
      variant="glass"
      title={t("qc.cardTitle")}
      subtitle={subtitle}
      right={headerRight}
    >
      {body}
    </Panel>
  );
}
