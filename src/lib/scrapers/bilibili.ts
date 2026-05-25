/**
 * B 站热门视频抓取器
 * 接口：https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1
 */
import { fetchJSON } from "./http";
import type { RawHotItem, Scraper } from "./types";

interface BiliResp {
  code: number;
  data?: {
    list?: Array<{
      aid: number;
      bvid: string;
      title: string;
      desc?: string;
      owner?: {
        name?: string;
        mid?: number;
      };
      stat?: {
        view?: number;
        like?: number;
        coin?: number;
        favorite?: number;
        share?: number;
        reply?: number;
        danmaku?: number;
      };
      tname?: string;
      pubdate?: number;
    }>;
  };
}

export const bilibiliScraper: Scraper = {
  platform: "bilibili",
  displayName: "B 站热门",
  async fetch() {
    const url = "https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1";

    const data = await fetchJSON<BiliResp>(url, {
      extraHeaders: {
        Referer: "https://www.bilibili.com/v/popular/all",
      },
    });

    if (data.code !== 0 || !Array.isArray(data.data?.list)) {
      throw new Error(`Bilibili: bad response code=${data.code}`);
    }

    const now = new Date();
    return data.data.list.slice(0, 50).map((it, idx) => ({
      platform: "bilibili" as const,
      title: it.title,
      url: `https://www.bilibili.com/video/${it.bvid}`,
      metric: {
        view: it.stat?.view ?? 0,
        like: it.stat?.like ?? 0,
        reply: it.stat?.reply ?? 0,
        coin: it.stat?.coin ?? 0,
        favorite: it.stat?.favorite ?? 0,
        share: it.stat?.share ?? 0,
        danmaku: it.stat?.danmaku ?? 0,
        author: it.owner?.name ?? "",
        category: it.tname ?? "",
      },
      rank: idx + 1,
      fetchedAt: now,
    }));
  },
};
