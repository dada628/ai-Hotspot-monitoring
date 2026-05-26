/**
 * B 站热门视频抓取器
 * 接口：https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1
 *
 * 2026-05-26 收紧：按 tname 字段做"科技分区"白名单过滤。
 *   用户决策：只保留「科技 + 知识」两个分区。
 *   - 科技：手机/数码/电脑/AI 产品评测
 *   - 知识：科普讲座、AI/编程/数学教程（如 3blue1brown、李沐讲机器学习）
 *   过滤后单次抓取 50 条预计保留 5-15 条真正科技/科普内容。
 */
import { fetchJSON } from "./http";
import { isBilibiliTechPartition } from "@/lib/tech-filter";
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
    // 先按"科技分区"白名单（tname）过滤，再保留前 50 条
    const techOnly = data.data.list.filter((it) =>
      isBilibiliTechPartition(it.tname),
    );

    return techOnly.slice(0, 50).map((it, idx) => ({
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
        publishedAt: it.pubdate ?? 0,
      },
      rank: idx + 1,
      fetchedAt: now,
    }));
  },
};
