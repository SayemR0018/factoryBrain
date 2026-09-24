"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Activity, AlertTriangle, MessagesSquare, ShieldCheck } from "lucide-react";
import { useT } from "@/lib/useT";
import { tArray } from "@/i18n/registry";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { Button } from "@/components/ui/Button";
import { BrandMark } from "@/components/brand/BrandMark";

export default function LandingPage() {
  const { t, locale } = useT();

  const valuePropIcons = [Activity, AlertTriangle, MessagesSquare];
  const valuePropKeys = ["liveLine", "alerts", "bangla"] as const;
  const pillars = tArray(locale, "landing.socialProof.pillars");
  const steps = tArray(locale, "landing.howItWorks.steps").map((line) => {
    // Each step line is encoded as "Title · Body" so the EN/BN tables stay flat.
    const idx = line.indexOf(" · ");
    if (idx === -1) return { title: line, body: "" };
    return { title: line.slice(0, idx), body: line.slice(idx + 3) };
  });

  return (
    <div className="relative min-h-screen overflow-hidden bg-canvas">
      {/* Atmospheric layers — match the existing token vocabulary
          (accent, stage-executing, stage-pending) so dark/light both look
          intentional rather than marketing-cliché. */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 size-[40rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute top-1/3 -right-40 size-[32rem] rounded-full bg-stage-executing/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 size-[28rem] rounded-full bg-stage-pending/8 blur-3xl" />
      </div>

      {/* ---------- Top bar ---------- */}
      <header className="relative z-10 flex items-center justify-between px-6 md:px-12 py-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label="BunonBrain">
          <BrandMark size={32} framed withWordmark />
        </Link>
        <div className="flex items-center gap-3">
          <LanguageToggle />
          <Link href="/app" aria-label={t("landing.ctaPrimary") as string}>
            <Button variant="primary" size="md" iconRight={<ArrowRight size={14} />}>
              {t("landing.ctaPrimary")}
            </Button>
          </Link>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <main className="relative z-10 px-6 md:px-12 pt-12 md:pt-20 pb-24 max-w-6xl mx-auto">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mono-pill text-caption text-fg-tertiary"
        >
          {t("landing.eyebrow")}
        </motion.p>

        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-4 text-[40px] md:text-[64px] leading-[44px] md:leading-[68px] font-semibold tracking-tight"
        >
          {t("landing.headlineLead")}
          <br />
          <span className="text-fg-secondary">{t("landing.headlineAccent")}</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-2xl text-body text-fg-secondary"
        >
          {t("landing.subhead")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-wrap items-center gap-3"
        >
          <Link href="/app" aria-label={t("landing.ctaPrimary") as string}>
            <Button variant="primary" size="lg" iconRight={<ArrowRight size={16} />}>
              {t("landing.ctaPrimary")}
            </Button>
          </Link>
          <Link
            href="/onboarding/welcome"
            aria-label={t("landing.ctaSecondary") as string}
          >
            <Button variant="secondary" size="lg">
              {t("landing.ctaSecondary")}
            </Button>
          </Link>
        </motion.div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.36, duration: 0.5 }}
          className="mt-3 text-caption text-fg-tertiary"
        >
          {t("landing.ctaPrimaryHint")}
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45, duration: 0.5 }}
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface/60 px-3 py-1.5 backdrop-blur"
        >
          <span className="size-1.5 rounded-full bg-fg-tertiary" />
          <span className="text-caption text-fg-secondary">{t("landing.badge")}</span>
        </motion.div>

        {/* ---------- Value props (BD RMG managers) ---------- */}
        <motion.section
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.08, delayChildren: 0.55 } }
          }}
          className="mt-16 grid md:grid-cols-3 gap-3"
        >
          {valuePropKeys.map((key, i) => {
            const Icon = valuePropIcons[i];
            return (
              <motion.div
                key={key}
                variants={{
                  hidden: { opacity: 0, y: 8 },
                  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } }
                }}
                className="glass p-4 rounded-md"
              >
                <div className="flex items-center gap-2">
                  <Icon size={14} className="text-accent" />
                  <p className="text-title text-fg-primary">
                    {t(`landing.valueProps.${key}.title`)}
                  </p>
                </div>
                <p className="mt-2 text-caption text-fg-tertiary">
                  {t(`landing.valueProps.${key}.body`)}
                </p>
              </motion.div>
            );
          })}
        </motion.section>

        {/* ---------- Social-proof strip (honest, no fake logos) ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.85, duration: 0.5 }}
          className="mt-10 rounded-lg border border-border-subtle bg-surface/40 backdrop-blur p-5 md:p-6"
        >
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
            <div className="max-w-xl">
              <p className="mono-pill text-caption text-fg-tertiary">
                {t("landing.socialProof.kicker")}
              </p>
              <p className="mt-2 text-body text-fg-primary">
                {t("landing.socialProof.body")}
              </p>
            </div>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-caption text-fg-secondary">
              {pillars.map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <span className="size-1 rounded-full bg-accent" />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </motion.section>

        {/* ---------- How it fits your floor ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.0, duration: 0.5 }}
          className="mt-12"
        >
          <p className="mono-pill text-caption text-fg-tertiary">
            {t("landing.howItWorks.kicker")}
          </p>
          <ol className="mt-4 grid md:grid-cols-3 gap-3">
            {steps.map((step, idx) => (
              <li key={step.title} className="glass rounded-md p-4">
                <div className="flex items-center gap-2">
                  <span className="text-caption text-fg-tertiary mono-pill">
                    {String(idx + 1).padStart(2, "0")}
                  </span>
                  <p className="text-title text-fg-primary">{step.title}</p>
                </div>
                <p className="mt-2 text-caption text-fg-tertiary">{step.body}</p>
              </li>
            ))}
          </ol>
        </motion.section>

        {/* ---------- Honest defaults ---------- */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.15, duration: 0.5 }}
          className="mt-12 flex items-start gap-3 rounded-md border border-border-subtle bg-surface-2/40 p-4"
        >
          <ShieldCheck size={16} className="text-accent mt-0.5 shrink-0" />
          <div>
            <p className="mono-pill text-caption text-fg-tertiary">
              {t("landing.honesty.kicker")}
            </p>
            <p className="mt-1 text-caption text-fg-secondary">
              {t("landing.honesty.body")}
            </p>
          </div>
        </motion.section>
      </main>

      {/* ---------- Footer ---------- */}
      <footer className="relative z-10 border-t border-border-subtle bg-surface/40 backdrop-blur">
        <div className="max-w-6xl mx-auto px-6 md:px-12 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-caption text-fg-tertiary">
            {t("landing.footer.tagline")}
          </p>
          <div className="flex items-center gap-3">
            <Link href="/onboarding/welcome">
              <Button variant="ghost" size="md">
                {t("landing.footer.secondary")}
              </Button>
            </Link>
            <Link href="/app">
              <Button variant="primary" size="md" iconRight={<ArrowRight size={14} />}>
                {t("landing.footer.cta")}
              </Button>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
