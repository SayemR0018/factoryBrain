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
  className?: string;
  /** Optional footer (actions, etc.). */
  footer?: ReactNode;
};

/** Minimal accessible modal — focus trap + ESC + click-outside. */
export function Modal({ open, onClose, title, children, footer, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Move focus into the dialog on open
    setTimeout(() => ref.current?.focus(), 0);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 bg-[var(--bg-overlay)] backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            ref={ref}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "glass w-full max-w-lg shadow-glass outline-none",
              className
            )}
          >
            {title && (
              <header className="flex items-start justify-between gap-3 px-5 py-3 border-b border-border-subtle">
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
            <div className="p-5">{children}</div>
            {footer && (
              <footer className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border-subtle">
                {footer}
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}