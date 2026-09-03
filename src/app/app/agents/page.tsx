"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Pause, Play, ShieldCheck, RefreshCw, X as XIcon, ChevronRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useT } from "@/lib/useT";
import { agentService } from "@/services/agent.service";
import { insightService } from "@/services/insight.service";
import { activityService } from "@/services/activity.service";
import { useBusinessStore } from "@/store/business.store";
import { Drawer } from "@/components/ui/Drawer";
import { Button } from "@/components/ui/Button";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { AgentAvatar, AGENT_PALETTE, type AgentGlyph } from "@/components/agents/AgentAvatar";
import { Brain3D } from "@/components/agents/Brain3D";
import { cn } from "@/lib/cn";
import type { AgentPublic } from "@/services/types";

const STATUS_DOT: Record<"idle" | "working" | "approval", string> = {
  idle: "var(--fg-tertiary)",
  working: "var(--accent)",
  approval: "var(--risk-medium)"
};

export default function AgentsPage() {
  const { t, locale } = useT();
  const search = useSearchParams();
  const focusParam = search?.get("focus");
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const agents = useMemo(() => agentService.list(), []);
  const agentMode = useBusinessStore((s) => s.agentMode);
  const globalPaused = useBusinessStore((s) => s.globalPaused);
  const setAgentMode = useBusinessStore((s) => s.setAgentMode);
  const setGlobalPaused = useBusinessStore((s) => s.setGlobalPaused);
  const selectedAgentId = useBusinessStore((s) => s.selectedAgentId);

  useEffect(() => {
    if (!canvasRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!focusParam) return;
    setSelectedId(focusParam);
    setHoveredId(focusParam);
    const t = setTimeout(() => setHoveredId(null), 2400);
    return () => clearTimeout(t);
  }, [focusParam]);

  const layout = useMemo(() => {
    const cx = size.w / 2;
    const cy = size.h / 2;
    const radius = Math.max(110, Math.min(size.w, size.h) * 0.32);
    return agents.map((a, i) => {
      const a0 = (i / agents.length) * Math.PI * 2 - Math.PI / 2;
      return {
        ...a,
        x: cx + Math.cos(a0) * radius,
        y: cy + Math.sin(a0) * radius,
        runtimeStatus: inferStatus(a.id)
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, size.w, size.h, runningId]);

  const brain = useMemo(() => ({ cx: size.w / 2, cy: size.h / 2 }), [size]);
  function arc(x: number, y: number) {
    const mx = (brain.cx + x) / 2;
    const my = (brain.cy + y) / 2;
    const dx = x - brain.cx;
    const dy = y - brain.cy;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const offset = 18;
    const nx = -dy / len;
    const ny = dx / len;
    const cx = mx + nx * offset;
    const cy = my + ny * offset;
    return `M ${brain.cx} ${brain.cy} Q ${cx} ${cy} ${x} ${y}`;
  }

  const isMobile = size.w < 768;

  function inferStatus(id: string): "idle" | "working" | "approval" {
    if (runningId === id) return "working";
    const ins = insightService.feed({ agentId: id, stage: "pending_approval" });
    if (ins.length > 0) return "approval";
    return "idle";
  }

  async function runNow(agentId: string) {
    if (globalPaused) return;
    setRunningId(agentId);
    activityService.push({
      actor: agentId,
      actorLabel: agentService.get(agentId)?.name ?? agentId,
      verb: "running",
      verbBn: "চলছে",
      outcome: "executed",
      isoDate: new Date().toISOString()
    });
    let lastResult: any = null;
    try {
      const res = await fetch(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      if (res.ok) {
        lastResult = await res.json().catch(() => null);
      }
    } catch {
      // ignored — the UI surfaces a "demo mode" chip and still shows the run
    } finally {
      activityService.push({
        actor: agentId,
        actorLabel: agentService.get(agentId)?.name ?? agentId,
        verb: lastResult?.source === "live" ? "completed run (live)" : "completed run",
        verbBn: lastResult?.source === "live" ? "রান সম্পন্ন (লাইভ)" : "রান সম্পন্ন",
        outcome: "completed",
        isoDate: new Date().toISOString()
      });
      setRunningId(null);
    }
  }

  const selected = selectedId ? agentService.get(selectedId) ?? null : null;

  if (isMobile) {
    return <MobileList />;
  }

  return (
    <div className="flex flex-col h-full" data-tour="agents">
      <div className="px-6 md:px-8 py-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-display font-semibold tracking-tight">{t("agents.title")}</h1>
          <p className="mt-1 text-caption text-fg-tertiary">{t("agents.subtitle")}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-caption text-fg-secondary">
          <input
            type="checkbox"
            checked={globalPaused}
            onChange={(e) => setGlobalPaused(e.target.checked)}
            className="accent-accent"
          />
          {t("settings.globalPause")}
        </label>
      </div>

      <div ref={canvasRef} className="relative flex-1 min-h-[480px] overflow-hidden constellation-grid">
        {/* Constellation dots */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          <defs>
            <pattern id="dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
              <circle cx="16" cy="16" r="1" fill="var(--world-dot)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#dots)" />
        </svg>

        {/* Curved connectors */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden>
          <defs>
            <filter id="brain-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {layout.map((node) => {
            const isHover = hoveredId === node.id;
            const isSelected = selectedAgentId === node.id;
            const palette = AGENT_PALETTE[node.glyph as AgentGlyph];
            const stroke = isSelected ? palette.strong : isHover ? "var(--accent)" : "var(--border-strong)";
            const dim = hoveredId && !isHover;
            return (
              <g key={node.id} style={{ opacity: dim ? 0.22 : 1, transition: "opacity 200ms" }}>
                <path
                  d={arc(node.x, node.y)}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={isSelected ? 1.6 : isHover ? 1.4 : 1}
                  strokeOpacity={isSelected ? 0.95 : 0.85}
                />
                {node.runtimeStatus === "working" && (
                  <circle r="3" fill="var(--accent)">
                    <animateMotion dur="2s" repeatCount="indefinite" path={arc(node.x, node.y)} />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {/* 3D Brain mascot */}
        <div
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: brain.cx, top: brain.cy }}
          data-tour="brain"
        >
          <Brain3D size={220} />
          <p className="mt-1 text-center text-caption text-fg-tertiary mono-pill">Business Brain</p>
        </div>

        {/* Agent tiles */}
        {layout.map((node) => {
          const isHover = hoveredId === node.id;
          const isSelected = selectedAgentId === node.id;
          const dim = hoveredId && !isHover && !isSelected;
          const palette = AGENT_PALETTE[node.glyph as AgentGlyph];
          return (
            <motion.button
              key={node.id}
              type="button"
              aria-label={node.name}
              data-agent-id={node.id}
              onMouseEnter={() => setHoveredId(node.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(node.id)}
              onBlur={() => setHoveredId(null)}
              onClick={() => setSelectedId(node.id)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-surface px-3 py-2 flex items-center gap-2.5 transition-colors",
                isSelected
                  ? "border-transparent shadow-pop -translate-y-[calc(50%-5px)]"
                  : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
                isHover && !isSelected && "shadow-pop -translate-y-[calc(50%-4px)]"
              )}
              style={{
                left: node.x,
                top: node.y,
                opacity: dim ? 0.4 : 1,
                ...(isSelected ? { boxShadow: `0 0 0 2px ${palette.strong}, 0 12px 28px rgba(0,0,0,0.35)` } : {})
              }}
              animate={
                isSelected
                  ? { scale: 1.04 }
                  : isHover
                  ? { scale: 1.02 }
                  : { scale: 1 }
              }
              transition={{ type: "spring", stiffness: 220, damping: 22 }}
            >
              <AgentAvatar agentId={node.id} size={26} active={isSelected} />
              <div className="min-w-0 text-left">
                <p className="text-caption text-fg-primary whitespace-nowrap font-medium">
                  {locale === "bn" ? node.nameBn : node.name}
                </p>
                <span
                  className="inline-flex items-center gap-1 text-[10px] text-fg-tertiary mono-pill"
                  aria-hidden
                >
                  <span className="size-1.5 rounded-full" style={{ background: STATUS_DOT[node.runtimeStatus] }} />
                  {node.runtimeStatus}
                </span>
              </div>
              {isSelected && (
                <span
                  className="ml-1 inline-flex items-center gap-1 text-[10px] mono-pill"
                  style={{ color: palette.strong }}
                  aria-hidden
                >
                  <span className="size-1.5 rounded-full animate-pulse" style={{ background: palette.strong }} />
                  Ask
                </span>
              )}
            </motion.button>
          );
        })}

        {/* Hover card */}
        {hoveredId && !selectedId && (
          <HoverCard
            node={layout.find((n) => n.id === hoveredId)!}
            brainPos={brain}
            reduceMotion={!!reduceMotion}
          />
        )}
      </div>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? (locale === "bn" ? selected.nameBn : selected.name) : null}
      >
        {selected && (
          <AgentPanel
            agent={selected}
            running={runningId === selected.id}
            mode={agentMode[selected.id]}
            onRun={() => runNow(selected.id)}
            onMode={(m) => setAgentMode(selected.id, m)}
          />
        )}
      </Drawer>
    </div>
  );
}

function HoverCard({
  node,
  brainPos,
  reduceMotion
}: {
  node: AgentPublic & { x: number; y: number; status: string };
  brainPos: { cx: number; cy: number };
  reduceMotion: boolean;
}) {
  const cardW = 260;
  const cardH = 120;
  const flipX = node.x + cardW + 16 > (typeof window !== "undefined" ? window.innerWidth : 0);
  const flipY = node.y + cardH + 16 > (typeof window !== "undefined" ? window.innerHeight : 0);
  const palette = AGENT_PALETTE[node.glyph as AgentGlyph];
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="absolute z-10 glass p-3 w-64 shadow-pop pointer-events-none"
      style={{
        left: flipX ? node.x - cardW - 12 : node.x + 44,
        top: flipY ? node.y - cardH - 12 : node.y - cardH / 2,
        borderTop: `2px solid ${palette.strong}`
      }}
    >
      <p className="mono-pill" style={{ color: palette.strong }}>{node.execution}</p>
      <p className="mt-1 text-body text-fg-primary">{node.name}</p>
      <p className="mt-1 text-caption text-fg-secondary line-clamp-2">{node.purpose}</p>
      <div className="mt-2 flex items-center justify-between">
        <span className="mono-pill text-fg-tertiary">{node.tasksToday} today</span>
        <RiskBadge tier={node.risk === "per_action" ? "low" : node.risk} label={node.risk} size="sm" />
      </div>
    </motion.div>
  );
}

function AgentPanel({
  agent,
  running,
  mode,
  onRun,
  onMode
}: {
  agent: AgentPublic;
  running: boolean;
  mode: "auto" | "approval" | "paused" | undefined;
  onRun: () => void;
  onMode: (m: "auto" | "approval" | "paused") => void;
}) {
  const { t, locale } = useT();
  const effectiveMode = mode ?? (agent.execution === "auto" ? "auto" : agent.execution === "approval_required" ? "approval" : "auto");
  const insights = insightService.feed({ agentId: agent.id }).slice(0, 3);
  const recent = activityService.recent({ limit: 5 }).filter((a) => a.actor === agent.id);
  const palette = AGENT_PALETTE[agent.glyph as AgentGlyph];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <AgentAvatar agentId={agent.id} size={40} />
        <div className="min-w-0">
          <p className="mono-pill" style={{ color: palette.strong }}>{agent.execution}</p>
          <p className="text-body text-fg-secondary line-clamp-2 mt-1">{locale === "bn" ? agent.purposeBn : agent.purpose}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t("agents.detail.tasksToday")} value={`${agent.tasksToday}`} />
        <Stat label={t("agents.detail.riskTier")} value={agent.risk === "per_action" ? "Per action" : agent.risk} />
      </div>

      <section>
        <p className="mono-pill text-fg-tertiary mb-1.5">{t("agents.detail.autonomy")}</p>
        <div className="inline-flex rounded-md border border-border-subtle bg-surface-2 p-0.5">
          {(["auto", "approval", "paused"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onMode(m)}
              aria-pressed={effectiveMode === m}
              className={cn(
                "px-2 h-7 text-caption rounded inline-flex items-center gap-1 transition-colors",
                effectiveMode === m
                  ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]"
                  : "text-fg-secondary hover:text-fg-primary"
              )}
            >
              {m === "paused" ? <Pause size={11} /> : m === "auto" ? <Play size={11} /> : <ShieldCheck size={11} />}
              {t(`agents.autonomy.${m}`)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <p className="mono-pill text-fg-tertiary mb-1.5">{t("agents.detail.contextSlices")}</p>
        <div className="flex flex-wrap gap-1.5">
          {agent.contextSlices.map((s) => (
            <span key={s} className="mono-pill text-fg-secondary border border-border-subtle bg-surface px-2 py-1 rounded-sm">
              {s}
            </span>
          ))}
        </div>
      </section>

      <section>
        <p className="mono-pill text-fg-tertiary mb-1.5">{t("agents.detail.tasksToday")}</p>
        {insights.length === 0 ? (
          <p className="text-caption text-fg-tertiary">No active insights.</p>
        ) : (
          <div className="space-y-2">
            {insights.map((i) => (
              <a key={i.id} href={`/app/insights?focus=${i.id}`} className="block surface-2 p-3 hover:border-border-strong transition-colors">
                <p className="text-body text-fg-primary truncate">{locale === "bn" ? i.titleBn : i.title}</p>
                <p className="mt-0.5 text-caption text-fg-tertiary truncate">{i.recommendation.action}</p>
              </a>
            ))}
          </div>
        )}
      </section>

      {recent.length > 0 && (
        <section>
          <p className="mono-pill text-fg-tertiary mb-1.5">{t("agents.detail.recentActivity")}</p>
          <ul className="divide-y divide-border-subtle">
            {recent.map((a) => (
              <li key={a.id} className="py-2 text-caption text-fg-secondary">
                {locale === "bn" ? a.verbBn : a.verb} — <span className="text-fg-tertiary">{formatRel(a.isoDate, locale)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="sticky bottom-0 bg-surface pt-3 border-t border-border-subtle flex items-center justify-end gap-2">
        <a href={`/app/activity?agent=${agent.id}`} className="text-caption text-accent hover:underline">
          {t("agents.detail.goToActivity")} <ChevronRight size={12} className="inline" />
        </a>
        <Button variant="primary" onClick={onRun} disabled={running || effectiveMode === "paused"} iconLeft={running ? <RefreshCw size={12} className="animate-spin" /> : undefined}>
          {running ? t("agents.detail.running") : t("agents.detail.runNow")}
        </Button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-2 p-2.5">
      <p className="mono-pill text-fg-tertiary">{label}</p>
      <p className="mt-1 text-body text-fg-primary">{value}</p>
    </div>
  );
}

function formatRel(iso: string, locale: "en" | "bn") {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return locale === "bn" ? "এইমাত্র" : "just now";
  if (diff < 3600) return locale === "bn" ? `${Math.round(diff / 60)} মিনিট আগে` : `${Math.round(diff / 60)} min ago`;
  if (diff < 3600 * 24) return locale === "bn" ? `${Math.round(diff / 3600)} ঘণ্টা আগে` : `${Math.round(diff / 3600)} h ago`;
  return locale === "bn" ? `${Math.round(diff / 86400)} দিন আগে` : `${Math.round(diff / 86400)} d ago`;
}

function MobileList() {
  const { t, locale } = useT();
  const agents = useMemo(() => agentService.list(), []);
  const selectedAgentId = useBusinessStore((s) => s.selectedAgentId);
  return (
    <div className="px-6 md:px-8 py-6 max-w-3xl mx-auto">
      <h1 className="text-display font-semibold tracking-tight">{t("agents.title")}</h1>
      <p className="mt-1 text-caption text-fg-tertiary">{t("agents.subtitle")}</p>

      <div className="mt-4 surface p-4 flex items-center justify-center">
        <Brain3D size={160} />
      </div>

      <ul className="mt-4 space-y-2">
        {agents.map((a) => {
          const palette = AGENT_PALETTE[a.glyph as AgentGlyph];
          const isSelected = selectedAgentId === a.id;
          return (
            <li key={a.id}>
              <a
                href={`/app/agents/${a.id}`}
                className={cn(
                  "surface-2 p-3 flex items-center gap-3 border transition-colors",
                  isSelected ? "border-transparent" : "border-border-subtle hover:border-border-strong"
                )}
                style={isSelected ? { boxShadow: `0 0 0 2px ${palette.strong}` } : undefined}
              >
                <AgentAvatar agentId={a.id} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-body text-fg-primary">{locale === "bn" ? a.nameBn : a.name}</p>
                  <p className="mt-0.5 text-caption text-fg-tertiary truncate">{locale === "bn" ? a.purposeBn : a.purpose}</p>
                </div>
                <ChevronRight size={14} className="text-fg-tertiary" />
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
