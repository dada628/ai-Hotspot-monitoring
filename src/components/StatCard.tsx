import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  label: string;
  value: number | string;
  /** 同比/状态描述 */
  hint?: string;
  /** 主色调 */
  tone?: "cyan" | "violet" | "pink" | "green" | "yellow" | "red";
  /** 加载状态 */
  loading?: boolean;
}

const TONE = {
  cyan: {
    icon: "text-[var(--color-cyan-bright)] bg-[rgba(34,211,238,0.12)]",
    glow: "rgba(34, 211, 238, 0.5)",
    bar: "from-cyan-400 to-cyan-200",
  },
  violet: {
    icon: "text-[var(--color-violet-bright)] bg-[rgba(139,92,246,0.12)]",
    glow: "rgba(139, 92, 246, 0.5)",
    bar: "from-violet-400 to-violet-200",
  },
  pink: {
    icon: "text-[var(--color-pink-bright)] bg-[rgba(236,72,153,0.12)]",
    glow: "rgba(236, 72, 153, 0.5)",
    bar: "from-pink-400 to-pink-200",
  },
  green: {
    icon: "text-[var(--color-success-bright)] bg-[rgba(16,185,129,0.12)]",
    glow: "rgba(16, 185, 129, 0.5)",
    bar: "from-emerald-400 to-emerald-200",
  },
  yellow: {
    icon: "text-[var(--color-warn-bright)] bg-[rgba(245,158,11,0.12)]",
    glow: "rgba(245, 158, 11, 0.5)",
    bar: "from-amber-400 to-amber-200",
  },
  red: {
    icon: "text-[var(--color-danger-bright)] bg-[rgba(239,68,68,0.12)]",
    glow: "rgba(239, 68, 68, 0.5)",
    bar: "from-rose-400 to-rose-200",
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
  return (
    <div className="relative glass glass-hover p-5 overflow-hidden group">
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
          <div className="text-4xl font-bold text-white tracking-tight tabular-nums">
            {typeof value === "number" ? value.toLocaleString() : value}
          </div>
        )}
        {hint && (
          <div className="mt-1.5 text-xs text-[var(--color-text-muted)]">
            {hint}
          </div>
        )}
      </div>

      <div
        className="absolute -right-12 -bottom-12 w-32 h-32 rounded-full opacity-20 group-hover:opacity-30 transition-opacity blur-2xl pointer-events-none"
        style={{ background: t.glow }}
      />
    </div>
  );
}
