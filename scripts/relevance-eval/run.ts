/**
 * 相关性评估 · P1
 *
 * 运行：
 *   npx tsx scripts/relevance-eval/run.ts           # 需 OPENROUTER_API_KEY
 *   RUN_AI_TESTS=1 npx tsx scripts/relevance-eval/run.ts
 *
 * 选项：
 *   --dry-run    只校验 golden.jsonl，不调用 LLM
 *   --limit N    只跑前 N 条（调试用）
 *   --threshold  准确率门槛，默认 0.75
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { judgeRelevance } from "../../src/lib/ai/relevance-judge";
import { hasOpenRouterKey } from "../../src/lib/ai/openrouter";
import {
  GoldenCaseSchema,
  type GoldenCase,
  type RelevanceTier,
} from "../../src/lib/ai/relevance-schemas";
import { scoreRuleRelevance } from "../../src/lib/relevance-rules";

const GOLDEN_PATH = resolve(__dirname, "golden.jsonl");
const DEFAULT_THRESHOLD = 0.75;

function loadEnvFile() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env 可选
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let limit: number | undefined;
  let threshold = DEFAULT_THRESHOLD;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--dry-run") dryRun = true;
    else if (args[i] === "--limit" && args[i + 1]) {
      limit = Number(args[++i]);
    } else if (args[i] === "--threshold" && args[i + 1]) {
      threshold = Number(args[++i]);
    }
  }
  return { dryRun, limit, threshold };
}

function loadGolden(limit?: number): GoldenCase[] {
  const raw = readFileSync(GOLDEN_PATH, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim());
  const cases: GoldenCase[] = [];
  for (const [i, line] of lines.entries()) {
    try {
      cases.push(GoldenCaseSchema.parse(JSON.parse(line)));
    } catch (e) {
      throw new Error(
        `golden.jsonl 第 ${i + 1} 行解析失败: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return limit ? cases.slice(0, limit) : cases;
}

function tierMatch(expected: RelevanceTier, actual: RelevanceTier): boolean {
  return expected === actual;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnvFile();
  const { dryRun, limit, threshold } = parseArgs();
  const cases = loadGolden(limit);

  console.log("═══════════════════════════════════════════════════");
  console.log(" HotPulse · 相关性评估 (P1)");
  console.log(` golden: ${cases.length} 条 · 门槛 ${(threshold * 100).toFixed(0)}%`);
  console.log("═══════════════════════════════════════════════════\n");

  if (dryRun) {
    const byTier = { direct: 0, related: 0, irrelevant: 0 };
    for (const c of cases) byTier[c.expectedTier] += 1;
    console.log("✓ dry-run：golden 校验通过");
    console.log(
      `  分布 direct=${byTier.direct} related=${byTier.related} irrelevant=${byTier.irrelevant}`,
    );
    process.exit(0);
  }

  if (process.env.RUN_AI_TESTS !== "1" && !process.env.FORCE_RELEVANCE_EVAL) {
    console.log(
      "跳过 LLM 评估：请设置 RUN_AI_TESTS=1 或 FORCE_RELEVANCE_EVAL=1（避免误烧 token）",
    );
    console.log("  例：$env:RUN_AI_TESTS=1; npx tsx scripts/relevance-eval/run.ts");
    process.exit(0);
  }

  if (!hasOpenRouterKey()) {
    console.error("错误：OPENROUTER_API_KEY 未配置");
    process.exit(2);
  }

  const mismatches: Array<{
    case: GoldenCase;
    actual: RelevanceTier;
    score: number;
    directMention: boolean;
    reason: string;
    ruleInferred: RelevanceTier;
    ruleHits: number;
  }> = [];

  let ruleTierCorrect = 0;
  let directMentionAligned = 0;

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const rule = scoreRuleRelevance(c.query, c.title, c.summary ?? null);

    process.stdout.write(`[${i + 1}/${cases.length}] ${c.id} … `);

    const out = await judgeRelevance({
      query: c.query,
      title: c.title,
      summary: c.summary,
    });

    const ok = tierMatch(c.expectedTier, out.tier);
    const ruleOk = tierMatch(c.expectedTier, rule.inferredTier);
    if (ruleOk) ruleTierCorrect += 1;

    const mentionOk =
      c.expectedTier === "direct"
        ? out.directMention === true
        : c.expectedTier === "irrelevant"
          ? out.directMention === false
          : true;
    if (mentionOk) directMentionAligned += 1;

    if (!ok) {
      mismatches.push({
        case: c,
        actual: out.tier,
        score: out.score,
        directMention: out.directMention,
        reason: out.reason,
        ruleInferred: rule.inferredTier,
        ruleHits: rule.hits,
      });
      console.log(`✗ 期望 ${c.expectedTier} → ${out.tier} (${out.score})`);
    } else {
      console.log(`✓ ${out.tier} (${out.score})`);
    }

    if (i < cases.length - 1) await sleep(400);
  }

  const tierCorrect = cases.length - mismatches.length;
  const accuracy = tierCorrect / cases.length;
  const ruleAccuracy = ruleTierCorrect / cases.length;

  console.log("\n──────────────── 汇总 ────────────────");
  console.log(` LLM tier 准确率: ${tierCorrect}/${cases.length} = ${(accuracy * 100).toFixed(1)}%`);
  console.log(
    ` 规则基线准确率: ${ruleTierCorrect}/${cases.length} = ${(ruleAccuracy * 100).toFixed(1)}% （子串 hits，与线上一致）`,
  );
  console.log(
    ` directMention 一致性: ${directMentionAligned}/${cases.length} = ${((directMentionAligned / cases.length) * 100).toFixed(1)}%`,
  );

  const byExpected: Record<RelevanceTier, { total: number; ok: number }> = {
    direct: { total: 0, ok: 0 },
    related: { total: 0, ok: 0 },
    irrelevant: { total: 0, ok: 0 },
  };
  for (const c of cases) {
    byExpected[c.expectedTier].total += 1;
    if (!mismatches.some((m) => m.case.id === c.id)) {
      byExpected[c.expectedTier].ok += 1;
    }
  }
  console.log("\n 按期望 tier：");
  for (const t of ["direct", "related", "irrelevant"] as const) {
    const { total, ok } = byExpected[t];
    if (total === 0) continue;
    console.log(`   ${t}: ${ok}/${total} = ${((ok / total) * 100).toFixed(0)}%`);
  }

  if (mismatches.length > 0) {
    console.log("\n──────────────── 误判样例 ────────────────");
    for (const m of mismatches.slice(0, 12)) {
      console.log(`\n  [${m.case.id}] query="${m.case.query}"`);
      console.log(`    标题: ${m.case.title.slice(0, 72)}${m.case.title.length > 72 ? "…" : ""}`);
      console.log(
        `    期望 ${m.case.expectedTier} · LLM→${m.actual} (${m.score}) · 规则→${m.ruleInferred} (hits=${m.ruleHits})`,
      );
      console.log(`    理由: ${m.reason}`);
      if (m.case.notes) console.log(`    备注: ${m.case.notes}`);
    }
    if (mismatches.length > 12) {
      console.log(`\n  … 另有 ${mismatches.length - 12} 条，见完整运行日志`);
    }
  }

  if (accuracy < threshold) {
    console.log(
      `\n✗ 未达门槛 ${(threshold * 100).toFixed(0)}% —— 请调整 relevance-judge prompt 或 golden 标注`,
    );
    process.exit(1);
  }

  console.log("\n✓ 评估通过");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
