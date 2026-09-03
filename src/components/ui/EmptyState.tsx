"use client";

import { cn } from "@/lib/cn";

type Props = {
  title: string;
  body?: string;
  className?: string;
  icon?: React.ReactNode;
};

export function EmptyState({ title, body, className, icon }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 text-fg-tertiary", className)}>
      {icon && <div className="mb-3 opacity-60">{icon}</div>}
      <p className="text-body text-fg-secondary">{title}</p>
      {body && <p className="mt-1 text-caption max-w-md">{body}</p>}
    </div>
  );
}