"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Camera, Sparkles } from "lucide-react";
import { useT } from "@/lib/useT";
import { useBusinessStore } from "@/store/business.store";
import { Panel } from "@/components/ui/Panel";
import { Button } from "@/components/ui/Button";

const SAMPLE_FILES = [
  "defect-1-stitch-skip.jpg",
  "defect-2-buttonhole.jpg",
  "defect-3-seam-pucker.jpg",
  "defect-4-fabric-stain.jpg"
];

const SAMPLE_RESULTS = [
  {
    title: "Stitch skip on shoulder seam",
    titleBn: "কাঁধের সিমে সেলাই বাদ",
    action: "Re-set needle; reinforce with a second pass at 8 stitches/inch.",
    actionBn: "সুই পুনঃস্থাপন করুন; ৮ সেলাই/ইঞ্চিতে দ্বিতীয় পাস দিয়ে শক্তিবৃদ্ধি করুন।"
  },
  {
    title: "Buttonhole fray at top edge",
    titleBn: "বোতামের ছিদ্রের উপরের প্রান্তে ছেঁড়া",
    action: "Trim and rebind; check cutter blade tension.",
    actionBn: "ট্রিম ও পুনঃবাঁধুন; কাটার ব্লেড টেনশন পরীক্ষা করুন।"
  },
  {
    title: "Seam pucker from uneven feed",
    titleBn: "অসম ফিড থেকে সিমে ভাঁজ",
    action: "Adjust differential feed to 1.2; steam-press before QC.",
    actionBn: "ডিফারেনশিয়াল ফিড ১.২ এ সমন্বয় করুন; QC এর আগে স্টিম-প্রেস করুন।"
  },
  {
    title: "Fabric stain near hem",
    titleBn: "হেমের কাছে কাপড়ে দাগ",
    action: "Spot-clean with neutral detergent; reject if >5mm diameter.",
    actionBn: "নিরপেক্ষ ডিটারজেন্ট দিয়ে স্পট-ক্লিন; ৫ মিমি ব্যাসের বেশি হলে প্রত্যাখ্যান।"
  }
];

export default function VisionPage() {
  const { t, locale } = useT();
  const enabled = useBusinessStore((s) => s.featureFlags.visionRepair);
  const [fileIdx, setFileIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [resultIdx, setResultIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Friendly redirect when the flag is off — should not happen because the
      // sidebar only links here when enabled, but guard against deep-links.
    }
  }, [enabled]);

  async function handleUpload() {
    setBusy(true);
    setResultIdx(null);
    await new Promise((r) => setTimeout(r, 700));
    setResultIdx(fileIdx % SAMPLE_RESULTS.length);
    setBusy(false);
  }

  return (
    <div className="px-6 md:px-8 py-6 max-w-3xl mx-auto" data-tour="vision">
      <h1 className="text-display font-semibold tracking-tight">{t("vision.title")}</h1>
      <p className="mt-1 text-caption text-fg-tertiary">{t("vision.body") as string}</p>

      <Panel className="mt-6">
        <div className="flex flex-col items-center gap-4">
          <div className="size-32 rounded-md bg-surface-2 border border-border-subtle flex items-center justify-center text-fg-tertiary">
            <Camera size={36} />
          </div>
          <p className="text-body text-fg-secondary">
            {locale === "bn" ? "নমুনা ছবি:" : "Sample photo:"}{" "}
            <span className="mono-pill text-fg-primary">{SAMPLE_FILES[fileIdx]}</span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setFileIdx((i) => (i + 1) % SAMPLE_FILES.length)}
            >
              {locale === "bn" ? "পরবর্তী ছবি" : "Next sample"}
            </Button>
            <Button variant="primary" size="sm" onClick={handleUpload} disabled={busy}>
              <Sparkles size={12} /> {busy ? "…" : (t("vision.upload") as string)}
            </Button>
          </div>
        </div>
      </Panel>

      {resultIdx !== null && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4"
        >
          <Panel title={t("vision.repairTitle") as string}>
            <p className="text-title text-fg-primary">{SAMPLE_RESULTS[resultIdx].title}</p>
            <p className="mt-1 text-caption text-fg-tertiary">{SAMPLE_RESULTS[resultIdx].titleBn}</p>
            <hr className="my-3 border-border-subtle" />
            <p className="text-body text-fg-primary">{SAMPLE_RESULTS[resultIdx].action}</p>
            <p className="mt-1 text-caption text-fg-secondary">{SAMPLE_RESULTS[resultIdx].actionBn}</p>
          </Panel>
        </motion.div>
      )}
    </div>
  );
}
