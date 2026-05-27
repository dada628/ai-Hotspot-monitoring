/**
 * 从 HotSpotSource.metric 提取「原文摘录」素材。
 * v9: 统一过滤无效内容（InfoQ 的「点击查看原文>」等），供 AI Pipeline / 卡片 / 详情页复用。
 */

export type MetricLike = Record<string, unknown> | string | null | undefined;

/** excerpt / description / desc 任一字段，按优先级取第一个有效值 */
const EXCERPT_KEYS = ["excerpt", "description", "desc"] as const;

/**
 * 判断摘录是否有信息价值（喂 AI 或展示给用户）。
 * - 太短（< 20 字）视为无效
 * - InfoQ RSS 常见的「点击查看原文>」占位符
 */
export function isUsefulExcerpt(text: string): boolean {
  const t = text.trim();
  if (t.length < 20) return false;
  if (/点击查看\s*原文/.test(t)) return false;
  return true;
}

export function parseMetricObject(
  metric: MetricLike,
): Record<string, unknown> {
  if (!metric) return {};
  if (typeof metric === "object" && !Array.isArray(metric)) return metric;
  if (typeof metric !== "string") return {};
  try {
    const parsed = JSON.parse(metric) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/** 从单条 source 的 metric 中提取有效摘录；无效则返回 null */
export function extractSourceExcerpt(metric: MetricLike): string | null {
  const m = parseMetricObject(metric);
  for (const key of EXCERPT_KEYS) {
    const v = m[key];
    if (typeof v === "string" && isUsefulExcerpt(v)) return v.trim();
  }
  return null;
}

export interface SourceExcerptInput {
  platform: string;
  rawTitle: string;
  metric: MetricLike;
}

/** 收集多源摘录（去重、按平台顺序） */
export function collectSourceExcerpts(
  sources: SourceExcerptInput[],
): Array<{ platform: string; excerpt: string }> {
  const out: Array<{ platform: string; excerpt: string }> = [];
  const seen = new Set<string>();

  for (const s of sources) {
    const excerpt = extractSourceExcerpt(s.metric);
    if (!excerpt) continue;
    const key = excerpt.slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform: s.platform, excerpt });
  }

  return out;
}
