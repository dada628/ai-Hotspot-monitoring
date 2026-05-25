/**
 * 本地兜底评分（engagementScore）
 *
 * 设计目标：
 *   - AI Pipeline（Phase 3）上线前，提供一个稳定的 0-100 排序依据
 *   - 各平台**互动量级差异巨大**（微博热度 ≈ 1e7，HN score ≈ 几百），必须**分平台归一化**
 *   - 使用 log10 缩放避免少量爆款霸榜
 *   - 加 24h 时间衰减：每过 24h 扣 5 分，下限 30
 *
 * AI Pipeline 出 score 后，该字段不再使用（前端优先 score，回退 engagementScore）
 */

import type { Platform } from "@/lib/scrapers";

/**
 * 单平台计分公式：
 *   raw = 主指标量（如 likes/views/score）
 *   base = log10(raw + 1) × multiplier
 *   cap 上限
 */
interface PlatformFormula {
  /** 从 metric 中提取主互动量；返回 0 表示无数据 */
  pickPrimary: (m: Record<string, unknown>) => number;
  /** log10 倍数 */
  multiplier: number;
  /** 上限 */
  cap: number;
}

const FORMULAS: Record<string, PlatformFormula> = {
  // 微博热度通常 1e5 ~ 1e7 → log10 = 5~7 → ×12 = 60~84
  weibo: {
    pickPrimary: (m) => num(m.heat) || num(m.reads),
    multiplier: 12,
    cap: 90,
  },
  // 知乎热度 1e4 ~ 1e7 → log10 = 4~7
  zhihu: {
    pickPrimary: (m) => num(m.heat) || num(m.followers),
    multiplier: 12,
    cap: 88,
  },
  // B 站播放 1e4 ~ 1e7 → log10 = 4~7
  bilibili: {
    pickPrimary: (m) => num(m.views) || num(m.plays),
    multiplier: 11,
    cap: 80,
  },
  // GitHub trending：当日 star 增量，典型 50 ~ 5000 → log10 = 1.7~3.7 → ×20 = 34~74
  github: {
    pickPrimary: (m) => num(m.todayStars) || num(m.stars),
    multiplier: 18,
    cap: 85,
  },
  // Twitter likes：典型 200 ~ 50000 → log10 = 2.3~4.7 → ×14 = 32~66；权重低于"全网热点"
  twitter: {
    pickPrimary: (m) => num(m.likes) + 0.3 * num(m.retweets),
    multiplier: 14,
    cap: 70,
  },
  // HN score 典型 50 ~ 500 → log10 = 1.7~2.7 → ×28 = 47~75
  hackernews: {
    pickPrimary: (m) => num(m.score) + 0.5 * num(m.comments),
    multiplier: 25,
    cap: 88,
  },
  // Reddit upvotes 典型 100 ~ 5000 → log10 = 2~3.7 → ×20 = 40~74
  reddit: {
    pickPrimary: (m) => num(m.upvotes) || num(m.score),
    multiplier: 20,
    cap: 82,
  },
  // Google News 没有互动量，用排名兜底（rank 1 = 50 分，rank 20 = 28 分）
  googlenews: {
    pickPrimary: (m) => 100 - num(m.rank) * 2.5,
    multiplier: 1,
    cap: 55,
  },
  // InfoQ RSS 也没互动量，用排名兜底
  infoq: {
    pickPrimary: (m) => 100 - num(m.rank) * 2.5,
    multiplier: 1,
    cap: 55,
  },
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * 计算单条 source 的兜底分（0-100）
 *
 * @param platform 平台 key
 * @param metric JSON 反序列化后的 metric 对象
 * @param fetchedAt 抓取时间，用于时间衰减
 */
export function calcEngagementScore(
  platform: string,
  metric: Record<string, unknown>,
  fetchedAt: Date = new Date(),
): number {
  const f = FORMULAS[platform];
  if (!f) return 0;

  const raw = f.pickPrimary(metric);
  if (raw <= 0) return 0;

  // 对 raw 已是分数形式（Google News）不再 log10
  const isAlreadyScore = f.multiplier === 1;
  const base = isAlreadyScore
    ? Math.max(0, raw)
    : Math.log10(raw + 1) * f.multiplier;

  // 时间衰减：每过 24h 扣 5 分，下限 30
  const ageHours = Math.max(0, (Date.now() - fetchedAt.getTime()) / 3_600_000);
  const decay = Math.min(60, Math.floor(ageHours / 24) * 5);
  const decayed = Math.max(30, base - decay);

  return Math.min(f.cap, Math.round(decayed));
}

/**
 * 当一个 HotSpot 有多个 source 时，取最高的 engagementScore
 */
export function maxEngagementScore(
  sources: Array<{ platform: string; metric: string; fetchedAt: Date }>,
): number {
  let max = 0;
  for (const s of sources) {
    let m: Record<string, unknown> = {};
    try {
      m = JSON.parse(s.metric || "{}");
    } catch {
      m = {};
    }
    const score = calcEngagementScore(s.platform, m, s.fetchedAt);
    if (score > max) max = score;
  }
  return max;
}

/**
 * 测试/调试用：返回所有支持的平台
 */
export const SCORED_PLATFORMS: Platform[] = Object.keys(
  FORMULAS,
) as Platform[];
