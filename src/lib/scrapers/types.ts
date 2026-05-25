/**
 * 抓取层统一接口与类型
 */

export type Platform =
  | "weibo"
  | "zhihu"
  | "bilibili"
  | "github"
  | "twitter"
  | "hackernews";

/**
 * 单条抓取到的原始热点条目（归一化后）
 */
export interface RawHotItem {
  /** 平台来源 */
  platform: Platform;
  /** 平台原始标题/关键词 */
  title: string;
  /** 详情链接 */
  url: string;
  /** 平台维度的热度指标（每个平台结构不同，统一序列化为 JSON） */
  metric: Record<string, number | string | undefined>;
  /** 平台内的排名（1-based，若有） */
  rank?: number;
  /** 抓取的时间戳 */
  fetchedAt: Date;
}

/**
 * 单次抓取的执行结果
 */
export interface ScrapeResult {
  platform: Platform;
  status: "success" | "failed" | "partial";
  items: RawHotItem[];
  /** 用时（毫秒） */
  durationMs: number;
  /** 错误信息（失败/部分失败时存在） */
  errorMsg?: string;
}

/**
 * 抓取器接口
 */
export interface Scraper {
  platform: Platform;
  /** 平台展示名 */
  displayName: string;
  /** 实际抓取实现 */
  fetch: () => Promise<RawHotItem[]>;
}
