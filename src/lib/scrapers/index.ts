/**
 * 抓取器注册中心
 * 在这里统一管理所有平台的抓取器
 */
import { bilibiliScraper } from "./bilibili";
import { githubScraper } from "./github";
import { hackernewsScraper } from "./hackernews";
import { twitterScraper } from "./twitter";
import { weiboScraper } from "./weibo";
import { zhihuScraper } from "./zhihu";
import type { Platform, Scraper, ScrapeResult } from "./types";

export { type RawHotItem, type ScrapeResult, type Platform } from "./types";

export const SCRAPERS: Record<Platform, Scraper> = {
  weibo: weiboScraper,
  zhihu: zhihuScraper,
  bilibili: bilibiliScraper,
  github: githubScraper,
  twitter: twitterScraper,
  hackernews: hackernewsScraper,
};

export const ALL_PLATFORMS: Platform[] = [
  "weibo",
  "zhihu",
  "bilibili",
  "github",
  "twitter",
  "hackernews",
];

/**
 * 抓取单个平台
 */
export async function runOne(platform: Platform): Promise<ScrapeResult> {
  const scraper = SCRAPERS[platform];
  const startedAt = Date.now();
  try {
    const items = await scraper.fetch();
    return {
      platform,
      status: "success",
      items,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    return {
      platform,
      status: "failed",
      items: [],
      durationMs: Date.now() - startedAt,
      errorMsg: errMsg,
    };
  }
}

/**
 * 并行抓取所有平台（互不阻塞，单源失败不影响其他源）
 */
export async function runAll(
  platforms: Platform[] = ALL_PLATFORMS,
): Promise<ScrapeResult[]> {
  return Promise.all(platforms.map((p) => runOne(p)));
}
