"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageSquareText,
  Network,
  Lightbulb,
  Bot,
  ShieldCheck,
  Activity,
  PlugZap,
  Settings
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/useT";
import { approvalService } from "@/services/approval.service";
import { insightService } from "@/services/insight.service";
import { useBusinessStore } from "@/store/business.store";
import { useMounted } from "@/lib/persist";
import { useEffect, useState } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useT();
  const mounted = useMounted();

  // Live counts for unread badges. We re-derive on a soft tick.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const approvalCount = mounted ? approvalService.queue().length : 0;
  const insightNewCount = mounted ? insightService.feed({ stage: "suggested" }).length : 0;
  const sources = useBusinessStore.getState().sources;
  const integrationsCount = mounted ? sources.filter((s) => s.connected).length : 0;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const groups: Array<{
    label: string;
    items: Array<{ href: string; label: string; icon: React.ComponentType<any>; badge?: number }>;
  }> = [
    {
      label: t("sidebar.overview"),
      items: [{ href: "/app", label: t("nav.overview"), icon: LayoutDashboard }]
    },
    {
      label: t("sidebar.ask"),
      items: [{ href: "/app/ask", label: t("nav.ask"), icon: MessageSquareText }]
    },
    {
      label: t("sidebar.intelligence"),
      items: [
        { href: "/app/brain", label: t("nav.brain"), icon: Network },
        { href: "/app/insights", label: t("nav.insights"), icon: Lightbulb, badge: insightNewCount },
        { href: "/app/agents", label: t("nav.agents"), icon: Bot }
      ]
    },
    {
      label: t("sidebar.control"),
      items: [
        { href: "/app/approvals", label: t("nav.approvals"), icon: ShieldCheck, badge: approvalCount },
        { href: "/app/activity", label: t("nav.activity"), icon: Activity }
      ]
    },
    {
      label: t("sidebar.system"),
      items: [
        { href: "/app/integrations", label: t("nav.integrations"), icon: PlugZap, badge: integrationsCount ? integrationsCount : undefined },
        { href: "/app/settings", label: t("nav.settings"), icon: Settings }
      ]
    }
  ];

  return (
    <aside className="bg-sidebar h-full w-60 shrink-0 border-r border-border-subtle flex flex-col">
      <div className="px-4 h-14 flex items-center border-b border-border-subtle">
        <Link href="/app" className="flex items-center gap-2 group">
          <div className="size-6 rounded bg-[var(--accent-soft)] border border-[var(--accent-border)] flex items-center justify-center">
            <div className="size-2 rounded-full bg-accent" />
          </div>
          <span className="text-body font-semibold tracking-tight">{t("app.name")}</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-3" aria-label="Primary">
        {groups.map((group) => (
          <div key={group.label} className="px-3 mb-4">
            <div className="mono-pill text-fg-tertiary px-2 mb-2">{group.label}</div>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href) && (item.href !== "/app" || pathname === "/app");
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 h-8 px-2 rounded-md text-caption transition-colors",
                        active
                          ? "bg-surface-2 text-fg-primary"
                          : "text-fg-secondary hover:text-fg-primary hover:bg-surface"
                      )}
                    >
                      <Icon size={15} className={active ? "text-accent" : ""} />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.badge != null && item.badge > 0 && (
                        <span className="mono-pill text-[var(--accent-fg-on-bg)] bg-accent rounded-full px-1.5 py-0 text-[10px]">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border-subtle text-caption text-fg-tertiary">
        <div className="mono-pill text-fg-tertiary mb-1.5 px-2">{t("common.search")}</div>
        <div className="px-2 flex items-center gap-2">
          <span className="kbd">⌘</span>
          <span className="kbd">K</span>
        </div>
      </div>
    </aside>
  );
}