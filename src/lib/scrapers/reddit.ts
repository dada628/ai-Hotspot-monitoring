/**
 * Reddit 抓取器 — 公开 JSON，无需 API key
 *
 * 文档参考: https://www.reddit.com/r/<sub>/top.json?limit=20&t=day
 *
 * 抓取目标（AI 工程师导向）：
 *   - r/LocalLLaMA: 开源 LLM 部署/微调讨论
 *   - r/MachineLearning: 学术与工业界最新进展
 *
 * 限制：
 *   - 必须带合规 User-Agent，否则 429
 *   - top.json 已按热度倒序
 */

import { fetchJSON } from "./http";
import type { RawHotItem, Scraper } from "./types";

interface RedditChild {
  kind: string;
  data?: {
    id?: string;
    title?: string;
    selftext?: string;
    url?: string;
    permalink?: string;
    subreddit?: string;
    ups?: number;
    score?: number;
    num_comments?: number;
    upvote_ratio?: number;
    author?: string;
    created_utc?: number;
    over_18?: boolean;
    stickied?: boolean;
    is_video?: boolean;
  };
}

interface RedditListing {
  kind?: string;
  data?: {
    children?: RedditChild[];
  };
}

const SUBS = [
  { name: "LocalLLaMA", limit: 18 },
  { name: "MachineLearning", limit: 18 },
];

const TIME_WINDOW = "day";

async function fetchSub(sub: string, limit: number): Promise<RedditChild[]> {
  const url = `https://www.reddit.com/r/${sub}/top.json?limit=${limit}&t=${TIME_WINDOW}`;
  const json = await fetchJSON<RedditListing>(url, {
    timeoutMs: 15000,
    extraHeaders: {
      "User-Agent": "HotPulse/1.0 (+https://github.com/dada628/ai-Hotspot-monitoring)",
    },
  });
  return json.data?.children ?? [];
}

async function fetchReddit(): Promise<RawHotItem[]> {
  const results = await Promise.allSettled(
    SUBS.map((s) => fetchSub(s.name, s.limit)),
  );

  const all: RedditChild[] = [];
  for (const r of results) {
    if (r.status === "fulfilled") all.push(...r.value);
  }

  if (all.length === 0) {
    const err = results.find((r) => r.status === "rejected") as
      | PromiseRejectedResult
      | undefined;
    throw new Error(
      `Reddit 全部子社区失败: ${err?.reason?.message ?? "unknown"}`,
    );
  }

  const fetchedAt = new Date();
  const items: RawHotItem[] = [];

  // 按 ups 排序后取前 30
  all.sort((a, b) => (b.data?.ups ?? 0) - (a.data?.ups ?? 0));

  for (let i = 0; i < Math.min(all.length, 30); i++) {
    const c = all[i];
    const d = c.data;
    if (!d || !d.title || d.stickied || d.over_18) continue;

    const permalink = d.permalink
      ? `https://www.reddit.com${d.permalink}`
      : d.url ?? "";
    if (!permalink) continue;

    const externalUrl = d.url && !d.url.includes("reddit.com") ? d.url : permalink;

    items.push({
      platform: "reddit" as const,
      title: `[r/${d.subreddit ?? "?"}] ${d.title}`,
      url: externalUrl,
      rank: i + 1,
      fetchedAt,
      metric: {
        upvotes: d.ups ?? d.score ?? 0,
        comments: d.num_comments ?? 0,
        upvoteRatio: d.upvote_ratio ?? 0,
        author: d.author ?? "",
        subreddit: d.subreddit ?? "",
      },
    });
  }

  if (items.length === 0) {
    throw new Error("Reddit 解析后无有效条目");
  }
  return items;
}

export const redditScraper: Scraper = {
  platform: "reddit",
  displayName: "Reddit (AI subs)",
  fetch: fetchReddit,
};
