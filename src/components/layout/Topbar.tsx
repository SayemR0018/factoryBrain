"use client";

import { Search, Moon, Sun, Monitor, HelpCircle } from "lucide-react";
import Link from "next/link";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { useAppStore } from "@/store/app.store";
import { businessService } from "@/services/business.service";
import { useT } from "@/lib/useT";
import { useMounted } from "@/lib/persist";
import { cn } from "@/lib/cn";
import { Tooltip } from "@/components/ui/Tooltip";
import { BrandMark } from "@/components/brand/BrandMark";

const THEME_OPTIONS: Array<{ value: "light" | "dark" | "system"; icon: any; label: string }> = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" }
];

export function Topbar({ onHelp }: { onHelp?: () => void }) {
  const open = useAppStore((s) => s.openCommandPalette);
  const setTheme = useAppStore((s) => s.setTheme);
  const theme = useAppStore((s) => s.theme);
  const { t } = useT();
  const mounted = useMounted();
  const name = mounted ? businessService.name() : "Your business";

  function triggerHelp() {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("thalamus:restart-tour"));
    }
    onHelp?.();
  }

  return (
    <header className="h-14 border-b border-border-subtle bg-canvas/60 backdrop-blur-md sticky top-0 z-20 flex items-center px-4 gap-3">
      <Link
        href="/app"
        aria-label="Thalamus home"
        data-tour="brand"
        className="inline-flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2 transition-colors"
      >
        <BrandMark size={26} framed />
        <span className="hidden md:inline text-body font-semibold tracking-tight text-fg-primary">Thalamus</span>
      </Link>

      <button
        type="button"
        onClick={open}
        aria-label={t("common.search") as string}
        data-tour="search"
        className="flex items-center gap-2 h-9 px-3 rounded-md bg-surface-2 border border-border-subtle text-fg-secondary hover:text-fg-primary hover:border-border-strong transition-colors w-72"
      >
        <Search size={14} />
        <span className="text-caption flex-1 text-left">{t("common.search")}</span>
        <span className="kbd">⌘</span>
        <span className="kbd">K</span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <span
          suppressHydrationWarning
          className="text-caption text-fg-tertiary hidden sm:inline"
        >
          {name}
        </span>

        {/* Theme switcher */}
        <div
          className="inline-flex rounded-md border border-border-subtle p-0.5 bg-surface-2"
          role="radiogroup"
          aria-label="Theme"
        >
          {THEME_OPTIONS.map((o) => {
            const Icon = o.icon;
            const active = theme === o.value;
            return (
              <Tooltip key={o.value} content={o.label}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={o.label}
                  onClick={() => setTheme(o.value)}
                  className={cn(
                    "size-7 rounded inline-flex items-center justify-center transition-colors",
                    active
                      ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]"
                      : "text-fg-secondary hover:text-fg-primary"
                  )}
                >
                  <Icon size={13} />
                </button>
              </Tooltip>
            );
          })}
        </div>

        <LanguageToggle />

        {onHelp && (
          <Tooltip content={t("tour.restart") as string}>
            <button
              type="button"
              onClick={triggerHelp}
              aria-label={t("tour.restart") as string}
              className="size-8 rounded-md border border-border-subtle bg-surface-2 text-fg-secondary hover:text-fg-primary hover:border-border-strong inline-flex items-center justify-center transition-colors"
            >
              <HelpCircle size={14} />
            </button>
          </Tooltip>
        )}
      </div>
    </header>
  );
}