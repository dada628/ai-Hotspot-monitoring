/**
 * HackerNews 抓取器 — 免费的 Firebase 公开 API
 *
 * 文档:
 *   GET https://hacker-news.firebaseio.com/v0/topstories.json   → 取前 N 个 id
 *   GET https://hacker-news.firebaseio.com/v0/item/{id}.json    → 取详情
 *
 * 无需 API Key，无频率限制（公平使用）。
 */

import { fetchJSON } from "./http";
import type { RawHotItem, Scraper } from "./types";

interface HnItem {
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

const BASE = "https://hacker-news.firebaseio.com/v0";
const TOP_N = 20;

async function fetchTop(): Promise<RawHotItem[]> {
  const ids = await fetchJSON<number[]>(`${BASE}/topstories.json`, {
    timeoutMs: 12000,
  });
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error("HackerNews /topstories.json 返回空");
  }

  const topIds = ids.slice(0, TOP_N);

  // 并发抓详情
  const detailResults = await Promise.allSettled(
    topIds.map((id) =>
      fetchJSON<HnItem | null>(`${BASE}/item/${id}.json`, { timeoutMs: 10000 }),
    ),
  );

  const fetchedAt = new Date();
  const items: RawHotItem[] = [];

  for (let i = 0; i < detailResults.length; i++) {
    const r = detailResults[i];
    if (r.status !== "fulfilled" || !r.value) continue;
    const it = r.value;
    if (it.type !== "story" || !it.title) continue;

    // url 缺失时（自帖 Ask HN / Show HN）使用 HN 站内
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
      },
    });
  }

  if (items.length === 0) {
    throw new Error("HackerNews 详情抓取全部失败");
  }

  return items;
}

export const hackernewsScraper: Scraper = {
  platform: "hackernews",
  displayName: "HackerNews",
  fetch: fetchTop,
};
