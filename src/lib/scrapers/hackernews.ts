/**
 * HackerNews 抓取器 — 两种数据源混合
 *
 * 1. Firebase /topstories.json：当前首页排行（综合热门，含非 AI 话题）
 *    2026-05-26 起加 isTechRelated 软过滤：HN topstories 约 10% 是政经/科普/生活类，过滤掉
 * 2. Algolia search：按 AI 关键词专题（最新 + 高分），聚焦 AI 工程师感兴趣的内容
 *    本身已限定 AI 关键词，无需再过滤
 *
 * 文档:
 *   - https://hacker-news.firebaseio.com/v0/topstories.json
 *   - https://hn.algolia.com/api/v1/search?query=AI&tags=story&hitsPerPage=30
 *
 * 无需 API Key，无频率限制（公平使用）。
 */

import { fetchJSON } from "./http";
import { isTechRelated } from "@/lib/tech-filter";
import { buildKeywordQueries } from "./keywords";
import type { RawHotItem, Scraper } from "./types";

interface HnFirebaseItem {
  id: number;
  type?: string;
  title?: string;
  url?: string;
  score?: number;
  by?: string;
  time?: number;
  descendants?: number;
  text?: string;
}

interface AlgoliaHit {
  objectID: string;
  title?: string;
  story_title?: string;
  url?: string;
  story_url?: string;
  points?: number;
  num_comments?: number;
  author?: string;
  created_at_i?: number;
}

interface AlgoliaResponse {
  hits?: AlgoliaHit[];
}

const FIREBASE_BASE = "https://hacker-news.firebaseio.com/v0";
const ALGOLIA_BASE = "https://hn.algolia.com/api/v1";
const TOP_N = 15;
const AI_HITS = 20;

/**
 * Algolia AI 专题搜索的关键词串（v7 起）：
 *   合并 primary + secondary 两条 OR query 为一条长 OR，保证用户原例
 *   'Codex 5.3' / 'GPT-Codex-5.3' / 'Claude Opus 4.5' / 'Gemini 3' 等
 *   细分模型变体都被覆盖。
 *
 *   每条 query 上限 700 字符（HN Algolia URL 编码后约 1500 字符，安全）。
 *
 *   形式：(primary 内别名 OR ...) OR (secondary 内别名 OR ...)
 *   Algolia/Lucene 支持嵌套 OR，正常解析。
 */
function buildAiQuery(): string {
  const { primary, secondary } = buildKeywordQueries({
    lang: "en",
    maxChars: 700,
  });
  if (primary === "()" && secondary === "()") return "AI OR LLM";
  if (primary === "()") return secondary;
  if (secondary === "()") return primary;
  return `${primary} OR ${secondary}`;
}

async function fetchTopStories(): Promise<RawHotItem[]> {
  const ids = await fetchJSON<number[]>(`${FIREBASE_BASE}/topstories.json`, {
    timeoutMs: 12000,
  });
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("HackerNews /topstories.json 返回空");
  }

  const topIds = ids.slice(0, TOP_N);
  const detailResults = await Promise.allSettled(
    topIds.map((id) =>
      fetchJSON<HnFirebaseItem | null>(`${FIREBASE_BASE}/item/${id}.json`, {
        timeoutMs: 10000,
      }),
    ),
  );

  const fetchedAt = new Date();
  const items: RawHotItem[] = [];

  for (let i = 0; i < detailResults.length; i++) {
    const r = detailResults[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const it = r.value;
    if (it.type !== "story" || !it.title) continue;

    const url =
      it.url && it.url.length > 0
        ? it.url
        : `https://news.ycombinator.com/item?id=${it.id}`;

    items.push({
      platform: "hackernews" as const,
      title: it.title,
      url,
      rank: i + 1,
      fetchedAt,
      metric: {
        score: it.score ?? 0,
        comments: it.descendants ?? 0,
        author: it.by ?? "",
        time: it.time ?? 0,
        source: "frontpage",
      },
    });
  }

  // topstories 路：HN 首页含少量非科技讨论（政经/科普/生活），用白名单软过滤
  return items.filter((it) => isTechRelated(it.title));
}

async function fetchAlgoliaSearch(): Promise<RawHotItem[]> {
  // 使用 search_by_date 排除老旧帖子；过去 7 天内
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const aiQuery = buildAiQuery();
  const url =
    `${ALGOLIA_BASE}/search?` +
    `query=${encodeURIComponent(aiQuery)}` +
    `&tags=story` +
    `&hitsPerPage=${AI_HITS}` +
    `&numericFilters=created_at_i>${sevenDaysAgo},points>30`;

  const json = await fetchJSON<AlgoliaResponse>(url, { timeoutMs: 15000 });
  const hits = json.hits ?? [];
  const fetchedAt = new Date();
  const items: RawHotItem[] = [];

  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    const title = h.title ?? h.story_title ?? "";
    if (!title) continue;
    const url =
      h.url ??
      h.story_url ??
      `https://news.ycombinator.com/item?id=${h.objectID}`;

    items.push({
      platform: "hackernews" as const,
      title,
      url,
      rank: i + 1,
      fetchedAt,
      metric: {
        score: h.points ?? 0,
        comments: h.num_comments ?? 0,
        author: h.author ?? "",
        time: h.created_at_i ?? 0,
        source: "algolia_ai",
      },
    });
  }

  return items;
}

async function fetchAll(): Promise<RawHotItem[]> {
  const results = await Promise.allSettled([
    fetchTopStories(),
    fetchAlgoliaSearch(),
  ]);

  const merged: RawHotItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }
  if (merged.length === 0) {
    const err = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw new Error(`HN 两路均失败: ${err?.reason?.message ?? "unknown"}`);
  }

  // URL 去重（首页和搜索可能重复）
  const seen = new Set<string>();
  const unique: RawHotItem[] = [];
  for (const it of merged) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    unique.push(it);
  }

  return unique;
}

export const hackernewsScraper: Scraper = {
  platform: "hackernews",
  displayName: "HackerNews",
  fetch: fetchAll,
};
