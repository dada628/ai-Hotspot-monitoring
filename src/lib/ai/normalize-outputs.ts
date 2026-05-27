/**
 * LLM structured output 归一化：在 Zod 校验通过后做截断/补齐，降低边界失败率。
 * 不放宽 schema 的 min/max 定义，仅修复可安全推断的越界。
 */

import type {
  ClassifyOutput,
  ScoreOutput,
  SummaryOutput,
} from "./schemas";

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function clampConfidence(raw: number): number {
  let c = raw;
  if (c > 1 && c <= 100) c = c / 100;
  return clamp(c, 0, 1);
}

export function normalizeClassifyOutput(o: ClassifyOutput): ClassifyOutput {
  const tags = o.tags
    .map((t) => t.trim().slice(0, 12))
    .filter((t) => t.length >= 1)
    .slice(0, 5);

  return {
    category: o.category,
    tags: tags.length > 0 ? tags : ["热点"],
    confidence: clampConfidence(o.confidence),
  };
}

export function normalizeSummaryOutput(o: SummaryOutput): SummaryOutput {
  const summary = o.summary.trim().slice(0, 800);

  const keyPoints = o.keyPoints
    .map((p) => p.trim().slice(0, 80))
    .filter((p) => p.length >= 2);

  while (keyPoints.length < 3) {
    if (keyPoints.length === 0 && summary.length >= 20) {
      keyPoints.push(summary.slice(0, 78));
    } else if (keyPoints.length === 1) {
      keyPoints.push("事件背景与来龙去脉见上方长导读");
    } else {
      keyPoints.push("行业影响与适合跟进的读者群体见长导读末段");
    }
  }

  const entities = o.entities
    .map((e) => e.trim().slice(0, 30))
    .filter((e) => e.length >= 1)
    .slice(0, 8);

  return {
    summary,
    keyPoints: keyPoints.slice(0, 5),
    entities,
  };
}

export function normalizeScoreOutput(o: ScoreOutput): ScoreOutput {
  return {
    score: clamp(Math.round(o.score), 0, 100),
    trendVelocity: clamp(Math.round(o.trendVelocity), 0, 100),
    reasoning: o.reasoning.trim().slice(0, 160),
  };
}
