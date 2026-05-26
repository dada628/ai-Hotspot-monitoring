/**
 * GET /api/admin/stats
 *
 * 返回管理面板需要的简要统计：
 *  - 各平台 source 数量
 *  - 总热点数 / 今日新增 / 紧急热点 / 监控词
 *  - 近 24h 新热点数 + 已 AI 处理数（v6 新增，用于"AI 处理覆盖率"卡）
 *  - 最新 8 条 IngestLog
 *  - 最近 20 条 HotSpot（按 updatedAt 倒序）
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 24h 窗口（与首页"AI 处理覆盖率"卡分母对齐 —— 用户选定 last_24h）
  const last24h = new Date(now.getTime() - 24 * 3_600_000);

  const [
    platformCounts,
    recentLogs,
    recentHotspots,
    totalHotSpots,
    todayNew,
    urgentCount,
    keywordsCount,
    total24h,
    processed24h,
  ] = await Promise.all([
    db.hotSpotSource.groupBy({
      by: ["platform"],
      _count: { _all: true },
    }),
    db.ingestLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    db.hotSpot.findMany({
      orderBy: { updatedAt: "desc" },
      take: 20,
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
    }),
    db.hotSpot.count(),
    db.hotSpot.count({ where: { firstSeenAt: { gte: todayStart } } }),
    // 紧急热点 = score >= 85 （AI 接入后会被填充；目前为占位逻辑）
    db.hotSpot.count({ where: { score: { gte: 85 } } }),
    db.subscription.count({ where: { enabled: true } }),
    // 近 24h 新增 active HotSpot 数（分母）
    db.hotSpot.count({
      where: {
        status: "active",
        firstSeenAt: { gte: last24h },
      },
    }),
    // 近 24h 新增且已 AI 处理的（分子；processedAt 不为空即视为已处理）
    db.hotSpot.count({
      where: {
        status: "active",
        firstSeenAt: { gte: last24h },
        processedAt: { not: null },
      },
    }),
  ]);

  return NextResponse.json({
    platformCounts: platformCounts.map((p) => ({
      platform: p.platform,
      count: p._count._all,
    })),
    recentLogs,
    recentHotspots: recentHotspots.map((h) => ({
      id: h.id,
      title: h.title,
      summary: h.summary,
      score: h.score,
      category: h.category,
      tags: h.tags,
      updatedAt: h.updatedAt.toISOString(),
      sources: h.sources.map((s) => ({
        platform: s.platform,
        url: s.url,
        metric: s.metric,
        rawTitle: s.rawTitle,
      })),
    })),
    totalHotSpots,
    todayNew,
    urgentCount,
    keywordsCount,
    aiCoverage24h: {
      total: total24h,
      processed: processed24h,
      rate: total24h > 0 ? processed24h / total24h : 0,
    },
  });
}
