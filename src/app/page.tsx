"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { BrandMark } from "@/components/brand/BrandMark";

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden grid-bg">
      {/* atmospheric layers */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 size-[40rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 size-[32rem] rounded-full bg-stage-executing/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 size-[28rem] rounded-full bg-stage-pending/8 blur-3xl" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <Link href="/" className="flex items-center gap-2.5">
          <BrandMark size={32} framed withWordmark />
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link href="/onboarding/welcome">
            <button className="h-9 px-4 rounded-md bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border border-[var(--btn-primary-border)] hover:bg-[var(--btn-primary-bg-hover)] transition-colors inline-flex items-center gap-1.5 font-medium">
              Try now <ArrowRight size={14} />
            </button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 px-6 md:px-12 pt-12 md:pt-24 max-w-5xl">
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="text-[40px] md:text-[64px] leading-[44px] md:leading-[68px] font-semibold tracking-tight"
        >
          Thalamus understands your business,
          <br />
          <span className="text-fg-secondary">then assembles the AI that runs it.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 max-w-2xl text-body text-fg-secondary"
        >
          A business-intelligence operating layer for Bangladesh retail SMEs. Connect your data,
          watch the brain form, then ask the workforce — Sales, Marketing, Inventory, Customer
          Success, Finance, Policy, Automation — in Bangla or English. Every answer carries
          evidence. Every action requires your sign-off when the risk warrants it.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12 flex items-center gap-3"
        >
          <Link href="/onboarding/welcome">
            <button className="h-12 px-6 rounded-md bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border border-[var(--btn-primary-border)] hover:bg-[var(--btn-primary-bg-hover)] transition-colors inline-flex items-center gap-2 font-medium">
              Get started <ArrowRight size={16} />
            </button>
          </Link>
          <Link href="/app/architecture">
            <button className="h-12 px-6 rounded-md bg-[var(--btn-secondary-bg)] text-[var(--btn-secondary-fg)] border border-[var(--btn-secondary-border)] hover:bg-[var(--btn-secondary-bg-hover)] transition-colors inline-flex items-center gap-2 font-medium">
              See architecture
            </button>
          </Link>
        </motion.div>

        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mt-24 grid md:grid-cols-3 gap-3 max-w-3xl"
        >
          {[
            { headline: "Business-first", body: "The Business Brain is the centre. Agents serve it, not the other way around." },
            { headline: "Evidence on every claim", body: "Every insight carries source lists, record counts, timestamps. No naked numbers." },
            { headline: "Human approval built in", body: "Risk tiering decides what runs automatically. Everything else waits for you." }
          ].map((it) => (
            <div key={it.headline} className="glass p-4">
              <p className="text-title text-fg-primary">{it.headline}</p>
              <p className="mt-2 text-caption text-fg-tertiary">{it.body}</p>
            </div>
          ))}
        </motion.section>
      </main>
    </div>
  );
}
