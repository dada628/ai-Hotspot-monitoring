import type { ReactNode } from "react";

type BadgeTone =
  | "cyan"
  | "violet"
  | "pink"
  | "green"
  | "yellow"
  | "red"
  | "neutral";

interface BadgeProps {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

const TONE_CLASS: Record<BadgeTone, string> = {
  cyan: "badge-cyan",
  violet: "badge-violet",
  pink: "badge-pink",
  green: "badge-green",
  yellow: "badge-yellow",
  red: "badge-red",
  neutral:
    "bg-[rgba(148,163,184,0.1)] text-[var(--color-text-dim)] border-[var(--color-line-bright)]",
};

export function Badge({
  tone = "neutral",
  children,
  className = "",
  icon,
}: BadgeProps) {
  return (
    <span className={`badge ${TONE_CLASS[tone]} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
