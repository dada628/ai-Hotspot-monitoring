/**
 * Google News 抓取器 — 公开 RSS，无需 key
 *
 * 实现思路：
 *   Google News 提供 RSS 搜索：
 *     https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en
 *
 *   多类目并行（中英双语 × AI/科技/科学），合并去重。
 *   metric.categoryHint 给 AI Pipeline 一个分类提示（不强制覆盖 AI 的判断）。
 *
 * 2026-05-26 收紧：移除 finance-zh / society-zh 两路（用户要求"信息都跟科技相关"）。
 *   保留 5 路：ai-en、ai-zh、tech-en、tech-zh、science-en
 *   不再使用的 categoryHint 类型（society / finance / entertainment）从联合类型中移除。
 */

import Parser from "rss-parser";
import type { RawHotItem, Scraper } from "./types";

interface QueryConfig {
  /** 用于 metric.lang */
  lang: "en" | "zh";
  /** 类目提示，提交给 AI Pipeline 作为分类初值（AI 仍可自行调整） */
  categoryHint: "tech" | "science";
  /** 用于调试与日志 */
  label: string;
  url: string;
}

const ZH_PARAMS = "hl=zh-CN&gl=CN&ceid=CN:zh-Hans";
const EN_PARAMS = "hl=en-US&gl=US&ceid=US:en";

const QUERIES: QueryConfig[] = [
  {
    lang: "en",
    categoryHint: "tech",
    label: "ai-en",
    url: `https://news.google.com/rss/search?q=AI+OR+LLM+OR+ChatGPT+OR+OpenAI+OR+Anthropic+OR+Gemini+when:1d&${EN_PARAMS}`,
  },
  {
    lang: "zh",
    categoryHint: "tech",
    label: "ai-zh",
    url: `https://news.google.com/rss/search?q=AI+OR+大模型+OR+人工智能+OR+ChatGPT+when:1d&${ZH_PARAMS}`,
  },
  {
    lang: "en",
    categoryHint: "tech",
    label: "tech-en",
    url: `https://news.google.com/rss/search?q=startup+OR+funding+OR+IPO+OR+"tech+industry"+when:1d&${EN_PARAMS}`,
  },
  {
    lang: "zh",
    categoryHint: "tech",
    label: "tech-zh",
    url: `https://news.google.com/rss/search?q=科技+OR+创业+OR+融资+OR+上市+when:1d&${ZH_PARAMS}`,
  },
  {
    lang: "en",
    categoryHint: "science",
    label: "science-en",
    url: `https://news.google.com/rss/search?q=research+OR+discovery+OR+breakthrough+OR+"scientific+study"+when:1d&${EN_PARAMS}`,
  },
];

/**
 * 单路查询取 10 条，5 路并行原则上有 50 条，去重后取前 32 条。
 * 上限设 32 避免 Google News 单源在前端"压制"其他源；
 * 删掉 finance/society 两路后总召回降低，相应下调 TOTAL_LIMIT 与 v4 比例一致。
 */
const PER_QUERY_LIMIT = 10;
const TOTAL_LIMIT = 32;

interface GoogleNewsItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  /** Google News 在 source 字段中放发布媒体名 */
  source?: { _?: string } | string;
}

async function fetchOneFeed(q: QueryConfig): Promise<RawHotItem[]> {
  const parser = new Parser<unknown, GoogleNewsItem>({
    timeout: 16000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HotPulse/1.0",
    },
  });
  const feed = await parser.parseURL(q.url);
  const fetchedAt = new Date();
  const items: RawHotItem[] = [];

  const entries = (feed.items ?? []).slice(0, PER_QUERY_LIMIT);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.title || !e.link) continue;
    const cleanTitle = (e.title ?? "").trim();

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
        lang: q.lang,
        source: sourceName,
        published: e.isoDate ?? e.pubDate ?? "",
        // 给 AI Pipeline 一个分类提示（AI 仍可自行调整）
        categoryHint: q.categoryHint,
        queryLabel: q.label,
      },
    });
  }

  return items;
}

async function fetchGoogleNews(): Promise<RawHotItem[]> {
  const results = await Promise.allSettled(QUERIES.map((q) => fetchOneFeed(q)));

  const merged: RawHotItem[] = [];
  let firstFailReason: string | undefined;
  for (const r of results) {
    if (r.status === "fulfilled") {
      merged.push(...r.value);
    } else if (!firstFailReason) {
      firstFailReason =
        r.reason instanceof Error ? r.reason.message : String(r.reason);
    }
  }

  if (merged.length === 0) {
    throw new Error(
      `Google News 全部 ${QUERIES.length} 路 query 失败: ${firstFailReason ?? "unknown"}`,
    );
  }

  // URL 去重，保留更靠前的版本（多类目召回同一篇文章时只留第一次出现的）
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
