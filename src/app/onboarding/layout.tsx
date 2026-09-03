"use client";

import { LanguageToggle } from "@/components/ui/LanguageToggle";
import Link from "next/link";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas grid-bg relative">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[40rem] rounded-full bg-accent/8 blur-3xl" />
      </div>
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-5 border-b border-border-subtle">
        <Link href="/" className="flex items-center gap-2">
          <div className="size-7 rounded bg-accent/15 border border-accent/30 flex items-center justify-center">
            <div className="size-2.5 rounded-full bg-accent" />
          </div>
          <span className="text-body font-semibold tracking-tight">THALAMUS</span>
        </Link>
        <LanguageToggle />
      </header>
      <main className="relative z-10">{children}</main>
    </div>
  );
}