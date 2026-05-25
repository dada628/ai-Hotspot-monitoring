"use client";

import { useRef, type ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  hint?: string;
  /** 主色调（cyan = 默认强调；electric = 高亮焦点；其余为辅助） */
  tone?: "cyan" | "electric" | "blue" | "violet" | "pink" | "green" | "red";
  loading?: boolean;
}

const TONE = {
  cyan: {
    icon: "text-[var(--color-cyan-bright)] bg-[rgba(34,211,238,0.10)]",
    glow: "rgba(34, 211, 238, 0.18)",
    accent: "#67e8f9",
  },
  electric: {
    icon: "text-[#00e5ff] bg-[rgba(0,229,255,0.10)]",
    glow: "rgba(0, 229, 255, 0.22)",
    accent: "#00e5ff",
  },
  blue: {
    icon: "text-[var(--color-brand-bright)] bg-[rgba(96,165,250,0.10)]",
    glow: "rgba(96, 165, 250, 0.18)",
    accent: "#60a5fa",
  },
  violet: {
    icon: "text-[var(--color-violet-bright)] bg-[rgba(139,92,246,0.10)]",
    glow: "rgba(139, 92, 246, 0.18)",
    accent: "#a78bfa",
  },
  pink: {
    icon: "text-[var(--color-pink-bright)] bg-[rgba(236,72,153,0.10)]",
    glow: "rgba(236, 72, 153, 0.18)",
    accent: "#f472b6",
  },
  green: {
    icon: "text-[var(--color-success-bright)] bg-[rgba(16,185,129,0.10)]",
    glow: "rgba(16, 185, 129, 0.18)",
    accent: "#34d399",
  },
  red: {
    icon: "text-[var(--color-danger-bright)] bg-[rgba(255,59,59,0.10)]",
    glow: "rgba(255, 59, 59, 0.18)",
    accent: "#ff3b3b",
  },
} as const;

export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "cyan",
  loading = false,
}: StatCardProps) {
  const t = TONE[tone];
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    el.style.setProperty("--spot-opacity", "1");
  };
  const handleMouseLeave = () => {
    const el = ref.current;
    if (el) el.style.setProperty("--spot-opacity", "0");
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="card-spotlight glass glass-hover relative p-5 overflow-hidden group"
      style={
        {
          "--spot-color": t.glow,
          "--spot-radius": "320px",
          "--spot-opacity": "0",
        } as React.CSSProperties
      }
    >
      <div className="flex items-center gap-2.5">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center ${t.icon}`}
        >
          {icon}
        </div>
        <span className="text-sm font-medium text-[var(--color-text-dim)]">
          {label}
        </span>
      </div>

      <div className="mt-4">
        {loading ? (
          <div className="h-10 w-20 rounded-md shimmer" />
        ) : (
          <div
            className="text-4xl font-bold text-white tracking-tight tabular-nums"
            style={{
              textShadow: `0 0 24px ${t.glow}`,
            }}
          >
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
        )}
        {hint && (
          <div className="mt-1.5 text-xs text-[var(--color-text-muted)]">
            {hint}
          </div>
        )}
      </div>

      {/* 顶部 1px 强调线 */}
      <div
        className="absolute top-0 left-4 right-4 h-px opacity-50 group-hover:opacity-100 transition-opacity"
        style={{
          background: `linear-gradient(90deg, transparent, ${t.accent}, transparent)`,
        }}
      />
    </div>
  );
}
