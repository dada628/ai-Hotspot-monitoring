/**
 * GET /api/hotspots/[id]
 *
 * 返回单条热点的完整信息（供详情页使用）：
 *  - HotSpot 全部字段（含 summary/category/tags/score/trendVelocity/keyPoints/entities/processedAt）
 *  - 所有 sources（含 metric/rawTitle/fetchedAt，用于多源对比）
 *
 * 不存在或 status='archived' → 404
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;

  const h = await db.hotSpot.findUnique({
    where: { id },
    include: {
      sources: {
        orderBy: { fetchedAt: "desc" },
      },
    },
  });

  if (!h || h.status !== "active") {
    return NextResponse.json({ error: "HotSpot 不存在或已归档" }, { status: 404 });
  }

  return NextResponse.json({
    id: h.id,
    title: h.title,
    summary: h.summary,
    category: h.category,
    tags: h.tags,
    score: h.score,
    engagementScore: h.engagementScore,
    trendVelocity: h.trendVelocity,
    keyPoints: h.keyPoints,
    entities: h.entities,
    processedAt: h.processedAt?.toISOString() ?? null,
    publishedAt: h.publishedAt?.toISOString() ?? null,
    firstSeenAt: h.firstSeenAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    sources: h.sources.map((s) => ({
      id: s.id,
      platform: s.platform,
      url: s.url,
      rawTitle: s.rawTitle,
      metric: s.metric,
      publishedAt: s.publishedAt?.toISOString() ?? null,
      fetchedAt: s.fetchedAt.toISOString(),
    })),
  });
}
