/**
 * 抓取后的持久化逻辑
 *
 * Phase 2 简化版：
 *   - 每个 RawHotItem 一一映射为 HotSpot + HotSpotSource
 *   - 通过 (platform, url) 唯一约束去重；已存在的更新 metric/fetchedAt
 *   - 不做跨平台去重 / 分类 / 评分（这是 Phase 3 AI 的工作）
 *
 * Phase 3 AI Pipeline 会重新整理这些 HotSpot：合并、打分、写 summary
 */
import { db } from "@/lib/db";
import { runAll, type Platform, type ScrapeResult } from "@/lib/scrapers";
import { calcEngagementScore } from "@/lib/score";
import { extractPublishedAt } from "@/lib/published-at";

export interface IngestSummary {
  startedAt: Date;
  finishedAt: Date;
  totalDurationMs: number;
  results: Array<{
    platform: Platform;
    status: "success" | "failed" | "partial";
    itemsFetched: number;
    inserted: number;
    updated: number;
    durationMs: number;
    errorMsg?: string;
  }>;
}

async function persistResult(r: ScrapeResult) {
  let inserted = 0;
  let updated = 0;

  for (const item of r.items) {
    const metric = item.metric ?? {};
    const metricStr = JSON.stringify(metric);
    const engagement = calcEngagementScore(
      item.platform,
      metric,
      item.fetchedAt,
    );
    const publishedAt = extractPublishedAt(item.platform, metric);

    const existing = await db.hotSpotSource.findUnique({
      where: {
        platform_url: { platform: item.platform, url: item.url },
      },
      select: { id: true, hotSpotId: true },
    });

    if (existing) {
      await db.hotSpotSource.update({
        where: { id: existing.id },
        data: {
          metric: metricStr,
          rawTitle: item.title,
          fetchedAt: item.fetchedAt,
          publishedAt,
        },
      });
      // 重新计算该 HotSpot 的 engagementScore（取所有 source 的最高分）
      // 同时取所有 source 里最早的 publishedAt 作为 HotSpot.publishedAt
      const allSources = await db.hotSpotSource.findMany({
        where: { hotSpotId: existing.hotSpotId },
        select: {
          platform: true,
          metric: true,
          fetchedAt: true,
          publishedAt: true,
        },
      });
      let maxScore = 0;
      let earliestPublished: Date | null = null;
      for (const s of allSources) {
        let m: Record<string, unknown> = {};
        try {
          m = JSON.parse(s.metric || "{}");
        } catch {
          m = {};
        }
        const sc = calcEngagementScore(s.platform, m, s.fetchedAt);
        if (sc > maxScore) maxScore = sc;
        if (
          s.publishedAt &&
          (!earliestPublished ||
            s.publishedAt.getTime() < earliestPublished.getTime())
        ) {
          earliestPublished = s.publishedAt;
        }
      }
      await db.hotSpot.update({
        where: { id: existing.hotSpotId },
        data: {
          updatedAt: new Date(),
          engagementScore: maxScore,
          publishedAt: earliestPublished,
        },
      });
      updated += 1;
    } else {
      await db.hotSpot.create({
        data: {
          title: item.title,
          engagementScore: engagement,
          publishedAt,
          sources: {
            create: {
              platform: item.platform,
              url: item.url,
              rawTitle: item.title,
              metric: metricStr,
              fetchedAt: item.fetchedAt,
              publishedAt,
            },
          },
        },
      });
      inserted += 1;
    }
  }

  // 写一条 IngestLog
  await db.ingestLog.create({
    data: {
      platform: r.platform,
      status: r.status,
      itemsCount: r.items.length,
      durationMs: r.durationMs,
      errorMsg: r.errorMsg ?? null,
    },
  });

  return { inserted, updated };
}

/**
 * 执行完整的"抓取 → 入库"流程
 */
export async function runIngest(
  platforms?: Platform[],
): Promise<IngestSummary> {
  const startedAt = new Date();
  const tStart = Date.now();
  const scrapeResults = await runAll(platforms);

  const results: IngestSummary["results"] = [];
  for (const r of scrapeResults) {
    if (r.items.length > 0) {
      const { inserted, updated } = await persistResult(r);
      results.push({
        platform: r.platform,
        status: r.status,
        itemsFetched: r.items.length,
        inserted,
        updated,
        durationMs: r.durationMs,
        errorMsg: r.errorMsg,
      });
    } else {
      // 失败但也要写日志
      await db.ingestLog.create({
        data: {
          platform: r.platform,
          status: r.status,
          itemsCount: 0,
          durationMs: r.durationMs,
          errorMsg: r.errorMsg ?? null,
        },
      });
      results.push({
        platform: r.platform,
        status: r.status,
        itemsFetched: 0,
        inserted: 0,
        updated: 0,
        durationMs: r.durationMs,
        errorMsg: r.errorMsg,
      });
    }
  }

  return {
    startedAt,
    finishedAt: new Date(),
    totalDurationMs: Date.now() - tStart,
    results,
  };
}
