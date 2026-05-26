/**
 * 从各平台 scraper 落到 metric 里的"发布时间"字段统一提取为 JS Date。
 *
 * 各平台字段长什么样：
 *   - google-news / infoq : metric.published = ISO 字符串（来自 RSS pubDate/isoDate）
 *   - hackernews          : metric.time = Unix 秒
 *   - reddit (v8 起补充)  : metric.publishedAt = Unix 秒
 *   - twitter (v8 起补充) : metric.publishedAt = ISO 字符串或 "Sat Sep 30 18:23:47 +0000 2023" 这种 Twitter 旧式格式
 *   - bilibili (v8 起补充): metric.publishedAt = Unix 秒（来自 pubdate）
 *   - weibo / zhihu / github : 平台层面没有"帖子发布时间"概念（热搜话题/趋势仓库），返回 null
 *
 * 返回 null 表示"该 source 没有可用的发布时间"。
 */

import type { Platform } from "@/lib/scrapers/types";

type MetricLike = Record<string, unknown>;

/** 上限：未来时间或 1980 年之前都视为脏数据 */
const MIN_VALID_MS = new Date("1980-01-01").getTime();
const MAX_VALID_MS_BUFFER = 24 * 3600 * 1000; // 允许"未来 24h 内"（时区/时钟偏差）

function clampDate(d: Date | null): Date | null {
  if (!d) return null;
  const t = d.getTime();
  if (!Number.isFinite(t)) return null;
  if (t < MIN_VALID_MS) return null;
  if (t > Date.now() + MAX_VALID_MS_BUFFER) return null;
  return d;
}

function fromUnixSeconds(v: unknown): Date | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return clampDate(new Date(v * 1000));
}

function fromIsoOrString(v: unknown): Date | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return clampDate(d);
}

/**
 * 从单个 source 的 metric 里读发布时间。
 * 不抛错，无效一律 null。
 */
export function extractPublishedAt(
  platform: Platform,
  metric: MetricLike,
): Date | null {
  switch (platform) {
    case "googlenews":
    case "infoq":
      return fromIsoOrString(metric.published);
    case "hackernews":
      return fromUnixSeconds(metric.time);
    case "reddit":
    case "bilibili":
      return fromUnixSeconds(metric.publishedAt);
    case "twitter":
      return fromIsoOrString(metric.publishedAt);
    case "weibo":
    case "zhihu":
    case "github":
    default:
      return null;
  }
}

/**
 * 多个 source 合并到一个 HotSpot 时，取最早的发布时间（更接近原始发表时刻）。
 * 多源都没有 → null。
 */
export function pickEarliestPublishedAt(
  sources: Array<{ platform: string; metric: MetricLike | string }>,
): Date | null {
  let earliest: Date | null = null;
  for (const s of sources) {
    const m =
      typeof s.metric === "string" ? safeParseMetric(s.metric) : s.metric;
    const d = extractPublishedAt(s.platform as Platform, m);
    if (!d) continue;
    if (!earliest || d.getTime() < earliest.getTime()) earliest = d;
  }
  return earliest;
}

function safeParseMetric(raw: string): MetricLike {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? (v as MetricLike) : {};
  } catch {
    return {};
  }
}
