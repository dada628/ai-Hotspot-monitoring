/**
 * GET /api/hotspots
 *
 * 主信息流接口（含筛选 + 排序）
 *
 * Query 参数：
 *  - platform: 平台过滤（all/weibo/zhihu/bilibili/github/twitter/hackernews）
 *  - severity: critical/high/medium/low/all
 *  - q: 关键词搜索（标题/摘要）
 *  - sort: newest_seen | newest_updated | importance | relevance | hotness
 *  - limit: 默认 30，最大 100
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

export async function GET(req: Request) {
  const url = new URL(req.url);

  const platform = url.searchParams.get("platform") ?? "all";
  const severity = url.searchParams.get("severity") ?? "all";
  const q = url.searchParams.get("q")?.trim() ?? "";
  const sortRaw = url.searchParams.get("sort") ?? "hotness";
  const sort = (VALID_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as SortKey)
    : "hotness";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 30));

  const where: Prisma.HotSpotWhereInput = { status: "active" };

  if (q) {
    where.OR = [
      { title: { contains: q } },
      { summary: { contains: q } },
    ];
  }

  if (platform !== "all") {
    where.sources = { some: { platform } };
  }

  if (severity !== "all") {
    // 没有 AI 之前根据 score 区间映射严重等级
    if (severity === "critical") where.score = { gte: 85 };
    else if (severity === "high") where.score = { gte: 70, lt: 85 };
    else if (severity === "medium") where.score = { gte: 40, lt: 70 };
    else if (severity === "low") where.score = { lt: 40 };
  }

  // 热度类排序：score 优先，engagementScore 兜底（score=0 时退化到本地评分）
  const orderBy: Prisma.HotSpotOrderByWithRelationInput[] =
    sort === "newest_seen"
      ? [{ firstSeenAt: "desc" }]
      : sort === "newest_updated"
        ? [{ updatedAt: "desc" }]
        : sort === "importance" || sort === "hotness" || sort === "relevance"
          ? [{ score: "desc" }, { engagementScore: "desc" }, { updatedAt: "desc" }]
          : [{ updatedAt: "desc" }];

  const items = await db.hotSpot.findMany({
    where,
    orderBy,
    take: limit,
    include: {
      sources: {
        select: {
          platform: true,
          url: true,
          metric: true,
          rawTitle: true,
        },
      },
    },
  });

  const totalCount = await db.hotSpot.count({ where });

  return NextResponse.json({
    items: items.map((h) => ({
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
    })),
    total: totalCount,
  });
}
