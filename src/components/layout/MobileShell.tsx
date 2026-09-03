"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  LayoutDashboard,
  MessageSquareText,
  Network,
  Lightbulb,
  ShieldCheck,
  Activity,
  PlugZap,
  Settings
} from "lucide-react";
import Link from "next/link";
import { useT } from "@/lib/useT";

const items = [
  { href: "/app", label: "Overview", icon: LayoutDashboard, key: "nav.overview" },
  { href: "/app/ask", label: "Ask", icon: MessageSquareText, key: "nav.ask" },
  { href: "/app/brain", label: "Brain", icon: Network, key: "nav.brain" },
  { href: "/app/insights", label: "Insights", icon: Lightbulb, key: "nav.insights" },
  { href: "/app/approvals", label: "Approve", icon: ShieldCheck, key: "nav.approvals" }
];

export function MobileShell() {
  const pathname = usePathname();
  const { t } = useT();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-sidebar/85 backdrop-blur-xl border-t border-border-subtle flex items-stretch justify-around">
      {items.map((it) => {
        const active = pathname === it.href || (it.href !== "/app" && pathname.startsWith(it.href + "/"));
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={cn(
              "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-caption",
              active ? "text-fg-primary" : "text-fg-tertiary"
            )}
          >
            <Icon size={16} className={active ? "text-accent" : ""} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export { }; // keep module-shaped
