/**
 * AI Pipeline · 串联与持久化
 *
 * v1 不做跨条去重，每条 HotSpot 独立跑：classify → summarize → score → 写回 DB
 *
 * 设计要点：
 *  - 默认只处理"还没被 AI 处理过"的 HotSpot（score = 0）
 *  - 串行执行（成本可控；30 条 ≈ 3-5 分钟），失败的单条隔离不影响其他
 *  - 处理顺序：按 engagementScore desc，让"看上去就重要"的先吃 AI 预算
 *  - 写回时把 tags 序列化成 JSON 字符串（HotSpot.tags 是 String 列）
 *  - 写回 score 后，前端 effectiveScore = score > 0 ? score : engagementScore，
 *    会自动切换到 AI 结果
 */

import { db } from "@/lib/db";
import { collectSourceExcerpts } from "@/lib/source-excerpt";
import { classify } from "./prompts/classify";
import { summarize } from "./prompts/summarize";
import { score as scoreItem } from "./prompts/score";
import { calcEngagementScore } from "@/lib/score";
import { PipelineStepError, type PipelineStepName } from "./pipeline-step-error";
import type { Category, AiEnrichedFields } from "./schemas";

// ===================== 进度量化（v6 T2 · 模块级内存状态）=====================
//
// 用于让前端通过 GET /api/process/status 拿到当前 processBatch 的实时进度，
// 实现"正在处理 12/20 · 当前: <title>"这种细粒度反馈。
//
// 注意：使用模块级变量意味着 Next.js dev 热重载会重置；多实例部署也无法共享。
// TODO Phase 6: 上 Vercel 时需要迁到 Redis/DB（当前本地 dev 单实例足够）。

export interface ProgressSnapshot {
  /** 是否有 batch 在跑 */
  running: boolean;
  /** 已处理（成功 + 失败）条数 */
  scanned: number;
  succeeded: number;
  failed: number;
  /** 本批共计要处理的条数 */
  total: number;
  /** 当前正在处理的标题（截断到 40 字） */
  currentTitle: string | null;
  /** ISO 时间 */
  startedAt: string | null;
  finishedAt: string | null;
  modelId: string | null;
}

let currentProgress: ProgressSnapshot = {
  running: false,
  scanned: 0,
  succeeded: 0,
  failed: 0,
  total: 0,
  currentTitle: null,
  startedAt: null,
  finishedAt: null,
  modelId: null,
};

export function getCurrentProgress(): ProgressSnapshot {
  return { ...currentProgress };
}

function truncateTitle(t: string): string {
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

// ===================== 入参与出参 =====================

export interface ProcessOptions {
  /** 默认 20，最大 50（防止意外烧 token） */
  limit?: number;
  /** 指定模型 ID，默认走系统默认（deepseek/deepseek-v3.2） */
  modelId?: string;
  /**
   * 选 HotSpot 的范围
   * - "unprocessed"：score = 0（默认）
   * - "all"：所有 active，最近更新的优先（会重跑已处理的）
   * - 数组：指定 HotSpot ID 列表
   */
  scope?: "unprocessed" | "all" | string[];
  /** 时间窗：只处理这段时间内 updatedAt 的（小时；仅 unprocessed/all 生效） */
  windowHours?: number;
}

export interface ProcessItemResult {
  hotSpotId: string;
  title: string;
  status: "success" | "failed";
  durationMs: number;
  enriched?: AiEnrichedFields;
  errorMsg?: string;
}

export interface ProcessSummary {
  startedAt: Date;
  finishedAt: Date;
  totalDurationMs: number;
  scanned: number;
  succeeded: number;
  failed: number;
  modelId: string;
  results: ProcessItemResult[];
}

// ===================== 主流程 =====================

export async function processBatch(
  options: ProcessOptions = {},
): Promise<ProcessSummary> {
  const startedAt = new Date();
  const tStart = Date.now();
  const limit = Math.min(50, Math.max(1, options.limit ?? 20));
  const scope = options.scope ?? "unprocessed";
  const windowHours = options.windowHours ?? 48;

  const sinceDate = new Date(Date.now() - windowHours * 3_600_000);

  // === 1) 选取待处理 HotSpot ===
  const hotSpots = await selectHotSpots(scope, sinceDate, limit);

  const results: ProcessItemResult[] = [];
  let succeeded = 0;
  let failed = 0;

  // 初始化进度快照（前端 polling /api/process/status 时能读到）
  currentProgress = {
    running: true,
    scanned: 0,
    succeeded: 0,
    failed: 0,
    total: hotSpots.length,
    currentTitle: null,
    startedAt: startedAt.toISOString(),
    finishedAt: null,
    modelId: options.modelId ?? "default",
  };

  // === 2) 逐条串行处理 ===
  for (const h of hotSpots) {
    const itemStart = Date.now();
    // 更新"当前正在处理"（用于前端展示）
    currentProgress = {
      ...currentProgress,
      currentTitle: truncateTitle(h.title),
    };
    try {
      const enriched = await processOne(h, options.modelId);

      await db.hotSpot.update({
        where: { id: h.id },
        data: {
          category: enriched.category,
          tags: JSON.stringify(enriched.tags),
          summary: enriched.summary,
          score: enriched.score,
          trendVelocity: enriched.trendVelocity,
          keyPoints: JSON.stringify(enriched.keyPoints),
          entities: JSON.stringify(enriched.entities),
          processedAt: new Date(),
        },
      });

      results.push({
        hotSpotId: h.id,
        title: h.title,
        status: "success",
        durationMs: Date.now() - itemStart,
        enriched,
      });
      succeeded += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        hotSpotId: h.id,
        title: h.title,
        status: "failed",
        durationMs: Date.now() - itemStart,
        errorMsg: msg,
      });
      failed += 1;
      console.error(`[ai-pipeline] ${h.id} 处理失败:`, msg);
    }
    // 单条结束 → 更新进度
    currentProgress = {
      ...currentProgress,
      scanned: succeeded + failed,
      succeeded,
      failed,
    };
  }

  // 结束态
  currentProgress = {
    ...currentProgress,
    running: false,
    currentTitle: null,
    finishedAt: new Date().toISOString(),
  };

  return {
    startedAt,
    finishedAt: new Date(),
    totalDurationMs: Date.now() - tStart,
    scanned: hotSpots.length,
    succeeded,
    failed,
    modelId: options.modelId ?? "default",
    results,
  };
}

// ===================== 内部 =====================

type HotSpotWithSources = Awaited<
  ReturnType<typeof selectHotSpots>
>[number];

async function selectHotSpots(
  scope: ProcessOptions["scope"],
  sinceDate: Date,
  limit: number,
) {
  if (Array.isArray(scope)) {
    return db.hotSpot.findMany({
      where: { id: { in: scope } },
      include: { sources: true },
      take: limit,
    });
  }

  const baseWhere = { status: "active" as const };

  if (scope === "all") {
    return db.hotSpot.findMany({
      where: { ...baseWhere, updatedAt: { gte: sinceDate } },
      orderBy: [{ engagementScore: "desc" }, { updatedAt: "desc" }],
      include: { sources: true },
      take: limit,
    });
  }

  return db.hotSpot.findMany({
    where: {
      ...baseWhere,
      score: 0,
      updatedAt: { gte: sinceDate },
    },
    orderBy: [{ engagementScore: "desc" }, { updatedAt: "desc" }],
    include: { sources: true },
    take: limit,
  });
}

/**
 * 对单个 HotSpot 跑 classify → summarize → score 三链
 */
async function processOne(
  h: HotSpotWithSources,
  modelId?: string,
): Promise<AiEnrichedFields> {
  const platforms = unique(h.sources.map((s) => s.platform));
  const sourceTitles = h.sources.map((s) => ({
    platform: s.platform,
    rawTitle: s.rawTitle,
  }));
  const sourceExcerpts = collectSourceExcerpts(
    h.sources.map((s) => ({
      platform: s.platform,
      rawTitle: s.rawTitle,
      metric: s.metric,
    })),
  );

  const classifyResult = await runPipelineStep("classify", () =>
    classify({ title: h.title, platforms }, modelId),
  );

  const summaryResult = await runPipelineStep("summarize", () =>
    summarize(
      {
        title: h.title,
        category: classifyResult.category,
        sourceTitles,
        sourceExcerpts,
      },
      modelId,
    ),
  );

  const ageHours = Math.max(
    0,
    (Date.now() - h.firstSeenAt.getTime()) / 3_600_000,
  );
  const scoreResult = await runPipelineStep("score", () =>
    scoreItem(
      {
        title: h.title,
        summary: summaryResult.summary,
        category: classifyResult.category,
        metrics: h.sources.map((s) => ({
          platform: s.platform,
          display: formatMetricForAI(s.platform, parseMetric(s.metric)),
        })),
        ageHours,
        engagementHint: h.engagementScore,
      },
      modelId,
    ),
  );

  return {
    category: classifyResult.category as Category,
    tags: classifyResult.tags,
    summary: summaryResult.summary,
    keyPoints: summaryResult.keyPoints,
    entities: summaryResult.entities,
    score: scoreResult.score,
    trendVelocity: scoreResult.trendVelocity,
  };
}

// ===================== 工具 =====================

async function runPipelineStep<T>(
  step: PipelineStepName,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new PipelineStepError(step, detail);
  }
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function parseMetric(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** 把各平台 metric 渲染成易读字符串，喂给 AI（避免 LLM 处理 JSON 翻车） */
function formatMetricForAI(
  platform: string,
  m: Record<string, unknown>,
): string {
  const n = (v: unknown) => {
    const num = Number(v);
    return Number.isFinite(num) && num > 0 ? num : 0;
  };
  const fmt = (x: number) =>
    x >= 10000 ? `${(x / 10000).toFixed(1)}万` : x.toLocaleString();

  switch (platform) {
    case "weibo":
      return n(m.heat) ? `热度 ${fmt(n(m.heat))}` : "无互动数据";
    case "zhihu":
      return n(m.heat) ? `热度 ${fmt(n(m.heat))}` : "无互动数据";
    case "bilibili": {
      const views = n(m.views) || n(m.plays);
      return views ? `播放 ${fmt(views)}` : "无互动数据";
    }
    case "github":
      return n(m.todayStars)
        ? `今日 +${n(m.todayStars)} ★（总 ${n(m.stars)}）`
        : n(m.stars)
          ? `★ ${n(m.stars)}`
          : "无互动数据";
    case "twitter":
      return `♥ ${fmt(n(m.likes))} · 转 ${fmt(n(m.retweets))}`;
    case "hackernews":
      return `▲ ${n(m.score)} 分 · ${n(m.comments)} 评论`;
    case "reddit":
      return `↑ ${n(m.upvotes) || n(m.score)} · ${n(m.comments)} 评论`;
    case "googlenews":
    case "infoq":
      return n(m.rank) ? `排名 #${n(m.rank)}` : "RSS 排名靠前";
    default:
      return "无标准化互动数据";
  }
}

/** 给前端展示用：把 enrichedFields 算回兜底分对照（便于报告中查看 AI 是否调整了分数） */
export function compareWithEngagement(
  platform: string,
  metric: Record<string, unknown>,
  fetchedAt: Date,
): number {
  return calcEngagementScore(platform, metric, fetchedAt);
}
