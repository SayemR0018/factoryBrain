"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useT } from "@/lib/useT";
import { Button } from "@/components/ui/Button";
import { dataset } from "@/services/dataset";
import { useBusinessStore } from "@/store/business.store";
import { cn } from "@/lib/cn";

const steps = [
  { key: "products", label: "steps.products", run: (s: any) => { s.productCount = dataset.products.length; } },
  { key: "customers", label: "steps.customers", run: (s: any) => { s.customerCount = dataset.customers.length; } },
  { key: "salesPatterns", label: "steps.salesPatterns", run: (s: any) => { s.patternCount = dataset.byDay.length; } },
  { key: "inventory", label: "steps.inventory", run: (s: any) => { s.skuCount = dataset.products.length; } },
  { key: "goals", label: "steps.goals", run: (s: any) => { s.goalCount = dataset.goals.length; } },
  { key: "policies", label: "steps.policies", run: (s: any) => { s.policyCount = dataset.policies.length; } },
  { key: "graph", label: "steps.graph", run: (s: any) => { s.nodeCount = dataset.graph.nodes.length; s.edgeCount = dataset.graph.edges.length; } }
] as const;

export default function UnderstandingPage() {
  const { t } = useT();
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [snapshot, setSnapshot] = useState<any>({});

  useEffect(() => {
    if (!running) return;
    if (index >= steps.length) {
      setRunning(false);
      setDone(true);
      return;
    }
    const s = steps[index];
    // Real work — actual aggregation against the mock service
    setSnapshot((cur: any) => {
      const next = { ...cur };
      s.run(next);
      return next;
    });
    const timer = setTimeout(() => setIndex((i) => i + 1), 600);
    return () => clearTimeout(timer);
  }, [running, index]);

  function start() {
    setRunning(true);
    setIndex(0);
  }

  function next() {
    useBusinessStore.getState().completeOnboarding();
    router.push("/onboarding/ready");
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <Link href="/onboarding/connect" className="inline-flex items-center gap-1 text-caption text-fg-tertiary hover:text-fg-primary mb-8">
        <ArrowLeft size={12} /> Back
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <h1 className="text-[28px] md:text-[36px] font-semibold tracking-tight">{t("onboarding.understanding.title")}</h1>
        <p className="mt-3 text-body text-fg-secondary">{t("onboarding.understanding.subtitle")}</p>
      </motion.div>

      <div className="mt-10 surface p-5">
        <ul className="space-y-3">
          {steps.map((s, i) => {
            const isDone = i < index || done;
            const isActive = i === index && running && !done;
            return (
              <li key={s.key} className="flex items-center gap-3">
                <div
                  className={cn(
                    "size-6 rounded-full flex items-center justify-center text-caption transition-colors",
                    isDone ? "bg-accent/15 text-accent border border-accent/30" : isActive ? "bg-surface-2 border border-border-strong animate-pulse" : "bg-surface-2 border border-border-subtle text-fg-tertiary"
                  )}
                >
                  {isDone ? <Check size={12} /> : i + 1}
                </div>
                <span className={cn("flex-1 text-body", isDone || isActive ? "text-fg-primary" : "text-fg-tertiary")}>
                  {t(`onboarding.understanding.${s.label}`)}
                </span>
                <AnimatePresence>
                  {isDone && s.key === "products" && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mono-pill text-fg-tertiary">
                      {snapshot.productCount}
                    </motion.span>
                  )}
                  {isDone && s.key === "customers" && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mono-pill text-fg-tertiary">
                      {snapshot.customerCount}
                    </motion.span>
                  )}
                  {isDone && s.key === "graph" && (
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mono-pill text-fg-tertiary">
                      {snapshot.nodeCount} / {snapshot.edgeCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-end">
          {!running && !done && (
            <Button variant="primary" onClick={start}>
              Begin <ArrowRight size={14} />
            </Button>
          )}
          {done && (
            <Button variant="primary" onClick={next}>
              {t("onboarding.ready.cta")} <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}