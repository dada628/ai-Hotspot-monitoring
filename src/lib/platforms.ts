/**
 * 统一的平台元信息（颜色 / 标签 / 度量字段）
 * 同时在前端和后端使用
 */

export type PlatformKey =
  | "weibo"
  | "zhihu"
  | "bilibili"
  | "github"
  | "twitter"
  | "hackernews";

export interface PlatformMeta {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  metricLabel: string;
}

export const PLATFORM_META: Record<PlatformKey, PlatformMeta> = {
  weibo: {
    label: "微博",
    shortLabel: "WB",
    color: "#ff6b9d",
    bgColor: "rgba(255, 107, 157, 0.12)",
    metricLabel: "热度值",
  },
  zhihu: {
    label: "知乎",
    shortLabel: "ZH",
    color: "#3b9eff",
    bgColor: "rgba(59, 158, 255, 0.12)",
    metricLabel: "热度",
  },
  bilibili: {
    label: "Bilibili",
    shortLabel: "BL",
    color: "#ff8edc",
    bgColor: "rgba(255, 142, 220, 0.12)",
    metricLabel: "播放量",
  },
  github: {
    label: "GitHub",
    shortLabel: "GH",
    color: "#c084fc",
    bgColor: "rgba(192, 132, 252, 0.12)",
    metricLabel: "Stars",
  },
  twitter: {
    label: "Twitter",
    shortLabel: "TW",
    color: "#1da1f2",
    bgColor: "rgba(29, 161, 242, 0.12)",
    metricLabel: "互动",
  },
  hackernews: {
    label: "HackerNews",
    shortLabel: "HN",
    color: "#ff7043",
    bgColor: "rgba(255, 112, 67, 0.12)",
    metricLabel: "分数",
  },
};

export const ALL_PLATFORMS: PlatformKey[] = [
  "weibo",
  "zhihu",
  "bilibili",
  "github",
  "twitter",
  "hackernews",
];
