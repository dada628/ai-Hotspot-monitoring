/**
 * GitHub Trending 抓取器
 * 接口：HTML 爬 https://github.com/trending?since=daily
 *
 * GitHub Trending 没有官方 JSON API，需要解析 HTML。
 * 用简单字符串正则，结构稳定后可考虑换 cheerio。
 *
 * HTML 结构（2026-05 验证）:
 *   <article class="Box-row">
 *     <h2 class="h3 lh-condensed">
 *       <a ...attrs href="/owner/repo" class="Link">
 *         <span class="text-normal">owner /</span>
 *         repo
 *       </a>
 *     </h2>
 *     <p class="col-9 ...">description</p>
 *     <span itemprop="programmingLanguage">Lang</span>
 *     <a href="/owner/repo/stargazers" ...>...svg...30,055</a>
 *     <span class="...float-sm-right">...svg...5,625 stars today</span>
 *   </article>
 */
import { fetchHTML } from "./http";
import type { RawHotItem, Scraper } from "./types";

function parseTrending(html: string): RawHotItem[] {
  const items: RawHotItem[] = [];
  const now = new Date();
  const articleRegex = /<article\s+class="Box-row">[\s\S]*?<\/article>/g;
  const articles = html.match(articleRegex) ?? [];

  let rank = 0;
  for (const article of articles) {
    rank += 1;

    // 仓库 owner/repo —— 在 h2 的 a 标签里，href 可能不是第一个属性
    const repoMatch = article.match(
      /<h2\s+class="h3[^"]*">[\s\S]*?<a\b[^>]*\bhref="\/([^/"]+\/[^/"]+)"/,
    );
    if (!repoMatch) continue;
    const fullName = repoMatch[1];

    // 描述
    const descMatch = article.match(/<p\s+class="col-9[^"]*">([\s\S]*?)<\/p>/);
    const description = descMatch
      ? descMatch[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, " ")
          .trim()
      : "";

    // 主语言
    const langMatch = article.match(
      /<span\s+itemprop="programmingLanguage">([\s\S]*?)<\/span>/,
    );
    const language = langMatch ? langMatch[1].trim() : "";

    // 星标总数：stargazers 链接里的最后一个数字字符串
    const stargazersBlock = article.match(
      /<a\b[^>]*\bhref="\/[^"]+\/stargazers"[\s\S]*?<\/a>/,
    );
    let totalStars = 0;
    if (stargazersBlock) {
      // 移除标签，找连续数字（含逗号），取最后一个
      const cleaned = stargazersBlock[0].replace(/<[^>]+>/g, " ");
      const nums = cleaned.match(/[\d,]+/g);
      if (nums && nums.length > 0) {
        totalStars = parseInt(nums[nums.length - 1].replace(/,/g, ""), 10);
      }
    }

    // 今日新增 stars
    let todayStars = 0;
    const todayBlock = article.match(
      /<span\b[^>]*class="[^"]*float-sm-right[^"]*"[\s\S]*?<\/span>/,
    );
    if (todayBlock) {
      const cleaned = todayBlock[0].replace(/<[^>]+>/g, " ");
      const m = cleaned.match(/([\d,]+)\s+stars?\s+today/i);
      if (m) {
        todayStars = parseInt(m[1].replace(/,/g, ""), 10);
      }
    }

    items.push({
      platform: "github",
      title: fullName,
      url: `https://github.com/${fullName}`,
      metric: {
        totalStars,
        todayStars,
        language,
        description,
      },
      rank,
      fetchedAt: now,
    });
    if (items.length >= 25) break;
  }

  return items;
}

export const githubScraper: Scraper = {
  platform: "github",
  displayName: "GitHub Trending",
  async fetch() {
    const html = await fetchHTML("https://github.com/trending?since=daily");
    const items = parseTrending(html);
    if (items.length === 0) {
      throw new Error("GitHub: parser found no repos (HTML may have changed)");
    }
    return items;
  },
};
