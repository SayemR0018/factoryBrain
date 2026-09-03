"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  side?: "right" | "bottom";
  width?: string;
  className?: string;
};

export function Drawer({ open, onClose, title, children, side = "right", width = "w-[28rem]", className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    setTimeout(() => ref.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isSide = side === "right";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-[var(--bg-overlay)] backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.aside
            initial={{ x: isSide ? 360 : 0, y: isSide ? 0 : 360, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ x: isSide ? 360 : 0, y: isSide ? 0 : 360, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            ref={ref}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "absolute bg-surface outline-none flex flex-col",
              isSide ? cn("top-0 right-0 h-full", width, "border-l border-border-subtle") : "bottom-0 inset-x-0 max-h-[80vh] border-t border-border-subtle rounded-t-xl",
              className
            )}
          >
            {title && (
              <header className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border-subtle">
                <div className="min-w-0 text-title text-fg-primary">{title}</div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="size-7 rounded-md hover:bg-surface-2 flex items-center justify-center text-fg-tertiary hover:text-fg-primary"
                >
                  <X size={14} />
                </button>
              </header>
            )}
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}