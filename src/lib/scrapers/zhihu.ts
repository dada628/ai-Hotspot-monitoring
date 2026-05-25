/**
 * 知乎热榜抓取器
 *
 * 接入策略（多层降级）：
 *   1. 先请求 https://www.zhihu.com/ 拿到 d_c0 cookie，再带 cookie 请求 API
 *   2. 失败则爬 https://www.zhihu.com/billboard 的内嵌 JSON（initialData）
 *   3. 再失败则用聚合 API https://60s.viki.moe/v2/zhihu
 */
import { fetchJSON, fetchHTML, fetchWithTimeout } from "./http";
import type { RawHotItem, Scraper } from "./types";

interface ZhihuApiResp {
  data?: Array<{
    target?: {
      id?: number | string;
      title?: string;
      url?: string;
      excerpt?: string;
    };
    detail_text?: string;
  }>;
}

interface FallbackResp {
  data?: Array<{
    title: string;
    hot?: number | string;
    url?: string;
    rank?: number;
  }>;
}

/** 解析诸如 "395 万热度" 形式为数字 */
function parseHeatText(text: string): number {
  const m = text.match(/([\d.]+)\s*(万|亿)?/);
  if (!m) return 0;
  const value = parseFloat(m[1]);
  if (m[2] === "亿") return value * 1e8;
  if (m[2] === "万") return value * 1e4;
  return value;
}

/** 策略 1：拿 cookie 再请求 API */
async function fetchViaApi(): Promise<RawHotItem[]> {
  // 第一步：访问首页，拿 set-cookie 中的 d_c0
  const homeRes = await fetchWithTimeout("https://www.zhihu.com/", {
    extraHeaders: { Referer: "https://www.zhihu.com/" },
  });
  const setCookie = homeRes.headers.get("set-cookie") ?? "";
  const dC0Match = setCookie.match(/d_c0=([^;]+)/);
  const cookieHeader = dC0Match ? `d_c0=${dC0Match[1]}` : "";

  const data = await fetchJSON<ZhihuApiResp>(
    "https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true",
    {
      extraHeaders: {
        Referer: "https://www.zhihu.com/hot",
        Cookie: cookieHeader,
        "x-requested-with": "fetch",
      },
    },
  );

  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new Error("Zhihu API: empty data");
  }

  const now = new Date();
  return data.data
    .filter((it) => it.target?.title)
    .map((it, idx) => {
      const target = it.target!;
      const heatText = it.detail_text ?? "";
      return {
        platform: "zhihu" as const,
        title: target.title!,
        url: `https://www.zhihu.com/question/${target.id}`,
        metric: {
          heat: parseHeatText(heatText),
          heatText,
          excerpt: target.excerpt ?? "",
        },
        rank: idx + 1,
        fetchedAt: now,
      };
    })
    .slice(0, 50);
}

/** 策略 2：解析 https://www.zhihu.com/billboard 内嵌的 initialData */
async function fetchViaBillboard(): Promise<RawHotItem[]> {
  const html = await fetchHTML("https://www.zhihu.com/billboard", {
    extraHeaders: { Referer: "https://www.zhihu.com/" },
  });
  const dataMatch = html.match(
    /<script\s+id="js-initialData"\s+type="text\/json">([\s\S]+?)<\/script>/,
  );
  if (!dataMatch) throw new Error("Zhihu billboard: initialData not found");

  let parsed: {
    initialState?: { topstory?: { hotList?: Array<Record<string, unknown>> } };
  };
  try {
    parsed = JSON.parse(dataMatch[1]);
  } catch {
    throw new Error("Zhihu billboard: JSON parse failed");
  }

  const list = parsed.initialState?.topstory?.hotList ?? [];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Zhihu billboard: hotList empty");
  }

  const now = new Date();
  const items: RawHotItem[] = [];
  list.forEach((raw, idx) => {
    const target = (raw as { target?: Record<string, unknown> }).target ?? {};
    const titleArea = (target as { titleArea?: { text?: string } }).titleArea
      ?.text;
    const link = (target as { link?: { url?: string } }).link?.url;
    const heatText =
      (target as { metricsArea?: { text?: string } }).metricsArea?.text ?? "";
    const excerpt =
      (target as { excerptArea?: { text?: string } }).excerptArea?.text ?? "";
    if (!titleArea) return;
    items.push({
      platform: "zhihu",
      title: titleArea,
      url: link ?? `https://www.zhihu.com/billboard#${idx + 1}`,
      metric: {
        heat: parseHeatText(heatText),
        heatText,
        excerpt,
      },
      rank: idx + 1,
      fetchedAt: now,
    });
  });
  return items.slice(0, 50);
}

/** 策略 3：公共聚合 API */
async function fetchViaAggregator(): Promise<RawHotItem[]> {
  const data = await fetchJSON<FallbackResp>("https://60s.viki.moe/v2/zhihu");
  if (!Array.isArray(data.data) || data.data.length === 0) {
    throw new Error("Zhihu aggregator: empty");
  }
  const now = new Date();
  return data.data.slice(0, 50).map((it, idx) => ({
    platform: "zhihu" as const,
    title: it.title,
    // 聚合 API 多数没返回 URL，用 search 链接以保证 (platform, url) 唯一
    url:
      it.url ??
      `https://www.zhihu.com/search?q=${encodeURIComponent(it.title)}`,
    metric: {
      heat:
        typeof it.hot === "number"
          ? it.hot
          : parseHeatText(String(it.hot ?? "")),
      heatText: String(it.hot ?? ""),
    },
    rank: it.rank ?? idx + 1,
    fetchedAt: now,
  }));
}

export const zhihuScraper: Scraper = {
  platform: "zhihu",
  displayName: "知乎热榜",
  async fetch() {
    try {
      return await fetchViaApi();
    } catch (err1) {
      console.warn("[scraper:zhihu] api strategy failed:", err1);
      try {
        return await fetchViaBillboard();
      } catch (err2) {
        console.warn("[scraper:zhihu] billboard strategy failed:", err2);
        return await fetchViaAggregator();
      }
    }
  },
};
