"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/Badge";
import { Spotlight } from "@/components/aceternity/Spotlight";
import { BorderBeam } from "@/components/aceternity/BorderBeam";
import { PLATFORM_META, type PlatformKey } from "@/lib/platforms";
import { collectSourceExcerpts } from "@/lib/source-excerpt";
import { getSingleAiAction } from "@/lib/single-ai-action";

interface HotSpotSource {
  id: string;
  platform: string;
  url: string;
  rawTitle: string;
  metric: string;
  publishedAt: string | null;
  fetchedAt: string;
}

interface HotSpotDetail {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  tags: string; // JSON
  score: number;
  engagementScore: number;
  trendVelocity: number | null;
  keyPoints: string; // JSON
  entities: string; // JSON
  processedAt: string | null;
  publishedAt: string | null;
  firstSeenAt: string;
  updatedAt: string;
  sources: HotSpotSource[];
}

interface RelatedItem {
  id: string;
  title: string;
  category: string | null;
  tags: string; // JSON
  score: number;
  engagementScore: number;
  updatedAt: string;
  sources: Array<{ platform: string }>;
  relevance: number;
  sharedTags: number;
  categoryMatch: boolean;
}

interface RelatedResponse {
  main: { id: string; title: string; category: string | null };
  items: RelatedItem[];
  candidatesScanned: number;
  windowDays: number;
}

const CATEGORY_LABELS_ZH: Record<string, string> = {
  tech: "科技",
  society: "社会",
  entertainment: "娱乐",
  finance: "财经",
  sports: "体育",
  culture: "文化",
  science: "科学",
  other: "其他",
};

export default function HotSpotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [data, setData] = useState<HotSpotDetail | null>(null);
  const [related, setRelated] = useState<RelatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [relatedLoading, setRelatedLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const BEARER = "Bearer dev-cron-secret-please-replace-1234567890";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/hotspots/${id}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `HTTP ${res.status}`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadRelated = useCallback(async () => {
    setRelatedLoading(true);
    try {
      const res = await fetch(`/api/hotspots/${id}/related?limit=6`, {
        cache: "no-store",
      });
      if (res.ok) setRelated(await res.json());
    } catch {
      // 相关热点失败不阻塞主内容
    } finally {
      setRelatedLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    loadRelated();
  }, [load, loadRelated]);

  const processOneItem = async () => {
    if (aiProcessing) return;
    setAiProcessing(true);
    setAiMessage(null);
    try {
      const res = await fetch(`/api/process?ids=${encodeURIComponent(id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: BEARER,
        },
      });
      const body = (await res.json()) as {
        error?: string;
        detail?: string;
        ai?: { totalDurationMs: number };
      };
      if (!res.ok) {
        throw new Error(body.detail || body.error || `HTTP ${res.status}`);
      }
      const secs = ((body.ai?.totalDurationMs ?? 0) / 1000).toFixed(1);
      setAiMessage(`AI 处理完成 · 用时 ${secs}s`);
      await load();
      await loadRelated();
    } catch (e) {
      setAiMessage(
        `AI 处理失败：${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setAiProcessing(false);
    }
  };

  const singleAi = data
    ? getSingleAiAction({
        processedAt: data.processedAt,
        summary: data.summary,
      })
    : null;

  return (
    <main className="relative min-h-screen">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(7,11,22,0.7)] border-b border-[var(--color-line)]">
        <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Brand />
          <Link href="/" className="btn btn-secondary">
            <ArrowLeftIcon /> 返回信息流
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {loading && !data && (
          <div className="space-y-4">
            <div className="glass p-8 h-40 shimmer" />
            <div className="glass p-6 h-28 shimmer" />
            <div className="glass p-6 h-28 shimmer" />
          </div>
        )}

        {error && (
          <div className="glass-strong p-6 text-center text-[var(--color-danger-bright)]">
            <div className="text-base font-medium mb-1">加载失败</div>
            <div className="text-sm opacity-80">{error}</div>
            <button
              type="button"
              className="btn btn-secondary mt-4"
              onClick={load}
            >
              重试
            </button>
          </div>
        )}

        {data && (
          <DetailContent
            data={data}
            related={related}
            relatedLoading={relatedLoading}
            onAiProcess={singleAi ? processOneItem : undefined}
            aiProcessLabel={singleAi?.label ?? "AI 处理"}
            aiProcessing={aiProcessing}
            aiMessage={aiMessage}
          />
        )}
      </div>

      <footer className="max-w-5xl mx-auto px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
        HotPulse · 详情视图 ·{" "}
        <span className="text-[#00e5ff]">AI Pipeline 增强</span>
      </footer>
    </main>
  );
}

function DetailContent({
  data,
  related,
  relatedLoading,
  onAiProcess,
  aiProcessLabel = "AI 处理",
  aiProcessing = false,
  aiMessage,
}: {
  data: HotSpotDetail;
  related: RelatedResponse | null;
  relatedLoading: boolean;
  onAiProcess?: () => void;
  aiProcessLabel?: string;
  aiProcessing?: boolean;
  aiMessage?: string | null;
}) {
  const tags = parseJson<string[]>(data.tags, []);
  const keyPoints = parseJson<string[]>(data.keyPoints, []);
  const entities = parseJson<string[]>(data.entities, []);
  const sourceExcerpts = collectSourceExcerpts(
    data.sources.map((s) => ({
      platform: s.platform,
      rawTitle: s.rawTitle,
      metric: s.metric,
    })),
  );
  const effectiveScore = data.score > 0 ? data.score : data.engagementScore;
  const severity = scoreToSeverity(effectiveScore);
  const aiProcessed = !!data.processedAt;
  const sevMeta = SEVERITY_META[severity];
  const catLabel = data.category ? CATEGORY_LABELS_ZH[data.category] : null;
  const platformsInThis = unique(data.sources.map((s) => s.platform));

  return (
    <>
      {/* ===== HERO ===== */}
      <section className="relative overflow-hidden glass-strong p-6 md:p-8">
        {severity === "critical" && (
          <BorderBeam
            duration={5}
            size={70}
            colorFrom="#ff3b3b"
            colorTo="#ff8a3d"
            borderRadius={16}
          />
        )}
        <div className="absolute inset-0 pointer-events-none opacity-60">
          <Spotlight />
        </div>

        <div className="relative">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Badge tone={sevMeta.tone} className="font-bold">
              {sevMeta.icon}
              {sevMeta.label}
            </Badge>
            {catLabel && <Badge tone="cyan">分类 · {catLabel}</Badge>}
            {aiProcessed && (
              <Badge tone="violet">
                <SparklesIcon /> AI 增强
              </Badge>
            )}
            {platformsInThis.length > 1 && (
              <Badge tone="green">
                <LinkChainIcon /> 跨 {platformsInThis.length} 源
              </Badge>
            )}
          </div>

          <h1 className="text-2xl md:text-3xl font-bold text-white leading-tight tracking-tight">
            {data.title}
          </h1>

          {onAiProcess && (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="btn btn-primary inline-flex items-center gap-2 text-sm"
                disabled={aiProcessing}
                onClick={onAiProcess}
                title="单条跑 AI 分类 / 长导读 / 评分（约 15–40 秒）"
              >
                {aiProcessing ? (
                  <>
                    <SpinnerIcon /> 处理中…
                  </>
                ) : (
                  <>
                    <SparklesIcon /> {aiProcessLabel}
                  </>
                )}
              </button>
              {aiMessage && (
                <span
                  className={`text-xs ${
                    aiMessage.includes("失败")
                      ? "text-[var(--color-danger-bright)]"
                      : "text-[#67e8f9]"
                  }`}
                >
                  {aiMessage}
                </span>
              )}
            </div>
          )}

          {/* v8 新增：发布时间 / 抓取时间 二排小字 */}
          <div className="mt-3 flex items-center gap-4 text-xs text-[var(--color-text-muted)] flex-wrap">
            {data.publishedAt ? (
              <span className="inline-flex items-center gap-1.5">
                <CalendarIcon />
                <span>
                  原始发布：
                  <span className="text-[var(--color-text)] tabular-nums">
                    {fmtDateTime(data.publishedAt)}
                  </span>
                  <span className="ml-1.5 opacity-80">
                    ({timeAgoZh(data.publishedAt)})
                  </span>
                </span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 opacity-70">
                <CalendarIcon />
                <span>原始发布：—（该平台未提供）</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <RefreshSmallIcon />
              <span>
                最近抓取：
                <span className="text-[var(--color-text)] tabular-nums">
                  {fmtDateTime(data.updatedAt)}
                </span>
              </span>
            </span>
          </div>

          {/* 评分与时间维度 */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreCell
              label="综合评分"
              value={effectiveScore.toFixed(0)}
              hint={data.score > 0 ? "AI" : "本地"}
              tone="cyan"
            />
            <ScoreCell
              label="爆发速度"
              value={
                data.trendVelocity != null
                  ? data.trendVelocity.toFixed(0)
                  : "—"
              }
              hint={velocityHint(data.trendVelocity)}
              tone="violet"
            />
            <ScoreCell
              label="本地兜底"
              value={data.engagementScore.toFixed(0)}
              hint="metric 综合"
              tone="blue"
            />
            <ScoreCell
              label="跨平台源"
              value={String(data.sources.length)}
              hint={`${platformsInThis.length} 个平台`}
              tone="green"
            />
          </div>

          {/* tags */}
          {tags.length > 0 && (
            <div className="mt-5 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-md text-xs text-[#a5e7ff] bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.2)]"
                >
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ===== AI 长导读（v9 · 200-500 字）===== */}
      {data.summary ? (
        <section className="glass p-6 md:p-7">
          <SectionTitle icon={<SparklesIcon />} text="AI 长导读" />
          <p className="mt-3 text-[15px] text-[var(--color-text)] leading-[1.75] whitespace-pre-line">
            {data.summary}
          </p>
          {data.summary.length < 150 && aiProcessed && (
            <p className="mt-3 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-line)] pt-3">
              本条为旧版短摘要（AI 处理于 v9 之前）· 点击上方「生成长导读」单条重跑即可
            </p>
          )}
        </section>
      ) : (
        <section className="glass p-6 text-center">
          <SparklesIcon className="text-[#67e8f9] opacity-60 mx-auto" />
          <div className="mt-2 text-sm text-[var(--color-text-muted)]">
            尚未 AI 处理 · 可在此单条生成长导读（约 15–40 秒）
          </div>
          {onAiProcess && (
            <button
              type="button"
              className="btn btn-primary mt-4 inline-flex items-center gap-2"
              disabled={aiProcessing}
              onClick={onAiProcess}
            >
              {aiProcessing ? (
                <>
                  <SpinnerIcon /> 处理中…
                </>
              ) : (
                <>
                  <SparklesIcon /> {aiProcessLabel}
                </>
              )}
            </button>
          )}
        </section>
      )}

      {/* ===== 原文摘录（v9 · 各源 RSS/描述，供与 AI 对照）===== */}
      {sourceExcerpts.length > 0 && (
        <section className="glass p-6 md:p-7">
          <SectionTitle icon={<QuoteIcon />} text="原文摘录" />
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            来自各平台抓取时的原始描述，可与上方 AI 长导读交叉验证
          </p>
          <div className="mt-4 space-y-4">
            {sourceExcerpts.map((item) => {
              const plat = PLATFORM_META[item.platform as PlatformKey];
              return (
                <div
                  key={`${item.platform}-${item.excerpt.slice(0, 40)}`}
                  className="rounded-lg border border-[var(--color-line)] bg-[rgba(15,23,42,0.35)] p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums"
                      style={{
                        color: plat?.color ?? "#94a3b8",
                        background: plat?.bgColor ?? "rgba(148,163,184,0.12)",
                      }}
                    >
                      {plat?.shortLabel ?? item.platform.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-muted)]">
                      {plat?.label ?? item.platform}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--color-text-dim)] leading-relaxed">
                    {item.excerpt}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ===== 关键要点 ===== */}
      {keyPoints.length > 0 && (
        <section className="glass p-6 md:p-7">
          <SectionTitle icon={<ListIcon />} text="关键要点" />
          <ul className="mt-3 space-y-2">
            {keyPoints.map((kp, i) => (
              <li
                key={i}
                className="flex items-start gap-3 text-sm text-[var(--color-text)] leading-relaxed"
              >
                <span className="shrink-0 w-5 h-5 rounded-full bg-[rgba(0,229,255,0.12)] border border-[rgba(0,229,255,0.3)] text-[10px] text-[#67e8f9] flex items-center justify-center font-medium tabular-nums">
                  {i + 1}
                </span>
                <span className="pt-0.5">{kp}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ===== 关键实体 ===== */}
      {entities.length > 0 && (
        <section className="glass p-6 md:p-7">
          <SectionTitle icon={<NodesIcon />} text="关键实体" />
          <div className="mt-3 flex flex-wrap gap-2">
            {entities.map((e) => (
              <span
                key={e}
                className="px-2.5 py-1 rounded-md text-sm text-[#e2e8f0] bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.25)]"
              >
                {e}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ===== 多源对比 ===== */}
      <section className="glass p-6 md:p-7">
        <SectionTitle
          icon={<LinkChainIcon />}
          text={`多源对比 · ${data.sources.length} 条`}
        />
        <div className="mt-4 space-y-3">
          {data.sources.map((s) => (
            <SourceRow key={s.id} source={s} />
          ))}
        </div>
      </section>

      {/* ===== 相关热点 ===== */}
      <section className="glass p-6 md:p-7">
        <SectionTitle
          icon={<CompassIcon />}
          text={
            related
              ? `相关热点 · ${related.items.length} 条`
              : "相关热点"
          }
        />
        {relatedLoading && !related ? (
          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="glass p-3 h-20 shimmer" />
            ))}
          </div>
        ) : related && related.items.length > 0 ? (
          <>
            <div className="mt-1 mb-3 text-xs text-[var(--color-text-muted)]">
              基于 tag 重合 + 同分类 + 时效性 · 从最近{" "}
              {related.windowDays} 天 {related.candidatesScanned} 条候选中筛选
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              {related.items.map((item) => (
                <RelatedCard key={item.id} item={item} />
              ))}
            </div>
          </>
        ) : (
          <div className="mt-4 text-center py-6 text-sm text-[var(--color-text-muted)]">
            还没有发现相关热点 · AI 处理更多数据后会更准
          </div>
        )}
      </section>

      {/* ===== 元数据时间 ===== */}
      <section className="glass p-5 text-xs text-[var(--color-text-muted)]">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetaItem
            label="原始发布"
            value={data.publishedAt ? fmtDateTime(data.publishedAt) : "—"}
          />
          <MetaItem label="首次发现" value={fmtDateTime(data.firstSeenAt)} />
          <MetaItem label="最近更新" value={fmtDateTime(data.updatedAt)} />
          <MetaItem
            label="AI 处理"
            value={
              data.processedAt ? fmtDateTime(data.processedAt) : "未处理"
            }
          />
        </div>
      </section>
    </>
  );
}

// ============== 子组件 ==============

function SectionTitle({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <h2 className="flex items-center gap-2 text-base font-semibold text-white">
      <span className="text-[#00e5ff]">{icon}</span>
      {text}
    </h2>
  );
}

function ScoreCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone: "cyan" | "violet" | "blue" | "green";
}) {
  const colors: Record<typeof tone, string> = {
    cyan: "text-[#67e8f9]",
    violet: "text-[#a78bfa]",
    blue: "text-[#60a5fa]",
    green: "text-emerald-300",
  };
  return (
    <div className="rounded-lg border border-[var(--color-line)] bg-[rgba(148,163,184,0.04)] px-4 py-3">
      <div className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wide">
        {label}
      </div>
      <div
        className={`mt-1 text-2xl font-bold tabular-nums ${colors[tone]}`}
      >
        {value}
      </div>
      {hint && (
        <div className="text-[11px] text-[var(--color-text-dim)] mt-0.5">
          {hint}
        </div>
      )}
    </div>
  );
}

function SourceRow({ source }: { source: HotSpotSource }) {
  const meta = PLATFORM_META[source.platform as PlatformKey];
  const metricObj = parseJson<Record<string, unknown>>(source.metric, {});
  const metricDisplay = formatMetric(source.platform, metricObj);

  return (
    <a
      href={source.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block px-4 py-3 rounded-lg border border-[var(--color-line)] bg-[rgba(148,163,184,0.04)] hover:bg-[rgba(148,163,184,0.07)] hover:border-[var(--color-line-strong)] transition-colors group"
    >
      <div className="flex items-center gap-2 mb-1.5">
        {meta && (
          <span
            className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold"
            style={{
              color: meta.color,
              background: meta.bgColor,
              border: `1px solid ${meta.color}30`,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: meta.color }}
            />
            {meta.shortLabel}
          </span>
        )}
        <span className="text-sm text-white group-hover:text-[#00e5ff] transition-colors line-clamp-1 flex-1">
          {source.rawTitle}
        </span>
        <ExternalLinkIcon />
      </div>
      <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] flex-wrap pl-1">
        <span>{meta?.label ?? source.platform}</span>
        {metricDisplay && (
          <>
            <span>·</span>
            <span>{metricDisplay}</span>
          </>
        )}
        {source.publishedAt && (
          <>
            <span>·</span>
            <span
              className="inline-flex items-center gap-1"
              title={`平台发布时间 ${fmtDateTime(source.publishedAt)}`}
            >
              <CalendarTinyIcon />
              发布 {timeAgoZh(source.publishedAt)}
            </span>
          </>
        )}
        <span>·</span>
        <span
          className="tabular-nums"
          title={`抓取时间 ${fmtDateTime(source.fetchedAt)}`}
        >
          抓取 {timeAgoZh(source.fetchedAt)}
        </span>
      </div>
    </a>
  );
}

function RelatedCard({ item }: { item: RelatedItem }) {
  const tags = parseJson<string[]>(item.tags, []);
  const platforms = unique(item.sources.map((s) => s.platform));
  const effectiveScore = item.score > 0 ? item.score : item.engagementScore;
  const catLabel = item.category ? CATEGORY_LABELS_ZH[item.category] : null;

  return (
    <Link
      href={`/hotspot/${item.id}` as Route}
      className="block rounded-lg border border-[var(--color-line)] bg-[rgba(148,163,184,0.04)] hover:bg-[rgba(148,163,184,0.07)] hover:border-[var(--color-line-strong)] transition-colors p-3.5 group"
    >
      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
        {catLabel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded text-[#67e8f9] bg-[rgba(0,229,255,0.08)] border border-[rgba(0,229,255,0.2)]">
            {catLabel}
          </span>
        )}
        {item.categoryMatch && (
          <span className="text-[10px] px-1.5 py-0.5 rounded text-emerald-300 bg-[rgba(16,185,129,0.08)] border border-[rgba(16,185,129,0.25)]">
            同类
          </span>
        )}
        {item.sharedTags > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded text-[#a78bfa] bg-[rgba(167,139,250,0.08)] border border-[rgba(167,139,250,0.25)]">
            共 {item.sharedTags} tag
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-[var(--color-text-dim)] tabular-nums">
          相关度 {(item.relevance * 100).toFixed(0)}%
        </span>
      </div>
      <h4 className="text-sm font-medium text-white group-hover:text-[var(--color-cyan-bright)] transition-colors leading-snug line-clamp-2">
        {item.title}
      </h4>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] flex-wrap">
        <div className="flex items-center gap-1">
          {platforms.slice(0, 3).map((p) => {
            const meta = PLATFORM_META[p as PlatformKey];
            return meta ? (
              <span
                key={p}
                title={meta.label}
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: meta.color }}
              />
            ) : null;
          })}
          {platforms.length > 3 && (
            <span className="text-[10px]">+{platforms.length - 3}</span>
          )}
        </div>
        {effectiveScore > 0 && (
          <span className="tabular-nums">★ {effectiveScore.toFixed(0)}</span>
        )}
        {tags.length > 0 && (
          <span className="line-clamp-1 flex-1 min-w-0">
            {tags
              .slice(0, 3)
              .map((t) => `#${t}`)
              .join(" ")}
          </span>
        )}
      </div>
    </Link>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--color-text-dim)] uppercase tracking-wide">
        {label}
      </div>
      <div className="text-sm text-[var(--color-text)] mt-0.5 tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ============== 工具 ==============

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return v as T;
  } catch {
    return fallback;
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function scoreToSeverity(
  s: number,
): "critical" | "high" | "medium" | "low" {
  if (s >= 85) return "critical";
  if (s >= 70) return "high";
  if (s >= 40) return "medium";
  return "low";
}

function velocityHint(v: number | null | undefined): string {
  if (v == null) return "—";
  if (v >= 80) return "正在爆发";
  if (v >= 50) return "快速上升";
  if (v >= 20) return "温和上升";
  return "平稳/下行";
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgoZh(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  if (diff < 0) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}m 前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h 前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d 前`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}月前`;
  return `${Math.floor(days / 365)}年前`;
}

function formatMetric(platform: string, m: Record<string, unknown>): string {
  const n = (v: unknown) => {
    const num = Number(v);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };
  const fmt = (x: number) =>
    x >= 10000 ? `${(x / 10000).toFixed(1)}万` : x.toLocaleString();

  switch (platform) {
    case "weibo":
    case "zhihu":
      return n(m.heat) ? `热度 ${fmt(n(m.heat))}` : "";
    case "bilibili": {
      const views = n(m.views) || n(m.plays);
      return views ? `播放 ${fmt(views)}` : "";
    }
    case "github":
      return n(m.todayStars)
        ? `今日 +${n(m.todayStars)} ★`
        : n(m.stars)
          ? `★ ${n(m.stars)}`
          : "";
    case "twitter":
      return n(m.likes) ? `♥ ${fmt(n(m.likes))}` : "";
    case "hackernews":
      return n(m.score) ? `▲ ${n(m.score)}` : "";
    case "reddit":
      return n(m.upvotes) || n(m.score) ? `↑ ${n(m.upvotes) || n(m.score)}` : "";
    default:
      return "";
  }
}

const SEVERITY_META = {
  critical: {
    tone: "red" as const,
    label: "CRITICAL",
    icon: <AlertIcon />,
  },
  high: {
    tone: "yellow" as const,
    label: "HIGH",
    icon: <UpArrowIcon />,
  },
  medium: {
    tone: "yellow" as const,
    label: "MEDIUM",
    icon: <DiamondIcon />,
  },
  low: {
    tone: "green" as const,
    label: "LOW",
    icon: <DotIcon />,
  },
};

// ============== 图标 ==============

function ArrowLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M15 6L9 12L15 18"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
    >
      <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" />
      <path d="M19 14L19.7 16.3L22 17L19.7 17.7L19 20L18.3 17.7L16 17L18.3 16.3L19 14Z" />
    </svg>
  );
}
function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className="animate-spin"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeOpacity="0.25"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6H20M9 12H20M9 18H20M4 6H5M4 12H5M4 18H5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function NodesIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="6" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="12" cy="18" r="2.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M8 7L12 16M16 7L12 16M8 6H16"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
function LinkChainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <path
        d="M10 13C10.4 14.4 11.5 15.5 13 15.9L17 11.9C17.7 11.2 18 10.3 18 9.4C18 7.5 16.5 6 14.6 6H13M14 11C13.6 9.6 12.5 8.5 11 8.1L7 12.1C6.3 12.8 6 13.7 6 14.6C6 16.5 7.5 18 9.4 18H11"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CompassIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M15.5 8.5L13 13L8.5 15.5L11 11L15.5 8.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ExternalLinkIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      className="text-[var(--color-text-muted)] group-hover:text-[#00e5ff] transition-colors shrink-0"
    >
      <path
        d="M15 3H21V9M10 14L21 3M19 14V19C19 20 18 21 17 21H5C4 21 3 20 3 19V7C3 6 4 5 5 5H10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function AlertIcon() {
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
function UpArrowIcon() {
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
function QuoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10h4v8H4V10zm12 0h4v8h-4V10zM4 6c2-2 5-2 7 0M16 6c2-2 5-2 7 0"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 9H21M8 3V7M16 3V7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
function CalendarTinyIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M3 9H21M8 3V7M16 3V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function RefreshSmallIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12C3 7.03 7.03 3 12 3C16 3 19.4 5.66 20.6 9.3M21 4V9H16M21 12C21 16.97 16.97 21 12 21C8 21 4.6 18.34 3.4 14.7M3 20V15H8"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
