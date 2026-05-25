/**
 * 一次性脚本：为已有 HotSpot 回填 engagementScore
 *
 * 用法：npx tsx scripts/backfill-engagement-score.ts
 *
 * 安全性：
 *   - 只更新 engagementScore，不动 score / summary / category
 *   - 公式调整后可重跑
 */
import { db } from "../src/lib/db";
import { calcEngagementScore } from "../src/lib/score";

async function main() {
  const t0 = Date.now();
  const hotspots = await db.hotSpot.findMany({
    select: {
      id: true,
      engagementScore: true,
      sources: {
        select: { platform: true, metric: true, fetchedAt: true },
      },
    },
  });

  console.log(`Found ${hotspots.length} HotSpot to backfill`);

  let updated = 0;
  let unchanged = 0;
  const distribution = { "0": 0, "1-30": 0, "31-50": 0, "51-70": 0, "71+": 0 };

  for (const h of hotspots) {
    let maxScore = 0;
    for (const s of h.sources) {
      let m: Record<string, unknown> = {};
      try {
        m = JSON.parse(s.metric || "{}");
      } catch {
        m = {};
      }
      const sc = calcEngagementScore(s.platform, m, s.fetchedAt);
      if (sc > maxScore) maxScore = sc;
    }

    if (maxScore === 0) distribution["0"]++;
    else if (maxScore <= 30) distribution["1-30"]++;
    else if (maxScore <= 50) distribution["31-50"]++;
    else if (maxScore <= 70) distribution["51-70"]++;
    else distribution["71+"]++;

    if (Math.abs(h.engagementScore - maxScore) > 0.1) {
      await db.hotSpot.update({
        where: { id: h.id },
        data: { engagementScore: maxScore },
      });
      updated++;
    } else {
      unchanged++;
    }
  }

  console.log(`Updated: ${updated}, Unchanged: ${unchanged}`);
  console.log("Distribution:", distribution);
  console.log(`Elapsed: ${Date.now() - t0}ms`);

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
