/**
 * 一次性脚本：清理历史非科技 HotSpot
 *
 * 背景：
 *   2026-05-26 加入 tech-filter 后，新抓的数据已经被源头过滤。
 *   但 DB 里仍有大量历史数据（weibo/zhihu/bilibili/googlenews 的 v4 society/finance 路）
 *   是非科技话题。本脚本一次性清理。
 *
 * 用法：
 *   npx tsx scripts/cleanup-non-tech.ts          # dry-run，只打印不删除
 *   npx tsx scripts/cleanup-non-tech.ts --apply  # 实际删除
 *
 * 判定规则：
 *   一条 HotSpot 被判为"非科技"且应删除，当且仅当：
 *     1. 标题、summary、source.rawTitle 都不命中 isTechRelated 关键词
 *     且
 *     2. sources 中没有任何"信任平台"
 *
 * 信任平台（不参与清理判定）：
 *   - github      : 全是开发项目，100% 科技
 *   - infoq       : 专业技术媒体，100% 科技
 *   - reddit      : 仅限 r/LocalLLaMA + r/MachineLearning，100% AI
 *   - hackernews  : ~85-95% 科技；HN topstories 历史里偶有政经/科普内容，但
 *                   关键词表对工程英文术语覆盖不足（如 C compiler / bytecode
 *                   / encryption / Codex / Grok），强删风险大 → 信任
 *   - twitter     : 我们的查询已限定 AI 关键词 + min_faves 门槛，~95% 科技
 *
 * 实际清理对象：weibo / zhihu / bilibili / googlenews 这 4 个主要噪音源
 *
 * 安全：
 *   - 默认 dry-run，必须 --apply 才会实际删除
 *   - 删除前打印总数 + 按平台分布 + 10 条样本
 *   - HotSpotSource / Alert 因 onDelete: Cascade 自动连带删除
 *   - 删完打印剩余各平台数量分布，确认状态
 */
import { db } from "../src/lib/db";
import { isTechRelated } from "../src/lib/tech-filter";

const APPLY = process.argv.includes("--apply");
const VERBOSE = process.argv.includes("--verbose");

/** 信任平台：本身已是科技/AI 导向，不参与本次清理 */
const ALWAYS_KEEP_PLATFORMS = new Set([
  "github",
  "infoq",
  "reddit",
  "hackernews",
  "twitter",
]);

interface HotSpotLite {
  id: string;
  title: string;
  summary: string | null;
  sources: Array<{ platform: string; rawTitle: string }>;
}

function shouldDelete(h: HotSpotLite): boolean {
  // 规则 1：含 100% 科技平台 source → 保留
  for (const s of h.sources) {
    if (ALWAYS_KEEP_PLATFORMS.has(s.platform)) return false;
  }
  // 规则 2：title 或 summary 命中科技词 → 保留
  if (isTechRelated(h.title)) return false;
  if (isTechRelated(h.summary)) return false;
  // 规则 3：source 原始标题命中（防止 HotSpot.title 被 AI 改写后失配） → 保留
  for (const s of h.sources) {
    if (isTechRelated(s.rawTitle)) return false;
  }
  return true;
}

async function main() {
  const t0 = Date.now();

  console.log("==============================================");
  console.log(`  Cleanup Non-Tech HotSpot · mode=${APPLY ? "APPLY" : "DRY-RUN"}`);
  console.log("==============================================\n");

  const total = await db.hotSpot.count();
  console.log(`Loading all HotSpots... (total=${total})`);

  const hotspots = await db.hotSpot.findMany({
    select: {
      id: true,
      title: true,
      summary: true,
      sources: { select: { platform: true, rawTitle: true } },
    },
  });

  const toDelete: HotSpotLite[] = [];
  for (const h of hotspots) {
    if (shouldDelete(h)) toDelete.push(h);
  }

  // 按主平台分组统计
  const byPlatform: Record<string, number> = {};
  for (const h of toDelete) {
    const primary = h.sources[0]?.platform ?? "(none)";
    byPlatform[primary] = (byPlatform[primary] ?? 0) + 1;
  }

  console.log(`\n── 待删除统计 ──`);
  console.log(`  总数: ${toDelete.length} / ${total}（占比 ${((toDelete.length / total) * 100).toFixed(1)}%）`);
  console.log(`  按主平台:`);
  Object.entries(byPlatform)
    .sort((a, b) => b[1] - a[1])
    .forEach(([p, n]) => console.log(`    ${p.padEnd(12)} ${n}`));

  console.log(`\n── 删除候选样本（前 10 条）──`);
  toDelete.slice(0, 10).forEach((h, i) => {
    const pf = h.sources[0]?.platform ?? "?";
    const title = h.title.length > 50 ? h.title.slice(0, 50) + "…" : h.title;
    console.log(`  ${(i + 1).toString().padStart(2)}. [${pf.padEnd(11)}] ${title}`);
  });

  if (VERBOSE && toDelete.length > 10) {
    console.log(`\n── 全部待删除（--verbose 模式）──`);
    toDelete.slice(10).forEach((h, i) => {
      const pf = h.sources[0]?.platform ?? "?";
      console.log(`  ${(i + 11).toString().padStart(3)}. [${pf.padEnd(11)}] ${h.title}`);
    });
  }

  if (!APPLY) {
    console.log(`\n[DRY-RUN] 未实际删除任何数据。`);
    console.log(`如要执行删除：npx tsx scripts/cleanup-non-tech.ts --apply\n`);
    console.log(`Elapsed: ${Date.now() - t0}ms`);
    await db.$disconnect();
    return;
  }

  // === 实际执行删除 ===
  console.log(`\n── 开始删除 ──`);
  const ids = toDelete.map((h) => h.id);
  const BATCH = 100;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = ids.slice(i, i + BATCH);
    const r = await db.hotSpot.deleteMany({ where: { id: { in: batch } } });
    deleted += r.count;
    console.log(`  batch ${Math.floor(i / BATCH) + 1}: 删除 ${r.count} 条（累计 ${deleted}/${ids.length}）`);
  }

  // 删完后的状态
  console.log(`\n── 删除后剩余分布 ──`);
  const remaining = await db.hotSpot.count();
  console.log(`  HotSpot 总数: ${remaining}`);
  const sourcesByPlatform = await db.hotSpotSource.groupBy({
    by: ["platform"],
    _count: { id: true },
  });
  sourcesByPlatform
    .sort((a, b) => b._count.id - a._count.id)
    .forEach((s) =>
      console.log(`    ${s.platform.padEnd(12)} ${s._count.id}`),
    );

  console.log(`\nElapsed: ${Date.now() - t0}ms · 删除 ${deleted} 条 HotSpot`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
