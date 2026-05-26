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
  /**
   * v8 起：原始 metric 对象（page.tsx 已 parse 过的 JSON）；
   * 卡片内部自己从中提取主指标 / 作者 / 评论数 / 媒体名等。
   */
  metric?: Record<string, unknown> | null;
  rawTitle?: string;
  /** v8 新增：该 source 在原平台的发布时间（ISO 字符串） */
  publishedAt?: string | null;
}

export interface HotItemProps {
  /** HotSpot.id —— 用于跳详情页 */
  id?: string;
  title: string;
  /** AI 生成的摘要（processedAt != null 时存在） */
  summary?: string | null;
  /** 是否为 AI 摘要（即 HotSpot.processedAt != null）；false 时 summary 可能为空 */
  isAiSummary?: boolean;
  score?: number;
  category?: string | null;
  tags?: string[];
  /** HotSpot 级最早发布时间（取所有 source 最早） */
  publishedAt?: string | null;
  /** 抓取/合并时间 */
  updatedAt: string | Date;
  sources: SourceLite[];
  severity?: "critical" | "high" | "medium" | "low";
  credibility?: "trusted" | "neutral" | "unreliable";
  reference?: "direct" | "related";
  hotness?: number;
  /** AI Pipeline 输出的爆发速度（分/小时），> 阈值时显示飙升徽章 */
  trendVelocity?: number | null;
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

/** trendVelocity > 此阈值时显示"飙升"徽章（分/小时） */
const TREND_VELOCITY_THRESHOLD = 8;

function timeAgo(dateInput: string | Date | null | undefined): string | null {
  if (!dateInput) return null;
  const d = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 月前`;
  const years = Math.floor(days / 365);
  return `${years} 年前`;
}

function compactNumber(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)}万`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString();
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * 从单个 source 的 metric 中提取主指标（用于"♥ 1.2万"这种主显示）。
 * 与 9 个平台 scraper 落库的字段对齐。
 */
function pickPrimaryMetric(
  platform: string,
  m: Record<string, unknown>,
): { icon: React.ReactNode; value: string; label: string } | null {
  if (platform === "weibo") {
    const heat = num(m.heat) || num(m.hotValue);
    if (heat > 0) return { icon: <FlameMiniIcon />, value: compactNumber(heat), label: "热度" };
  }
  if (platform === "zhihu") {
    const heat = num(m.heat);
    if (heat > 0) return { icon: <FlameMiniIcon />, value: compactNumber(heat), label: "热度" };
    const heatText = str(m.heatText);
    if (heatText) return { icon: <FlameMiniIcon />, value: heatText, label: "热度" };
  }
  if (platform === "bilibili") {
    const view = num(m.view) || num(m.views);
    if (view > 0) return { icon: <EyeMiniIcon />, value: compactNumber(view), label: "播放" };
  }
  if (platform === "github") {
    const stars = num(m.totalStars) || num(m.stars);
    const today = num(m.todayStars);
    if (stars > 0)
      return {
        icon: <StarMiniIcon />,
        value: today > 0 ? `${compactNumber(stars)} (+${today})` : compactNumber(stars),
        label: "stars",
      };
  }
  if (platform === "twitter") {
    const likes = num(m.likes);
    if (likes > 0) return { icon: <HeartMiniIcon />, value: compactNumber(likes), label: "赞" };
  }
  if (platform === "hackernews") {
    const score = num(m.score);
    if (score > 0) return { icon: <TriangleUpIcon />, value: compactNumber(score), label: "分" };
  }
  if (platform === "reddit") {
    const ups = num(m.upvotes);
    if (ups > 0) return { icon: <TriangleUpIcon />, value: compactNumber(ups), label: "升" };
  }
  // googlenews/infoq 没有量化指标
  return null;
}

/**
 * 提取次要指标：评论数、浏览数、收藏等。返回最多 2 条用于"♥ 1.2万 · 💬 234 · 👁 12k"。
 */
function pickSecondaryMetrics(
  platform: string,
  m: Record<string, unknown>,
): Array<{ icon: React.ReactNode; value: string }> {
  const out: Array<{ icon: React.ReactNode; value: string }> = [];
  const comments =
    num(m.comments) || num(m.replies) || num(m.reply); // hn/twitter/bilibili
  if (comments > 0) {
    out.push({ icon: <ChatMiniIcon />, value: compactNumber(comments) });
  }
  const views = num(m.views); // twitter
  if (views > 0 && platform === "twitter") {
    out.push({ icon: <EyeMiniIcon />, value: compactNumber(views) });
  }
  return out.slice(0, 2);
}

/** 提取作者 / 媒体出处（用于底部右侧标识发布主体） */
function pickAuthorLabel(
  platform: string,
  m: Record<string, unknown>,
): { prefix: string; name: string } | null {
  if (platform === "twitter") {
    const user = str(m.author);
    if (user) return { prefix: "@", name: user };
  }
  if (platform === "reddit") {
    const user = str(m.author);
    if (user && user !== "[deleted]") return { prefix: "u/", name: user };
  }
  if (platform === "hackernews") {
    const user = str(m.author);
    if (user) return { prefix: "by ", name: user };
  }
  if (platform === "bilibili") {
    const user = str(m.author);
    if (user) return { prefix: "UP ", name: user };
  }
  if (platform === "infoq") {
    const user = str(m.author);
    if (user) return { prefix: "", name: user };
  }
  if (platform === "googlenews") {
    const sourceName = str(m.source);
    if (sourceName) return { prefix: "", name: sourceName };
  }
  return null;
}

export function HotItemCard({
  id,
  title,
  summary,
  isAiSummary,
  score,
  category,
  tags = [],
  publishedAt,
  updatedAt,
  sources,
  severity,
  credibility = "neutral",
  reference,
  hotness,
  trendVelocity,
}: HotItemProps) {
  const primary = sources[0];
  const primaryMetric = primary?.metric ?? {};
  const platformMeta =
    primary && PLATFORM_META[primary.platform as PlatformKey];
  const sev = severity ? SEVERITY_META[severity] : null;
  const cred = CRED_META[credibility];
  const ref = reference ? REF_META[reference] : null;
  const isCritical = severity === "critical";
  const isSurging =
    typeof trendVelocity === "number" &&
    trendVelocity >= TREND_VELOCITY_THRESHOLD;
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

  // ============ 摘要区域：AI 摘要 + 原文摘录双行（Q3-C） ============
  // 规则：
  //   1. AI 摘要：summary 非空 且 isAiSummary === true → 显示，标 "AI 摘要"
  //   2. 原文摘录：
  //      - 优先用 source.metric.excerpt（zhihu 有）/ metric.desc（bilibili，但当前没存）
  //      - 退化到 source.rawTitle（与主标题不同时才显示，避免重复）
  //   3. 若仅有 AI 摘要 → 单行 AI；若仅有原文 → 单行原文；两者都有且不同 → 两行
  //   4. 若 AI 摘要 = 原文摘录（完全一致），不重复显示
  const aiSummaryText =
    isAiSummary && summary && summary.trim().length > 0 ? summary.trim() : null;
  const rawExcerpt = pickRawExcerpt(primary);
  const showOriginal =
    rawExcerpt &&
    rawExcerpt !== aiSummaryText &&
    rawExcerpt !== title; // 避免和标题完全相同时重复

  // ============ 时间显示 ============
  const publishedAgo = timeAgo(publishedAt);
  const updatedAgo = timeAgo(updatedAt);
  const showBothTimes = publishedAgo && updatedAgo && publishedAgo !== updatedAgo;

  // ============ metric 提取 ============
  const main = pickPrimaryMetric(primary?.platform ?? "", primaryMetric);
  const secondary = pickSecondaryMetrics(primary?.platform ?? "", primaryMetric);
  const authorLabel = pickAuthorLabel(primary?.platform ?? "", primaryMetric);

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
        {isSurging && (
          <Badge tone="yellow" className="font-medium">
            <RocketMiniIcon /> 飙升 {Math.round(trendVelocity ?? 0)}/h
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

      {/* 摘要区域：AI 摘要 + 原文摘录双行 */}
      {(aiSummaryText || showOriginal) && (
        <div className="mt-2.5 space-y-1.5">
          {aiSummaryText && (
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide bg-[rgba(167,139,250,0.14)] text-[#c4b5fd] border border-[rgba(167,139,250,0.3)]">
                <SparkMiniIcon /> AI 摘要
              </span>
              <p className="text-sm text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
                {aiSummaryText}
              </p>
            </div>
          )}
          {showOriginal && (
            <div className="flex items-start gap-2">
              <span className="shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide bg-[rgba(148,163,184,0.10)] text-[var(--color-text-dim)] border border-[var(--color-line)]">
                <QuoteMiniIcon /> 原文摘录
              </span>
              <p className="text-sm text-[var(--color-text-dim)] line-clamp-2 leading-relaxed">
                {rawExcerpt}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 底部 row 1：紧凑互动指标 + 作者/媒体 + AI 分 + tags */}
      <div className="mt-3.5 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap min-w-0">
          {main && (
            <span className="inline-flex items-center gap-1 text-[var(--color-text-dim)]">
              <span className="opacity-70">{main.icon}</span>
              {main.value}
            </span>
          )}
          {secondary.map((s, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 text-[var(--color-text-muted)]"
            >
              <span className="opacity-60">{s.icon}</span>
              {s.value}
            </span>
          ))}
          {authorLabel && (
            <span className="inline-flex items-center gap-0.5 text-[var(--color-text-muted)] max-w-[160px] truncate">
              <UserMiniIcon />
              <span className="truncate">
                {authorLabel.prefix}
                {authorLabel.name}
              </span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
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
      </div>

      {/* 底部 row 2：发布时间 · 抓取时间 · 原文 */}
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[11px] text-[var(--color-text-muted)]">
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          {publishedAgo ? (
            <span className="inline-flex items-center gap-1">
              <CalendarMiniIcon />
              发布 {publishedAgo}
            </span>
          ) : null}
          {(publishedAgo ? showBothTimes : updatedAgo) && (
            <span className="inline-flex items-center gap-1 opacity-80">
              <RefreshTinyIcon />
              {publishedAgo ? "抓取" : "更新"} {updatedAgo}
            </span>
          )}
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
        </div>
      </div>
    </div>
  );
}

/**
 * 从 primary source 中尝试取出"原文摘录"。
 * - zhihu 的 metric.excerpt 是知乎给的原始问题描述
 * - 其他平台暂时退化到 source.rawTitle（与主 title 不同时才会显示）
 */
function pickRawExcerpt(primary: SourceLite | undefined): string | null {
  if (!primary) return null;
  const m = primary.metric ?? {};
  const excerpt = str(m.excerpt) || str(m.description) || str(m.desc);
  if (excerpt) return excerpt;
  const raw = (primary.rawTitle ?? "").trim();
  return raw || null;
}

// ============== Inline Icons ==============

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
function StarMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L14.39 8.26L21 9.27L16 14.14L17.18 21L12 17.77L6.82 21L8 14.14L3 9.27L9.61 8.26L12 2Z" />
    </svg>
  );
}
function HeartMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21C12 21 4 14 4 8.5C4 5.5 6.5 3 9.5 3C11 3 12 4 12 4C12 4 13 3 14.5 3C17.5 3 20 5.5 20 8.5C20 14 12 21 12 21Z" />
    </svg>
  );
}
function EyeMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function ChatMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M21 11.5C21 16.19 16.97 20 12 20C10.4 20 8.93 19.65 7.66 19.04L3 20L4.2 16.13C3.44 14.86 3 13.23 3 11.5C3 6.81 7.03 3 12 3C16.97 3 21 6.81 21 11.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TriangleUpIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 5L22 19H2L12 5Z" />
    </svg>
  );
}
function UserMiniIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
      <path
        d="M4 21C4 17 7 14 12 14C17 14 20 17 20 21"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CalendarMiniIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9H21M8 3V7M16 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function RefreshTinyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12C3 7.03 7.03 3 12 3C16 3 19.4 5.66 20.6 9.3M21 4V9H16M21 12C21 16.97 16.97 21 12 21C8 21 4.6 18.34 3.4 14.7M3 20V15H8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function RocketMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M5 19L9 15M5 19C3.5 19 3.5 17.5 3.5 17.5C3.5 15 5 13 5 13L9 17C9 17 7 18.5 4.5 18.5C4.5 18.5 5 19 5 19Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14.5 3C18 3 21 6 21 9.5C21 13 16 18 14 18C12 18 9 15 6 12C6 10 11 5 14.5 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="15" cy="9" r="1.5" fill="currentColor" />
    </svg>
  );
}
function SparkMiniIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
    </svg>
  );
}
function QuoteMiniIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none">
      <path
        d="M7 7C5 7 4 8.5 4 10.5C4 13 6 14 6 14L4 19H8L9 15C10 13 10 10 10 10C10 8.5 9 7 7 7ZM17 7C15 7 14 8.5 14 10.5C14 13 16 14 16 14L14 19H18L19 15C20 13 20 10 20 10C20 8.5 19 7 17 7Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
