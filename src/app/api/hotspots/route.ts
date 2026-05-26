/**
 * GET /api/hotspots
 *
 * 主信息流接口（含筛选 + 排序）
 *
 * Query 参数：
 *  - platform: all | weibo | zhihu | bilibili | github | twitter | hackernews | reddit | googlenews | infoq
 *  - severity: all | critical | high | medium | low
 *  - q:        关键词（title/summary contains）
 *  - sort:     hotness | newest_seen | newest_updated | importance | relevance
 *  - time:     all | 1h | 6h | 24h | 7d
 *  - cred:     all | trusted | neutral   （v5 本期仅接收参数，不实际过滤，等 B-1 平台分层落地后启用）
 *  - limit:    默认 30，最大 100
 *
 * 排序语义（v5 修正：5 种排序真正差异化）：
 *  - newest_seen     : firstSeenAt desc          —— 最早入库的优先级
 *  - newest_updated  : updatedAt desc            —— 最近被 ingest 更新的优先
 *  - importance      : [score desc, engagementScore desc, updatedAt desc]
 *                      AI 处理过的优先；未 AI 处理的回退到本地兜底分（按用户选定 fallback 语义）
 *  - hotness         : 内存复合分 = effectiveScore×0.7 + log10(sourceCount+1)×20×0.15 + (trendVelocity ?? 0)×5×0.15
 *                      跨源多 + 爆发快的会冒头，与 importance 形成明显差异
 *  - relevance       : 必须配合 q 使用；按 title/summary/tag 命中加权排序
 *                      title 命中 +3，tag 命中 +2，summary 命中 +1；若 q 为空则降级为 hotness
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_SORTS = [
  "newest_seen",
  "newest_updated",
  "importance",
  "relevance",
  "hotness",
] as const;
type SortKey = (typeof VALID_SORTS)[number];

const VALID_TIME = ["all", "1h", "6h", "24h", "7d"] as const;
type TimeKey = (typeof VALID_TIME)[number];

const VALID_CRED = ["all", "trusted", "neutral"] as const;
type CredKey = (typeof VALID_CRED)[number];

const TIME_WINDOW_MS: Record<Exclude<TimeKey, "all">, number> = {
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": 7 * 24 * 3_600_000,
};

export async function GET(req: Request) {
  const url = new URL(req.url);

  const platform = url.searchParams.get("platform") ?? "all";
  const severity = url.searchParams.get("severity") ?? "all";
  const q = url.searchParams.get("q")?.trim() ?? "";

  const sortRaw = url.searchParams.get("sort") ?? "hotness";
  let sort: SortKey = (VALID_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortKey)
    : "hotness";

  const timeRaw = url.searchParams.get("time") ?? "all";
  const time: TimeKey = (VALID_TIME as readonly string[]).includes(timeRaw)
    ? (timeRaw as TimeKey)
    : "all";

  const credRaw = url.searchParams.get("cred") ?? "all";
  // 本期仅接收参数（B-1 平台可靠性分层后启用）
  const _cred: CredKey = (VALID_CRED as readonly string[]).includes(credRaw)
    ? (credRaw as CredKey)
    : "all";
  void _cred;

  const limit = Math.min(
    100,
    Math.max(1, Number(url.searchParams.get("limit")) || 30),
  );

  // ====================== where 构造 ======================
  const where: Prisma.HotSpotWhereInput = { status: "active" };

  if (q) {
    where.OR = [{ title: { contains: q } }, { summary: { contains: q } }];
  }

  if (platform !== "all") {
    where.sources = { some: { platform } };
  }

  if (severity !== "all") {
    if (severity === "critical") where.score = { gte: 85 };
    else if (severity === "high") where.score = { gte: 70, lt: 85 };
    else if (severity === "medium") where.score = { gte: 40, lt: 70 };
    else if (severity === "low") where.score = { lt: 40 };
  }

  if (time !== "all") {
    const since = new Date(Date.now() - TIME_WINDOW_MS[time]);
    where.firstSeenAt = { gte: since };
  }

  // ====================== 相关性兜底：无 q 时降级 ======================
  if (sort === "relevance" && !q) {
    sort = "hotness";
  }

  // ====================== 排序分发 ======================
  if (sort === "newest_seen" || sort === "newest_updated" || sort === "importance") {
    // 这三种可直接用 Prisma orderBy 完成
    const orderBy: Prisma.HotSpotOrderByWithRelationInput[] =
      sort === "newest_seen"
        ? [{ firstSeenAt: "desc" }]
        : sort === "newest_updated"
          ? [{ updatedAt: "desc" }]
          : [
              { score: "desc" },
              { engagementScore: "desc" },
              { updatedAt: "desc" },
            ];

    const items = await db.hotSpot.findMany({
      where,
      orderBy,
      take: limit,
      include: {
        sources: {
          select: { platform: true, url: true, metric: true, rawTitle: true },
        },
      },
    });
    const totalCount = await db.hotSpot.count({ where });
    return NextResponse.json({
      items: items.map(serializeItem),
      total: totalCount,
    });
  }

  // ====================== hotness / relevance：内存复合排序 ======================
  // 拉一个候选池（最多 200），保证排序公式可发挥差异
  const POOL_LIMIT = Math.min(200, Math.max(limit * 4, 60));

  // 候选池预排序：保留"有 AI 分的优先在前"——避免 hotness 退化时全靠 engagement 抓不到 AI 高分
  const candidates = await db.hotSpot.findMany({
    where,
    orderBy: [
      { score: "desc" },
      { engagementScore: "desc" },
      { updatedAt: "desc" },
    ],
    take: POOL_LIMIT,
    include: {
      sources: {
        select: { platform: true, url: true, metric: true, rawTitle: true },
      },
    },
  });

  const totalCount = await db.hotSpot.count({ where });

  const scored = candidates.map((h) => {
    const effective = h.score > 0 ? h.score : h.engagementScore;
    const sourceCount = h.sources.length;
    let rank = 0;
    if (sort === "hotness") {
      // 综合 = 70% effective + 15% 跨源对数 + 15% 爆发速度
      const velocityBonus = (h.trendVelocity ?? 0) * 5; // velocity 单位"分/小时"，×5 拉到 0-25 量级
      const breadthBonus = Math.log10(sourceCount + 1) * 20; // 1 源 ~ 6 分，4 源 ~ 14 分
      rank =
        effective * 0.7 + breadthBonus * 0.15 + velocityBonus * 0.15;
    } else {
      // relevance：title 命中 +3，tag 命中 +2，summary 命中 +1
      const needle = q.toLowerCase();
      const title = h.title.toLowerCase();
      const summary = (h.summary ?? "").toLowerCase();
      let tags: string[] = [];
      try {
        const parsed = JSON.parse(h.tags || "[]");
        if (Array.isArray(parsed)) tags = parsed.map((t) => String(t).toLowerCase());
      } catch {
        // ignore
      }
      let hits = 0;
      if (title.includes(needle)) hits += 3;
      if (tags.some((t) => t.includes(needle))) hits += 2;
      if (summary.includes(needle)) hits += 1;
      // 命中相同时按 effectiveScore 二级排序，让"既相关又热"的浮上来
      rank = hits * 100 + effective; // hits ∈ [0,6]，effective ∈ [0,100]，hits 主导
    }
    return { h, rank, effective, sourceCount };
  });

  scored.sort((a, b) => {
    if (b.rank !== a.rank) return b.rank - a.rank;
    // 二级：effectiveScore desc；三级：sources 数 desc
    if (b.effective !== a.effective) return b.effective - a.effective;
    if (b.sourceCount !== a.sourceCount) return b.sourceCount - a.sourceCount;
    return b.h.updatedAt.getTime() - a.h.updatedAt.getTime();
  });

  const items = scored.slice(0, limit).map(({ h }) => serializeItem(h));

  return NextResponse.json({
    items,
    total: totalCount,
  });
}

// ====================== 工具 ======================

type HotSpotWithSources = Prisma.HotSpotGetPayload<{
  include: {
    sources: {
      select: { platform: true; url: true; metric: true; rawTitle: true };
    };
  };
}>;

function serializeItem(h: HotSpotWithSources) {
  return {
    id: h.id,
    title: h.title,
    summary: h.summary,
    score: h.score,
    engagementScore: h.engagementScore,
    category: h.category,
    tags: h.tags,
    firstSeenAt: h.firstSeenAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    sources: h.sources.map((s) => ({
      platform: s.platform,
      url: s.url,
      metric: s.metric,
      rawTitle: s.rawTitle,
    })),
  };
}
