/**
 * Google News 抓取器 — 公开 RSS，无需 key
 *
 * 实现思路：
 *   Google News 提供 RSS 搜索：
 *     https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en
 *
 *   跑两条 query：英文 AI 新闻 + 中文 AI 新闻，合并去重。
 */

import Parser from "rss-parser";
import type { RawHotItem, Scraper } from "./types";

const QUERIES = [
  {
    label: "en",
    url: "https://news.google.com/rss/search?q=AI+OR+LLM+OR+ChatGPT+OR+OpenAI+when:1d&hl=en-US&gl=US&ceid=US:en",
  },
  {
    label: "zh",
    url: "https://news.google.com/rss/search?q=AI+OR+大模型+OR+人工智能+when:1d&hl=zh-CN&gl=CN&ceid=CN:zh-Hans",
  },
];

const PER_QUERY_LIMIT = 18;
const TOTAL_LIMIT = 28;

interface GoogleNewsItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  /** Google News 在 source 字段中放发布媒体名 */
  source?: { _?: string } | string;
}

async function fetchOneFeed(url: string, label: string): Promise<RawHotItem[]> {
  const parser = new Parser<unknown, GoogleNewsItem>({
    timeout: 16000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HotPulse/1.0",
    },
  });
  const feed = await parser.parseURL(url);
  const fetchedAt = new Date();
  const items: RawHotItem[] = [];

  const entries = (feed.items ?? []).slice(0, PER_QUERY_LIMIT);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.title || !e.link) continue;
    // Google News 的 title 形式："标题 - 媒体名"
    const cleanTitle = (e.title ?? "").trim();

    // 解析 source 字段（XML 解析后通常是 string 或 { _: "..." }）
    let sourceName = "";
    if (typeof e.source === "string") sourceName = e.source;
    else if (e.source && typeof e.source === "object") {
      sourceName = (e.source as { _?: string })._ ?? "";
    }

    items.push({
      platform: "googlenews" as const,
      title: cleanTitle,
      url: e.link,
      rank: i + 1,
      fetchedAt,
      metric: {
        rank: i + 1,
        lang: label,
        source: sourceName,
        published: e.isoDate ?? e.pubDate ?? "",
      },
    });
  }

  return items;
}

async function fetchGoogleNews(): Promise<RawHotItem[]> {
  const results = await Promise.allSettled(
    QUERIES.map((q) => fetchOneFeed(q.url, q.label)),
  );

  const merged: RawHotItem[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }

  if (merged.length === 0) {
    const err = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw new Error(
      `Google News 全部 query 失败: ${err?.reason?.message ?? "unknown"}`,
    );
  }

  // URL 去重
  const seen = new Set<string>();
  const unique: RawHotItem[] = [];
  for (const it of merged) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    unique.push(it);
  }

  return unique.slice(0, TOTAL_LIMIT);
}

export const googleNewsScraper: Scraper = {
  platform: "googlenews",
  displayName: "Google News",
  fetch: fetchGoogleNews,
};
