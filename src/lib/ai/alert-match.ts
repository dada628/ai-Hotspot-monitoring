/**
 * 预警匹配引擎
 *
 * 触发时机：AI Pipeline 处理完成后，对刚刚更新过的 HotSpot 列表跑一遍订阅匹配
 *
 * 匹配规则（全部满足才命中）：
 *  1. subscription.enabled = true
 *  2. score >= subscription.minScore（默认 70）
 *  3. 若 platforms 不为空：HotSpot 至少有一个 source 在列表中
 *  4. 若 categories 不为空：HotSpot.category 必须在列表中
 *  5. 若 keyword 不为空：HotSpot.title 或 summary 包含关键词（大小写不敏感）
 *
 * 命中后：upsert Alert（由 @@unique([userId, hotSpotId]) 防重复）
 */

import { db } from "@/lib/db";

export interface AlertMatchSummary {
  scannedHotSpots: number;
  activeSubscriptions: number;
  alertsCreated: number;
  alertsSkipped: number;
  durationMs: number;
}

export async function runAlertMatch(
  hotSpotIds: string[],
): Promise<AlertMatchSummary> {
  const tStart = Date.now();

  if (hotSpotIds.length === 0) {
    return {
      scannedHotSpots: 0,
      activeSubscriptions: 0,
      alertsCreated: 0,
      alertsSkipped: 0,
      durationMs: 0,
    };
  }

  const [hotSpots, subscriptions] = await Promise.all([
    db.hotSpot.findMany({
      where: { id: { in: hotSpotIds }, status: "active" },
      include: { sources: { select: { platform: true } } },
    }),
    db.subscription.findMany({ where: { enabled: true } }),
  ]);

  let created = 0;
  let skipped = 0;

  for (const h of hotSpots) {
    const hSourcePlatforms = new Set(h.sources.map((s) => s.platform));
    const titleLower = h.title.toLowerCase();
    const summaryLower = (h.summary ?? "").toLowerCase();

    for (const sub of subscriptions) {
      if (!matchesSubscription(sub, {
        score: h.score,
        category: h.category,
        sourcePlatforms: hSourcePlatforms,
        titleLower,
        summaryLower,
      })) {
        continue;
      }

      // 命中 → 尝试创建 Alert（unique 约束防重）
      try {
        await db.alert.create({
          data: { userId: sub.userId, hotSpotId: h.id },
        });
        created += 1;
      } catch (err) {
        // unique violation = 该用户对该 HotSpot 已有 Alert（正常情况）
        const msg = err instanceof Error ? err.message : String(err);
        if (
          msg.includes("Unique constraint") ||
          msg.includes("UNIQUE constraint")
        ) {
          skipped += 1;
        } else {
          console.error(
            `[alert-match] 写入 Alert 失败 user=${sub.userId} hotspot=${h.id}:`,
            msg,
          );
        }
      }
    }
  }

  return {
    scannedHotSpots: hotSpots.length,
    activeSubscriptions: subscriptions.length,
    alertsCreated: created,
    alertsSkipped: skipped,
    durationMs: Date.now() - tStart,
  };
}

// ===================== 内部 =====================

interface MatchableHotSpot {
  score: number;
  category: string | null;
  sourcePlatforms: Set<string>;
  titleLower: string;
  summaryLower: string;
}

interface MatchableSubscription {
  keyword: string | null;
  platforms: string;
  categories: string;
  minScore: number;
}

function matchesSubscription(
  sub: MatchableSubscription,
  h: MatchableHotSpot,
): boolean {
  // 评分阈值
  if (h.score < sub.minScore) return false;

  // 平台白名单
  const subPlatforms = parseJsonArray(sub.platforms);
  if (subPlatforms.length > 0) {
    const hit = subPlatforms.some((p) => h.sourcePlatforms.has(p));
    if (!hit) return false;
  }

  // 分类白名单
  const subCategories = parseJsonArray(sub.categories);
  if (subCategories.length > 0) {
    if (!h.category || !subCategories.includes(h.category)) return false;
  }

  // 关键词匹配（title 或 summary 包含）
  if (sub.keyword && sub.keyword.trim()) {
    const kw = sub.keyword.toLowerCase().trim();
    const matched =
      h.titleLower.includes(kw) || h.summaryLower.includes(kw);
    if (!matched) return false;
  }

  return true;
}

function parseJsonArray(raw: string): string[] {
  try {
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
