/**
 * 微博热搜抓取器
 * 主接口：https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot
 * 备用接口：https://60s.viki.moe/v2/weibo
 *
 * 2026-05-26 收紧：用户决策"信息都跟科技相关"。
 *   两路返回前都套 isTechRelated(title) 过滤；微博热搜默认 ~85% 是娱乐/社会，过滤后预计保留 0-8 条。
 */
import { fetchJSON } from "./http";
import { isTechRelated } from "@/lib/tech-filter";
import type { RawHotItem, Scraper } from "./types";

interface WeiboMobileResp {
  ok: number;
  data?: {
    cards?: Array<{
      card_group?: Array<{
        desc?: string;
        desc_extr?: number | string;
        scheme?: string;
        promotion?: { type?: string };
      }>;
    }>;
  };
}

interface FallbackResp {
  data?: Array<{
    title: string;
    hot_value?: number;
    link?: string;
    rank?: number;
  }>;
}

async function fetchPrimary(): Promise<RawHotItem[]> {
  // containerid 编码后的值 = "106003type=25&t=3&disable_hot=1&filter_type=realtimehot"
  const url =
    "https://m.weibo.cn/api/container/getIndex?containerid=106003type%3D25%26t%3D3%26disable_hot%3D1%26filter_type%3Drealtimehot";

  const data = await fetchJSON<WeiboMobileResp>(url, {
    extraHeaders: {
      Referer: "https://m.weibo.cn/",
      "MWeibo-Pwa": "1",
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  if (data.ok !== 1 || !data.data?.cards?.[0]?.card_group) {
    throw new Error("Weibo primary: invalid response shape");
  }

  const group = data.data.cards[0].card_group;
  const items: RawHotItem[] = [];
  const now = new Date();
  let rank = 0;

  for (const card of group) {
    if (!card.desc) continue;
    // 跳过推广条目
    if (card.promotion?.type) continue;
    rank += 1;
    const title = card.desc;
    const hot =
      typeof card.desc_extr === "number"
        ? card.desc_extr
        : typeof card.desc_extr === "string"
          ? parseInt(card.desc_extr.replace(/\D/g, ""), 10) || 0
          : 0;

    items.push({
      platform: "weibo",
      title,
      url:
        card.scheme ??
        `https://s.weibo.com/weibo?q=${encodeURIComponent("#" + title + "#")}`,
      metric: { hotValue: hot },
      rank,
      fetchedAt: now,
    });
    if (items.length >= 50) break;
  }

  if (items.length === 0) {
    throw new Error("Weibo primary: empty list");
  }
  return items;
}

async function fetchFallback(): Promise<RawHotItem[]> {
  const data = await fetchJSON<FallbackResp>("https://60s.viki.moe/v2/weibo");
  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new Error("Weibo fallback: empty");
  }

  const now = new Date();
  return data.data.slice(0, 50).map((it, idx) => ({
    platform: "weibo" as const,
    title: it.title,
    url:
      it.link ??
      `https://s.weibo.com/weibo?q=${encodeURIComponent("#" + it.title + "#")}`,
    metric: { hotValue: it.hot_value ?? 0 },
    rank: it.rank ?? idx + 1,
    fetchedAt: now,
  }));
}

export const weiboScraper: Scraper = {
  platform: "weibo",
  displayName: "微博热搜",
  async fetch() {
    let raw: RawHotItem[];
    try {
      raw = await fetchPrimary();
    } catch (err) {
      console.warn("[scraper:weibo] primary failed, fallback:", err);
      raw = await fetchFallback();
    }
    // 源头白名单：仅保留命中科技关键词的热搜
    return raw.filter((it) => isTechRelated(it.title));
  },
};
