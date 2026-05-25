import { Badge } from "./Badge";
import { PLATFORM_META, type PlatformKey } from "@/lib/platforms";

interface SourceLite {
  platform: string;
  url: string;
  metric?: string | null;
  rawTitle?: string;
}

export interface HotItemProps {
  title: string;
  summary?: string | null;
  score?: number;
  category?: string | null;
  tags?: string[];
  updatedAt: string | Date;
  sources: SourceLite[];
  /** 严重等级：MEDIUM/HIGH/CRITICAL/LOW */
  severity?: "critical" | "high" | "medium" | "low";
  /** 是否可信 */
  credibility?: "trusted" | "neutral" | "unreliable";
  /** 直接提及/疑似关联 */
  reference?: "direct" | "related";
  /** 热度（0–100） */
  hotness?: number;
}

const SEVERITY_META = {
  critical: { tone: "red" as const, label: "CRITICAL", emoji: "⚠" },
  high: { tone: "yellow" as const, label: "HIGH", emoji: "▲" },
  medium: { tone: "yellow" as const, label: "MEDIUM", emoji: "◆" },
  low: { tone: "green" as const, label: "LOW", emoji: "○" },
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

  return (
    <a
      href={primary?.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block glass glass-hover p-5 group"
    >
      {/* 顶部 badge 行 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {sev && (
          <Badge tone={sev.tone} className="font-bold">
            <span>{sev.emoji}</span> {sev.label}
          </Badge>
        )}
        {platformMeta && (
          <Badge tone="neutral" className="font-medium">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: platformMeta.color }} />
            {platformMeta.label}
          </Badge>
        )}
        {category && <Badge tone="cyan">{category}</Badge>}
        <Badge tone={cred.tone}>● {cred.label}</Badge>
        {ref && <Badge tone={ref.tone}>{ref.label}</Badge>}
        {typeof hotness === "number" && hotness > 0 && (
          <Badge tone="pink">🔥 温 {Math.round(hotness)}</Badge>
        )}
      </div>

      {/* 标题 */}
      <h3 className="text-base font-medium text-white group-hover:text-[var(--color-brand-bright)] transition-colors leading-snug line-clamp-2">
        {title}
      </h3>

      {/* 摘要 */}
      {summary && (
        <p className="mt-2 text-sm text-[var(--color-text-muted)] line-clamp-2 leading-relaxed">
          {summary}
        </p>
      )}

      {/* 底部：metric + 时间 */}
      <div className="mt-3.5 flex items-center justify-between gap-3 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-3 flex-wrap">
          {primary?.metric && (
            <span className="inline-flex items-center gap-1 text-[var(--color-text-dim)]">
              {platformMeta?.metricLabel ?? "热度"} · {primary.metric}
            </span>
          )}
          {typeof score === "number" && score > 0 && (
            <span className="inline-flex items-center gap-1">
              <span className="text-[var(--color-warn-bright)]">★</span>
              {score.toFixed(0)}
            </span>
          )}
          {tags.slice(0, 2).map((t) => (
            <span key={t} className="text-[var(--color-text-muted)]">
              #{t}
            </span>
          ))}
        </div>
        <span className="shrink-0 tabular-nums">{timeAgo(updatedAt)}</span>
      </div>
    </a>
  );
}
