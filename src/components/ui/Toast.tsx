"use client";

import { useEffect, useState, useCallback, type ReactNode, createContext, useContext } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";

type ToastEntry = {
  id: string;
  title: string;
  description?: string;
  /** Optional undo — fires once if the user clicks within `ttlMs`. */
  onUndo?: () => void;
  ttlMs?: number;
};

type ToastContextValue = {
  push: (t: Omit<ToastEntry, "id">) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastEntry[]>([]);
  const dismiss = useCallback((id: string) => setItems((arr) => arr.filter((t) => t.id !== id)), []);
  const push = useCallback((t: Omit<ToastEntry, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const entry: ToastEntry = { id, ttlMs: 5000, ...t };
    setItems((arr) => [...arr, entry]);
    return id;
  }, []);

  useEffect(() => {
    const timers = items.map((t) =>
      window.setTimeout(() => dismiss(t.id), t.ttlMs ?? 5000)
    );
    return () => timers.forEach(clearTimeout);
  }, [items, dismiss]);

  return (
    <ToastContext.Provider value={{ push, dismiss }}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm"
      >
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="glass p-3 flex items-start gap-2 shadow-pop"
            >
              <span className="mt-0.5 size-5 rounded-sm bg-[var(--risk-low-soft)] border border-[var(--risk-low-border)] text-[var(--risk-low)] inline-flex items-center justify-center">
                <Check size={12} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-body text-fg-primary">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 text-caption text-fg-tertiary">{t.description}</p>
                )}
              </div>
              {t.onUndo && (
                <button
                  type="button"
                  onClick={() => {
                    t.onUndo?.();
                    dismiss(t.id);
                  }}
                  className="text-caption text-accent hover:underline"
                >
                  Undo
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      push: () => "",
      dismiss: () => undefined
    };
  }
  return ctx;
}