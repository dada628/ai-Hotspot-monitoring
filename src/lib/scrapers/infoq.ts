/**
 * InfoQ 中文 RSS 抓取器
 *
 * 文档：https://www.infoq.cn/feed.xml
 *
 * 权威综合技术媒体，涵盖 AI / 后端 / 架构 / 工程实践，
 * 用于平衡英文社区 + 提供更"工程师导向"的中文严肃报道。
 */

import Parser from "rss-parser";
import type { RawHotItem, Scraper } from "./types";

const FEED_URL = "https://www.infoq.cn/feed.xml";
const TOTAL_LIMIT = 20;

interface FeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  isoDate?: string;
  contentSnippet?: string;
  creator?: string;
  categories?: string[];
}

async function fetchInfoQ(): Promise<RawHotItem[]> {
  const parser = new Parser<unknown, FeedItem>({
    timeout: 15000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HotPulse/1.0",
      Accept: "application/rss+xml, text/xml, application/xml, */*",
    },
  });

  const feed = await parser.parseURL(FEED_URL);
  if (!feed.items || feed.items.length === 0) {
    throw new Error("InfoQ RSS 返回为空");
  }

  const fetchedAt = new Date();
  const items: RawHotItem[] = [];
  const entries = feed.items.slice(0, TOTAL_LIMIT);

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.title || !e.link) continue;
    items.push({
      platform: "infoq" as const,
      title: e.title.trim(),
      url: e.link,
      rank: i + 1,
      fetchedAt,
      metric: {
        rank: i + 1,
        author: e.creator ?? "",
        published: e.isoDate ?? e.pubDate ?? "",
        category: (e.categories ?? []).slice(0, 3).join(","),
        // v9: 透传 RSS contentSnippet 作为原文摘录
        excerpt: cleanContentSnippet(e.contentSnippet),
      },
    });
  }

  if (items.length === 0) {
    throw new Error("InfoQ RSS 解析后无有效条目");
  }
  return items;
}

/** RSS contentSnippet 清洗（HTML 残余 / 压平空白 / 截 400 字） */
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

export const infoqScraper: Scraper = {
  platform: "infoq",
  displayName: "InfoQ 中文",
  fetch: fetchInfoQ,
};
