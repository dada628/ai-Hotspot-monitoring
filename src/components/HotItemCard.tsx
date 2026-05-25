"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Badge } from "./Badge";
import { BorderBeam } from "./aceternity/BorderBeam";
import { PLATFORM_META, type PlatformKey } from "@/lib/platforms";

interface SourceLite {
  platform: string;
  url: string;
  metric?: string | null;
  rawTitle?: string;
}

export interface HotItemProps {
  /** HotSpot.id —— 用于跳详情页 */
  id?: string;
  title: string;
  summary?: string | null;
  score?: number;
  category?: string | null;
  tags?: string[];
  updatedAt: string | Date;
  sources: SourceLite[];
  severity?: "critical" | "high" | "medium" | "low";
  credibility?: "trusted" | "neutral" | "unreliable";
  reference?: "direct" | "related";
  hotness?: number;
}

const SEVERITY_META = {
  critical: { tone: "red" as const, label: "CRITICAL", icon: <AlertTriangleIcon /> },
  high: { tone: "yellow" as const, label: "HIGH", icon: <ArrowUpIcon /> },
  medium: { tone: "yellow" as const, label: "MEDIUM", icon: <DiamondIcon /> },
  low: { tone: "green" as const, label: "LOW", icon: <DotIcon /> },
};

const CRED_META = {
  trusted: { tone: "green" as const, label: "可信" },
  neutral: { tone: "neutral" as const, label: "中性" },
  unreliable: { tone: "red" as const, label: "存疑" },
};

const REF_META = {
  direct: { tone: "violet" as const, label: "直接提及" },
  related: { tone: "neutral" as const, label: "关联" },
};

function timeAgo(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export function HotItemCard({
  id,
  title,
  summary,
  score,
  category,
  tags = [],
  updatedAt,
  sources,
  severity,
  credibility = "neutral",
  reference,
  hotness,
}: HotItemProps) {
  const primary = sources[0];
  const platformMeta =
    primary && PLATFORM_META[primary.platform as PlatformKey];
  const sev = severity ? SEVERITY_META[severity] : null;
  const cred = CRED_META[credibility];
  const ref = reference ? REF_META[reference] : null;
  const isCritical = severity === "critical";
  const rootRef = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    el.style.setProperty("--spot-opacity", "1");
  };
  const handleMouseLeave = () => {
    const el = rootRef.current;
    if (el) el.style.setProperty("--spot-opacity", "0");
  };

  // 整张卡片优先点击跳详情页（如果有 id），右下角小链接跳外链原文
  // 注意：typedRoutes 严格模式下不能把模板字符串赋给变量再传 Link，必须直接传

  return (
    <div
      ref={rootRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        {
          "--spot-color": isCritical
            ? "rgba(255, 59, 59, 0.18)"
            : "rgba(0, 229, 255, 0.16)",
          "--spot-radius": "420px",
          "--spot-opacity": "0",
        } as React.CSSProperties
      }
      className="card-spotlight block glass glass-hover relative p-5 group"
    >
      {isCritical && (
        <BorderBeam
          duration={5}
          size={45}
          colorFrom="#ff3b3b"
          colorTo="#ff8a3d"
          borderRadius={16}
        />
      )}

      {/* 顶部 badge 行 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {sev && (
          <Badge tone={sev.tone} className="font-bold">
            <span className="inline-flex items-center">{sev.icon}</span>
            {sev.label}
          </Badge>
        )}
        {platformMeta && (
          <Badge tone="neutral" className="font-medium">
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: platformMeta.color }}
            />
            {platformMeta.label}
          </Badge>
        )}
        {category && <Badge tone="cyan">{category}</Badge>}
        <Badge tone={cred.tone}>
          <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" />
          {cred.label}
        </Badge>
        {ref && <Badge tone={ref.tone}>{ref.label}</Badge>}
        {typeof hotness === "number" && hotness > 0 && (
          <Badge tone="pink">
            <FlameMiniIcon /> 温 {Math.round(hotness)}
          </Badge>
        )}
      </div>

      {/* 标题 —— 有 id 时跳详情页，无 id 时纯文本 */}
      {id ? (
        <Link
          href={`/hotspot/${id}` as Route}
          className="block group/title"
        >
          <h3 className="text-base font-medium text-white group-hover/title:text-[var(--color-cyan-bright)] transition-colors leading-snug line-clamp-2">
            {title}
          </h3>
        </Link>
      ) : (
        <h3 className="text-base font-medium text-white leading-snug line-clamp-2">
          {title}
        </h3>
      )}

      {/* 摘要 */}
      {summary && (
        <p className="mt-2 text-sm text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
          {summary}
        </p>
      )}

      {/* 底部：metric + 时间 + 原文链接 */}
      <div className="mt-3.5 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {primary?.metric && (
            <span className="inline-flex items-center gap-1 text-[var(--color-text-dim)]">
              {platformMeta?.metricLabel ?? "热度"} · {primary.metric}
            </span>
          )}
          {typeof score === "number" && score > 0 && (
            <span className="inline-flex items-center gap-1">
              <StarIcon />
              {score.toFixed(0)}
            </span>
          )}
          {tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[var(--color-text-muted)]">
              #{t}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {primary?.url && (
            <a
              href={primary.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 text-[var(--color-text-muted)] hover:text-[#00e5ff] transition-colors"
              title="在新标签打开原文"
            >
              原文 <ArrowUpRightIcon />
            </a>
          )}
          <span className="tabular-nums">{timeAgo(updatedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3L22 20H2L12 3Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M12 10V14M12 17V17.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ArrowUpIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 4V20M12 4L5 11M12 4L19 11"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function DiamondIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2L22 12L12 22L2 12L12 2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function DotIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="4" fill="currentColor" />
    </svg>
  );
}
function StarIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      className="text-[var(--color-warn-bright)]"
    >
      <path d="M12 2L14.39 8.26L21 9.27L16 14.14L17.18 21L12 17.77L6.82 21L8 14.14L3 9.27L9.61 8.26L12 2Z" />
    </svg>
  );
}
function FlameMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C12 2 9 6 9 10C9 12.5 10.5 14 12 14C13.5 14 15 12.5 15 10C15 8.5 14 7 14 7C14 7 15.5 8 16.5 10C17.5 12 17.5 14 17.5 14C17.5 18 14.5 22 12 22C9.5 22 6.5 18 6.5 14C6.5 8 12 2 12 2Z" />
    </svg>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 17L17 7M17 7H9M17 7V15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
