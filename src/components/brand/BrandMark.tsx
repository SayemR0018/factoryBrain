"use client";

import Image from "next/image";
import { cn } from "@/lib/cn";

type Props = {
  size?: number;
  className?: string;
  /** Show the rounded soft background — useful in headers. */
  framed?: boolean;
  /** Show the wordmark next to the logo. */
  withWordmark?: boolean;
  /** Force the raster PNG (true) or the inline SVG glyph (false). */
  usePng?: boolean;
};

/**
 * Brand mark for THALAMUS. Renders the supplied PNG when available,
 * otherwise falls back to an inline SVG glyph so the brand is always present.
 *
 * The PNG lives at `/Thalamus_logo.png`; we keep it under `public/` so
 * `next/image` can optimise it and the browser can show it as a favicon.
 */
export function BrandMark({ size = 28, className, framed = false, withWordmark = false, usePng = true }: Props) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {framed ? (
        <span
          className="inline-flex items-center justify-center rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)]"
          style={{ width: size, height: size }}
          aria-hidden
        >
          <BrandGlyph size={Math.round(size * 0.6)} />
        </span>
      ) : usePng ? (
        <Image
          src="/Thalamus_logo.png"
          alt="Thalamus"
          width={size}
          height={size}
          priority
          className="rounded-sm object-contain"
          style={{ width: size, height: size }}
        />
      ) : (
        <BrandGlyph size={size} />
      )}
      {withWordmark && (
        <span className="text-body font-semibold tracking-tight text-fg-primary">THALAMUS</span>
      )}
    </span>
  );
}

/** Pure SVG fallback — used when PNG fails to load or when we want a crisp vector. */
export function BrandGlyph({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={cn("text-accent", className)}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brand-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.9" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.55" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="28" height="28" rx="7" fill="url(#brand-grad)" />
      <path
        d="M9 22 V11 M9 11 H17 a4 4 0 0 1 0 8 H9"
        fill="none"
        stroke="var(--btn-primary-fg)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="24" cy="9" r="2" fill="var(--btn-primary-fg)" />
    </svg>
  );
}
