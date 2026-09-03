"use client";

import { cn } from "@/lib/cn";

export type AgentGlyph =
  | "sales"
  | "marketing"
  | "inventory"
  | "customer-success"
  | "finance"
  | "policy"
  | "automation";

export const AGENT_PALETTE: Record<AgentGlyph, { strong: string; soft: string; ring: string; label: string }> = {
  sales: { strong: "#7CD3F0", soft: "rgba(124, 211, 240, 0.18)", ring: "rgba(124, 211, 240, 0.4)", label: "Sales" },
  marketing: { strong: "#F08CC2", soft: "rgba(240, 140, 194, 0.18)", ring: "rgba(240, 140, 194, 0.4)", label: "Marketing" },
  inventory: { strong: "#F0B97C", soft: "rgba(240, 185, 124, 0.18)", ring: "rgba(240, 185, 124, 0.4)", label: "Inventory" },
  "customer-success": { strong: "#F091A1", soft: "rgba(240, 145, 161, 0.18)", ring: "rgba(240, 145, 161, 0.4)", label: "Customer Success" },
  finance: { strong: "#7CE0B8", soft: "rgba(124, 224, 184, 0.18)", ring: "rgba(124, 224, 184, 0.4)", label: "Finance" },
  policy: { strong: "#9BA4B5", soft: "rgba(155, 164, 181, 0.18)", ring: "rgba(155, 164, 181, 0.4)", label: "Policy" },
  automation: { strong: "#B79CF0", soft: "rgba(183, 156, 240, 0.18)", ring: "rgba(183, 156, 240, 0.4)", label: "Automation" }
};

/** Map agent id → glyph. */
export const AGENT_GLYPH: Record<string, AgentGlyph> = {
  "sales-analyst": "sales",
  "marketing-agent": "marketing",
  "inventory-agent": "inventory",
  "customer-success": "customer-success",
  "finance-agent": "finance",
  "policy-docs-agent": "policy",
  "automation-agent": "automation"
};

type Props = {
  agentId: string;
  size?: number;
  className?: string;
  framed?: boolean;
  /** Active highlight ring (used when the agent is selected from Ask). */
  active?: boolean;
};

export function AgentAvatar({ agentId, size = 22, className, framed = true, active = false }: Props) {
  const glyph = AGENT_GLYPH[agentId] ?? "automation";
  const palette = AGENT_PALETTE[glyph];
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-md",
        framed && "border",
        active && "ring-2 ring-offset-1 ring-offset-canvas",
        className
      )}
      style={{
        width: size + (framed ? 12 : 0),
        height: size + (framed ? 12 : 0),
        background: framed ? palette.soft : "transparent",
        borderColor: framed ? palette.ring : "transparent",
        // @ts-expect-error — CSS variable for active ring
        "--tw-ring-color": palette.strong
      }}
      aria-hidden
    >
      <GlyphSvg kind={glyph} size={size} color={palette.strong} />
    </span>
  );
}

function GlyphSvg({ kind, size, color }: { kind: AgentGlyph; size: number; color: string }) {
  const props = { width: size, height: size, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  switch (kind) {
    case "sales":
      // Rising bar chart
      return (
        <svg {...props}>
          <rect x="3" y="13" width="3.5" height="8" rx="1" fill={color} opacity="0.6" />
          <rect x="10" y="9" width="3.5" height="12" rx="1" fill={color} opacity="0.8" />
          <rect x="17" y="5" width="3.5" height="16" rx="1" fill={color} />
          <path d="M3 11 L11 7 L19 3" stroke={color} strokeWidth="1.4" strokeLinecap="round" fill="none" opacity="0.7" />
          <circle cx="19" cy="3" r="1.6" fill={color} />
        </svg>
      );
    case "marketing":
      // Megaphone
      return (
        <svg {...props}>
          <path d="M3 10 V14 a2 2 0 0 0 2 2 H7 L17 21 V3 L7 8 H5 a2 2 0 0 0-2 2 Z" fill={color} />
          <circle cx="18.5" cy="12" r="1.6" fill={color} opacity="0.7" />
          <path d="M19 9 L21 7 M19 15 L21 17" stroke={color} strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
        </svg>
      );
    case "inventory":
      // Stacked boxes
      return (
        <svg {...props}>
          <rect x="3" y="13" width="8" height="8" rx="1" fill={color} opacity="0.7" />
          <rect x="13" y="13" width="8" height="8" rx="1" fill={color} opacity="0.5" />
          <rect x="3" y="3" width="14" height="8" rx="1" fill={color} />
          <path d="M10 3 V11 M3 7 H17" stroke={color} strokeWidth="1" opacity="0.5" />
        </svg>
      );
    case "customer-success":
      // Heart with chat tail
      return (
        <svg {...props}>
          <path
            d="M12 20 L4.5 12.5 a4.5 4.5 0 0 1 6.5-6 L12 7.5 l1-1 a4.5 4.5 0 0 1 6.5 6 L12 20 Z"
            fill={color}
          />
          <circle cx="9" cy="11" r="1" fill="#fff" opacity="0.7" />
          <circle cx="12" cy="13" r="1" fill="#fff" opacity="0.7" />
          <circle cx="15" cy="11" r="1" fill="#fff" opacity="0.7" />
        </svg>
      );
    case "finance":
      // Ledger with ৳
      return (
        <svg {...props}>
          <rect x="4" y="3" width="16" height="18" rx="2" fill={color} opacity="0.85" />
          <path d="M7 8 H17 M7 12 H17 M7 16 H13" stroke="#04231C" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="17" cy="17" r="3" fill={color} />
          <text x="17" y="19" textAnchor="middle" fontSize="4.5" fontWeight="700" fill="#04231C">৳</text>
        </svg>
      );
    case "policy":
      // Scroll
      return (
        <svg {...props}>
          <path d="M6 3 H17 a2 2 0 0 1 2 2 V19 a2 2 0 0 1-2 2 H8 a2 2 0 0 1-2-2 V3 Z" fill={color} opacity="0.85" />
          <path d="M6 3 a2 2 0 0 0-2 2 V17 a2 2 0 0 0 4 0 V3" fill={color} />
          <path d="M9 8 H16 M9 12 H16 M9 16 H13" stroke="#04231C" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      );
    case "automation":
      // Two gears
      return (
        <svg {...props}>
          <path
            d="M9 3 L10.5 4 L12 3 L12.5 5 L14 5.5 L13.5 7 L14 8.5 L12 9 L11 10.5 L9.5 9.5 L7.5 9.5 L7 7.5 L6 6.5 L7 5 Z"
            fill={color}
          />
          <circle cx="10" cy="6" r="1.2" fill="#04231C" />
          <path
            d="M17 13 L18 14 L19 13.5 L19.5 15 L20.5 15.5 L20 17 L20.5 18.5 L18.5 19 L17.5 20 L16 19.5 L14 19 L13.5 17.5 L13 16 L14 14.5 Z"
            fill={color}
            opacity="0.75"
          />
          <circle cx="17" cy="16.5" r="1" fill="#04231C" />
        </svg>
      );
  }
}