"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";

/**
 * Layered, perspective-tilted "Business Brain" mascot.
 *
 * Renders three concentric brain silhouettes on stacked planes with a CSS
 * perspective transform. Mouse movement drives a subtle parallax tilt via
 * framer-motion's `useMotionValue` (set imperatively through refs to avoid
 * a render storm). When `prefers-reduced-motion` is on, the brain renders
 * a static layered stack — no parallax, no rotation.
 */
export function Brain3D({ size = 220 }: { size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (reduceMotion) return;
    const node = ref.current;
    if (!node) return;
    const onMove = (e: MouseEvent) => {
      const rect = node.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 16; // tiltX
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * -16; // tiltY
      node.style.setProperty("--tilt-x", `${y.toFixed(2)}deg`);
      node.style.setProperty("--tilt-y", `${x.toFixed(2)}deg`);
    };
    const onLeave = () => {
      node.style.setProperty("--tilt-x", "0deg");
      node.style.setProperty("--tilt-y", "0deg");
    };
    node.addEventListener("mousemove", onMove);
    node.addEventListener("mouseleave", onLeave);
    return () => {
      node.removeEventListener("mousemove", onMove);
      node.removeEventListener("mouseleave", onLeave);
    };
  }, [reduceMotion]);

  return (
    <div
      ref={ref}
      className="relative"
      style={{
        width: size,
        height: size,
        perspective: 800,
        // @ts-expect-error — CSS vars
        "--tilt-x": "0deg",
        "--tilt-y": "0deg"
      }}
      aria-hidden
    >
      {/* Core glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "radial-gradient(closest-side, var(--accent-soft), transparent 70%)"
        }}
        animate={reduceMotion ? {} : { scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Three stacked brain layers */}
      <div
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{
          transformStyle: "preserve-3d",
          transform: "rotateX(var(--tilt-x)) rotateY(var(--tilt-y))"
        }}
      >
        <BrainLayer depth={-30} opacity={0.25} scale={0.82} />
        <BrainLayer depth={-15} opacity={0.55} scale={0.92} />
        <BrainLayer depth={0} opacity={1} scale={1} />
      </div>

      {/* Orbiting synapse dots */}
      {!reduceMotion && <SynapseRing size={size} />}
    </div>
  );
}

function BrainLayer({ depth, opacity, scale }: { depth: number; opacity: number; scale: number }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className="absolute inset-0"
      style={{
        transform: `translateZ(${depth}px) scale(${scale})`,
        opacity,
        filter: depth < 0 ? "blur(2px)" : "none"
      }}
    >
      <defs>
        <linearGradient id={`brain-g-${depth}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.95" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.65" />
        </linearGradient>
        <radialGradient id={`brain-core-${depth}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="var(--accent-fg-on-bg)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="42" fill={`url(#brain-core-${depth})`} />
      <path
        d="M50 12 C 30 12 18 26 18 40 C 10 42 6 54 14 60 C 8 68 14 82 24 82 C 28 90 36 96 50 96 C 64 96 72 90 76 82 C 86 82 92 68 86 60 C 94 54 90 42 82 40 C 82 26 70 12 50 12 Z"
        fill={`url(#brain-g-${depth})`}
        stroke="var(--accent-border)"
        strokeWidth="0.6"
      />
      {/* Folds (deeper layers more diffuse) */}
      <g stroke="var(--accent-fg-on-bg)" strokeOpacity={0.55} fill="none" strokeWidth="1">
        <path d="M30 42 C 38 34 52 42 62 34 C 68 40 72 48 62 54" />
        <path d="M30 64 C 40 68 52 60 62 68 C 68 64 72 70 72 74" />
        <path d="M40 28 C 46 32 54 28 60 32" />
      </g>
    </svg>
  );
}

function SynapseRing({ size }: { size: number }) {
  const dots = Array.from({ length: 14 });
  return (
    <svg className="absolute inset-0 pointer-events-none" viewBox="0 0 100 100" width={size} height={size}>
      {dots.map((_, i) => {
        const angle = (i / dots.length) * Math.PI * 2;
        const r = 46;
        const cx = 50 + Math.cos(angle) * r;
        const cy = 50 + Math.sin(angle) * r;
        return (
          <motion.circle
            key={i}
            cx={cx}
            cy={cy}
            r={1.4}
            fill="var(--accent)"
            initial={{ opacity: 0.2 }}
            animate={{ opacity: [0.2, 0.9, 0.2] }}
            transition={{ duration: 2 + (i % 3) * 0.4, repeat: Infinity, delay: i * 0.15 }}
          />
        );
      })}
    </svg>
  );
}