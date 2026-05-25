/**
 * HackerNews 抓取器 — 两种数据源混合
 *
 * 1. Firebase /topstories.json：当前首页排行（综合热门，含非 AI 话题）
 * 2. Algolia search：按 AI 关键词专题（最新 + 高分），聚焦 AI 工程师感兴趣的内容
 *
 * 文档:
 *   - https://hacker-news.firebaseio.com/v0/topstories.json
 *   - https://hn.algolia.com/api/v1/search?query=AI&tags=story&hitsPerPage=30
 *
 * 无需 API Key，无频率限制（公平使用）。
 */

import { fetchJSON } from "./http";
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
const AI_QUERY = "AI OR LLM OR Claude OR ChatGPT OR OpenAI OR DeepSeek";
const AI_HITS = 20;

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

  return items;
}

async function fetchAlgoliaSearch(): Promise<RawHotItem[]> {
  // 使用 search_by_date 排除老旧帖子；过去 7 天内
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const url =
    `${ALGOLIA_BASE}/search?` +
    `query=${encodeURIComponent(AI_QUERY)}` +
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
