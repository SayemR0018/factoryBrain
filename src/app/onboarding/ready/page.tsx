"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useT } from "@/lib/useT";
import { Button } from "@/components/ui/Button";
import { useBusinessStore } from "@/store/business.store";
import { dataset } from "@/services/dataset";
import { goalsForProfile } from "@/data/goals";

export default function ReadyPage() {
  const { t } = useT();
  const profile = useBusinessStore((s) => s.profile);
  const productCount = dataset.products.length;
  const customerCount = dataset.customers.length;
  const goalCount = goalsForProfile(profile).length;

  const businessName = profile.industry || "Your business";

  return (
    <div className="min-h-[calc(100vh-65px)] flex items-center justify-center px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} className="text-center max-w-2xl">
        <div className="size-12 mx-auto rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center">
          <div className="size-4 rounded-full bg-accent" />
        </div>
        <h1 className="mt-6 text-[28px] md:text-[40px] leading-[34px] md:leading-[46px] font-semibold tracking-tight">
          {t("onboarding.ready.title")}
        </h1>
        <p className="mt-4 text-body text-fg-secondary max-w-xl mx-auto">
          {t("onboarding.ready.lineEn", {
            products: productCount.toLocaleString(),
            customers: customerCount.toLocaleString(),
            goals: goalCount.toString(),
            business: businessName
          })}
        </p>
        <Link href="/app/brain" className="inline-block mt-8">
          <Button variant="primary" size="lg">
            {t("onboarding.ready.cta")} <ArrowRight size={16} />
          </Button>
        </Link>
      </motion.div>
    </div>
  );
}