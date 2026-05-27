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
 * 2026-05-26 收紧（v5）：移除 finance-zh / society-zh 两路（用户要求"信息都跟科技相关"）。
 *   保留 5 路：ai-en、ai-zh、tech-en、tech-zh、science-en
 *
 * 2026-05-27 扩展（v7）：AI 类目接入 buildKeywordQueries：
 *   ai-en  → ai-en-primary + ai-en-secondary（共 2 路）
 *   ai-zh  → ai-zh-primary + ai-zh-secondary（共 2 路）
 *   其余 tech-en / tech-zh / science-en 三路保持原样
 *   路数：5 → 7；用户原例 'Codex 5.3' / 'GPT-Codex-5.3' 都会被 secondary 命中。
 */

import Parser from "rss-parser";
import { buildKeywordQueries } from "./keywords";
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

/**
 * 把 OR 关键词串 + when:1d 时间窗装入 RSS URL；
 * 关键词部分用 encodeURIComponent（包含括号/引号/中文），
 * when:1d 部分保持明文以确保 Google News 解析时间过滤器。
 */
function makeAiUrl(query: string, lang: "en" | "zh"): string {
  const params = lang === "zh" ? ZH_PARAMS : EN_PARAMS;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+when:1d&${params}`;
}

function buildQueries(): QueryConfig[] {
  const en = buildKeywordQueries({ lang: "en" });
  const zh = buildKeywordQueries({ lang: "zh" });

  return [
    // AI 类目：primary（核心品牌名 + 主版本）+ secondary（细分版本号 + 工具栈）
    { lang: "en", categoryHint: "tech", label: "ai-en-primary",   url: makeAiUrl(en.primary, "en") },
    { lang: "en", categoryHint: "tech", label: "ai-en-secondary", url: makeAiUrl(en.secondary, "en") },
    { lang: "zh", categoryHint: "tech", label: "ai-zh-primary",   url: makeAiUrl(zh.primary, "zh") },
    { lang: "zh", categoryHint: "tech", label: "ai-zh-secondary", url: makeAiUrl(zh.secondary, "zh") },
    // 通用科技/科学类目：保留 v5 收紧后的 3 路
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
}

/**
 * 单路查询取 8 条（v6 是 10，v7 路数增 5→7 后下调避免 AI 类目压制其他类目），
 * 7 路并行原则上有 56 条，去重后取前 36 条。
 */
const PER_QUERY_LIMIT = 8;
const TOTAL_LIMIT = 36;

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
        // v9: 透传 RSS contentSnippet 作为原文摘录，给 AI Pipeline 增加上下文
        // 同时让前端"原文摘录"行有内容显示（HotItemCard.pickRawExcerpt 会读 excerpt/description/desc）
        excerpt: cleanContentSnippet(e.contentSnippet),
        categoryHint: q.categoryHint,
        queryLabel: q.label,
      },
    });
  }

  return items;
}

async function fetchGoogleNews(): Promise<RawHotItem[]> {
  const queries = buildQueries();
  const results = await Promise.allSettled(queries.map((q) => fetchOneFeed(q)));

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
      `Google News 全部 ${queries.length} 路 query 失败: ${firstFailReason ?? "unknown"}`,
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

/**
 * 清洗 RSS contentSnippet：
 * - 去 HTML 残余（rss-parser 大多场景下已无 tag，但 Google News 偶尔有 &nbsp;）
 * - 压平多空白
 * - 截到 400 字符（覆盖 99% 的 Google News snippet，超长截断防止 metric JSON 爆炸）
 */
function cleanContentSnippet(input: string | undefined): string {
  if (!input) return "";
  const text = input
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 400 ? `${text.slice(0, 400)}…` : text;
}

export const googleNewsScraper: Scraper = {
  platform: "googlenews",
  displayName: "Google News",
  fetch: fetchGoogleNews,
};
