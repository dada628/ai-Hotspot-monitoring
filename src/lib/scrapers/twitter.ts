/**
 * Twitter / X 抓取器 — 走 TwitterAPI.io
 *
 * 文档参考:
 *   GET https://api.twitterapi.io/twitter/tweet/advanced_search
 *   Header: X-API-Key
 *   Query: query (必), queryType=Latest|Top, cursor (可选)
 *
 * 策略：跑 2 条「高质量话题」搜索（中文 + 英文 AI/科技），合并去重，取 Top N。
 */

import { fetchWithTimeout } from "./http";
import type { RawHotItem, Scraper } from "./types";

interface TweetUser {
  id?: string;
  userName?: string;
  name?: string;
  screen_name?: string;
  profileImageUrl?: string;
}

interface Tweet {
  id?: string;
  text?: string;
  url?: string;
  twitterUrl?: string;
  createdAt?: string;
  retweetCount?: number;
  replyCount?: number;
  likeCount?: number;
  quoteCount?: number;
  viewCount?: number;
  author?: TweetUser;
  user?: TweetUser;
  /** 兼容下划线命名 */
  retweet_count?: number;
  reply_count?: number;
  like_count?: number;
  quote_count?: number;
  view_count?: number;
}

interface AdvancedSearchResponse {
  tweets?: Tweet[];
  has_next_page?: boolean;
  next_cursor?: string;
  status?: string;
  msg?: string;
}

const ENDPOINT = "https://api.twitterapi.io/twitter/tweet/advanced_search";

/** 默认查询集：中英文混合，AI/科技为主，且要求最低互动量保证质量 */
const QUERIES = [
  // 英文热门 AI 话题
  { q: "(AI OR LLM OR Claude OR ChatGPT OR OpenAI) min_faves:200 -is:retweet", queryType: "Top" as const },
  // 中文热门话题
  { q: "(AI OR 人工智能 OR 大模型) lang:zh min_faves:50 -is:retweet", queryType: "Top" as const },
];

const PER_QUERY_LIMIT = 12; // 单次查询取多少条
const TOTAL_LIMIT = 20; // 最终归并后保留多少条

async function searchTweets(
  apiKey: string,
  query: string,
  queryType: "Latest" | "Top",
): Promise<Tweet[]> {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&queryType=${queryType}`;
  const res = await fetchWithTimeout(url, {
    method: "GET",
    extraHeaders: { "X-API-Key": apiKey },
    timeoutMs: 18000,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `TwitterAPI.io HTTP ${res.status} — ${text.slice(0, 200)}`,
    );
  }
  const json = (await res.json()) as AdvancedSearchResponse;
  if (json.status === "error") {
    throw new Error(`TwitterAPI.io error: ${json.msg ?? "unknown"}`);
  }
  return (json.tweets ?? []).slice(0, PER_QUERY_LIMIT);
}

function getMetric(t: Tweet, primary: keyof Tweet, fallback: keyof Tweet): number {
  const a = t[primary];
  const b = t[fallback];
  if (typeof a === "number") return a;
  if (typeof b === "number") return b;
  return 0;
}

function buildTweetUrl(t: Tweet): string {
  if (t.twitterUrl) return t.twitterUrl;
  if (t.url) return t.url;
  const user = t.author ?? t.user;
  const userName = user?.userName ?? user?.screen_name;
  if (userName && t.id) return `https://x.com/${userName}/status/${t.id}`;
  return `https://x.com/i/web/status/${t.id ?? ""}`;
}

async function fetchTweets(): Promise<RawHotItem[]> {
  const apiKey = process.env.TWITTERAPI_IO_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error("TWITTERAPI_IO_KEY 未配置（请在 .env 中设置）");
  }

  // 并发执行多条查询
  const results = await Promise.allSettled(
    QUERIES.map((q) => searchTweets(apiKey, q.q, q.queryType)),
  );

  const merged: Tweet[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }

  if (merged.length === 0) {
    // 所有查询都失败
    const firstError = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw new Error(
      `所有 Twitter 查询都失败: ${firstError?.reason?.message ?? "unknown"}`,
    );
  }

  // 去重（按 tweet id）
  const seen = new Set<string>();
  const unique: Tweet[] = [];
  for (const t of merged) {
    const id = t.id ?? "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(t);
  }

  // 按总互动量排序
  unique.sort((a, b) => {
    const aTotal =
      getMetric(a, "likeCount", "like_count") +
      getMetric(a, "retweetCount", "retweet_count") +
      getMetric(a, "replyCount", "reply_count");
    const bTotal =
      getMetric(b, "likeCount", "like_count") +
      getMetric(b, "retweetCount", "retweet_count") +
      getMetric(b, "replyCount", "reply_count");
    return bTotal - aTotal;
  });

  const fetchedAt = new Date();
  return unique.slice(0, TOTAL_LIMIT).map((t, idx) => {
    const user = t.author ?? t.user;
    const text = (t.text ?? "").replace(/\s+/g, " ").trim();
    const title = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    return {
      platform: "twitter" as const,
      title: title || `Tweet by @${user?.userName ?? "unknown"}`,
      url: buildTweetUrl(t),
      rank: idx + 1,
      fetchedAt,
      metric: {
        likes: getMetric(t, "likeCount", "like_count"),
        retweets: getMetric(t, "retweetCount", "retweet_count"),
        replies: getMetric(t, "replyCount", "reply_count"),
        views: getMetric(t, "viewCount", "view_count"),
        author: user?.userName ?? user?.screen_name ?? "",
        authorName: user?.name ?? "",
      },
    };
  });
}

export const twitterScraper: Scraper = {
  platform: "twitter",
  displayName: "Twitter (X)",
  fetch: fetchTweets,
};
