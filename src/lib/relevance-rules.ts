/**
 * 规则基线相关性（与 GET /api/hotspots sort=relevance 子串逻辑一致）
 *
 * 用于 eval 报告对比：展示「仅靠子串命中」与 LLM judge 的差距。
 */

export interface RuleRelevanceResult {
  /** 0-6，与 hotspots/route.ts hits 一致 */
  hits: number;
  titleHit: boolean;
  tagHit: boolean;
  summaryHit: boolean;
  /** 规则推断 tier（粗映射，非 ground truth） */
  inferredTier: "direct" | "related" | "irrelevant";
}

export function scoreRuleRelevance(
  query: string,
  title: string,
  summary: string | null | undefined,
  tags: string[] = [],
): RuleRelevanceResult {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return {
      hits: 0,
      titleHit: false,
      tagHit: false,
      summaryHit: false,
      inferredTier: "irrelevant",
    };
  }

  const titleHit = title.toLowerCase().includes(needle);
  const tagHit = tags.some((t) => t.toLowerCase().includes(needle));
  const summaryHit = (summary ?? "").toLowerCase().includes(needle);

  let hits = 0;
  if (titleHit) hits += 3;
  if (tagHit) hits += 2;
  if (summaryHit) hits += 1;

  let inferredTier: RuleRelevanceResult["inferredTier"] = "irrelevant";
  if (titleHit) inferredTier = "direct";
  else if (tagHit || summaryHit) inferredTier = "related";

  return { hits, titleHit, tagHit, summaryHit, inferredTier };
}
