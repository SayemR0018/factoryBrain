"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/useT";
import { BrandMark } from "@/components/brand/BrandMark";

export default function WelcomePage() {
  const { t } = useT();
  return (
    <div className="min-h-[calc(100vh-65px)] flex flex-col items-center justify-center px-6 gap-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <BrandMark size={56} framed />
      </motion.div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="text-center max-w-2xl"
      >
        <p className="mono-pill text-fg-tertiary">{t("onboarding.welcome.eyebrow")}</p>
        <h1 className="mt-6 text-[36px] md:text-[52px] leading-[42px] md:leading-[60px] font-semibold tracking-tight">
          {t("onboarding.welcome.headline")}
        </h1>
        <Link href="/onboarding/profile" className="inline-block mt-10">
          <button className="h-12 px-7 rounded-md bg-[var(--btn-primary-bg)] text-[var(--btn-primary-fg)] border border-[var(--btn-primary-border)] hover:bg-[var(--btn-primary-bg-hover)] transition-colors inline-flex items-center gap-2 font-medium">
            {t("onboarding.welcome.cta")} <ArrowRight size={16} />
          </button>
        </Link>
      </motion.div>
    </div>
  );
}