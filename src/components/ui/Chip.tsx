"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

/** Reusable toggle chip used for goal selection and filters. */
export function Chip({ active, onClick, children, className, ariaLabel, disabled }: Props) {
  return (
    <button
      type="button"
      aria-pressed={!!active}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-8 px-3 rounded-md border text-caption transition-colors",
        active
          ? "bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border-transparent"
          : "bg-[var(--btn-secondary-bg)] text-[var(--fg-secondary)] border-[var(--border-subtle)] hover:text-[var(--fg-primary)] hover:border-[var(--border-strong)]",
        disabled && "opacity-40 cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}