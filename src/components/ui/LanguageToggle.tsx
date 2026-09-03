"use client";

import { useAppStore } from "@/store/app.store";
import { cn } from "@/lib/cn";
import type { Locale } from "@/i18n/registry";

export function LanguageToggle({ className }: { className?: string }) {
  const locale = useAppStore((s) => s.locale);
  const setLocale = useAppStore((s) => s.setLocale);
  const options: { value: Locale; label: string }[] = [
    { value: "en", label: "EN" },
    { value: "bn", label: "বাং" }
  ];
  return (
    <div className={cn("inline-flex rounded-md border border-border-subtle p-0.5 bg-surface-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => setLocale(o.value)}
          aria-pressed={locale === o.value}
          className={cn(
            "px-2 h-7 text-caption rounded transition-colors",
            locale === o.value
              ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)]"
              : "text-fg-secondary hover:text-fg-primary"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}