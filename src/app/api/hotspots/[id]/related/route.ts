/**
 * GET /api/hotspots/[id]/related?limit=6
 *
 * 推荐与目标热点相关的其他 HotSpot
 *
 * 评分公式（0-1）：
 *   tagOverlap   * 0.50  — tag 重合比例（交集 / 较小集合长度）
 *   categoryMatch* 0.30  — 同 category +1（否则 0）
 *   recency      * 0.15  — 24h 内 = 1，7d 内线性衰减到 0.2
 *   scoreBonus   * 0.05  — score≥70 或 engagementScore≥70 加 0.05
 *
 * 实现：
 *  - 候选集 = 过去 7 天内 active HotSpot（排除自己），按 updatedAt desc 取 200 条
 *  - 内存评分 + 排序 + 取 limit 条（默认 6）
 *  - relScore < 0.05 视为不相关，丢弃
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const CANDIDATE_WINDOW_DAYS = 7;
const CANDIDATE_LIMIT = 200;
const MIN_REL_SCORE = 0.05;

export async function GET(req: Request, ctx: RouteContext) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(
    12,
    Math.max(1, Number(url.searchParams.get("limit")) || 6),
  );

  const main = await db.hotSpot.findUnique({ where: { id } });
  if (!main || main.status !== "active") {
    return NextResponse.json(
      { error: "主热点不存在或已归档" },
      { status: 404 },
    );
  }

  const mainTags = parseTags(main.tags);
  const sinceDate = new Date(
    Date.now() - CANDIDATE_WINDOW_DAYS * 24 * 3_600_000,
  );

  const candidates = await db.hotSpot.findMany({
    where: {
      status: "active",
      id: { not: id },
      updatedAt: { gte: sinceDate },
    },
    orderBy: { updatedAt: "desc" },
    take: CANDIDATE_LIMIT,
    include: {
      sources: { select: { platform: true } },
    },
  });

  // 内存评分
  const scored = candidates.map((c) => {
    const cTags = parseTags(c.tags);
    const intersection = mainTags.filter((t) =>
      cTags.includes(t),
    ).length;

    const minLen = Math.min(mainTags.length, cTags.length);
    const tagOverlap = minLen > 0 ? intersection / minLen : 0;

    const categoryMatch =
      main.category && c.category && main.category === c.category ? 1 : 0;

    const ageH = (Date.now() - c.updatedAt.getTime()) / 3_600_000;
    const recency =
      ageH <= 24
        ? 1
        : Math.max(0.2, 1 - (ageH - 24) / (CANDIDATE_WINDOW_DAYS * 24 - 24));

    const effectiveScore = c.score > 0 ? c.score : c.engagementScore;
    const scoreBonus = effectiveScore >= 70 ? 1 : 0;

    const relScore =
      tagOverlap * 0.5 +
      categoryMatch * 0.3 +
      recency * 0.15 +
      scoreBonus * 0.05;

    return { c, relScore, tagOverlap, categoryMatch, sharedTags: intersection };
  });

  scored.sort((a, b) => b.relScore - a.relScore);
  const top = scored
    .filter((s) => s.relScore >= MIN_REL_SCORE)
    .slice(0, limit);

  return NextResponse.json({
    main: {
      id: main.id,
      title: main.title,
      category: main.category,
    },
    items: top.map((s) => ({
      id: s.c.id,
      title: s.c.title,
      category: s.c.category,
      tags: s.c.tags,
      score: s.c.score,
      engagementScore: s.c.engagementScore,
      updatedAt: s.c.updatedAt.toISOString(),
      sources: s.c.sources.map((x) => ({ platform: x.platform })),
      // 相关度调试信息（可选展示）
      relevance: Number(s.relScore.toFixed(3)),
      sharedTags: s.sharedTags,
      categoryMatch: !!s.categoryMatch,
    })),
    candidatesScanned: candidates.length,
    windowDays: CANDIDATE_WINDOW_DAYS,
  });
}

function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
