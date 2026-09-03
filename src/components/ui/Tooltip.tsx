"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type Props = {
  content: ReactNode;
  children: ReactNode;
  side?: "top" | "bottom";
  className?: string;
};

export function Tooltip({ content, children, side = "top", className }: Props) {
  const [open, setOpen] = useState(false);
  const [flip, setFlip] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setFlip(side === "top" ? rect.top < 36 : window.innerHeight - rect.bottom < 36);
  }, [open, side]);

  return (
    <div
      className={cn("relative inline-flex", className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <div
          ref={ref}
          role="tooltip"
          className={cn(
            "absolute left-1/2 -translate-x-1/2 z-50 px-2 py-1 rounded-md text-caption whitespace-nowrap shadow-pop",
            "bg-[var(--bg-surface-2)] text-[var(--fg-primary)] border border-[var(--border-strong)]",
            flip ? "top-full mt-1.5" : "bottom-full mb-1.5"
          )}
        >
          {content}
        </div>
      )}
    </div>
  );
}