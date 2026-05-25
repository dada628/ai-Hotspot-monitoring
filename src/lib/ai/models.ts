/**
 * AI 模型目录（OpenRouter 模型 ID）
 *
 * 设计原则：
 *  1. 默认仅推荐对中国大陆区域无访问限制的国产模型族
 *     （DeepSeek / Qwen / GLM / Kimi），避免 GPT-4o、Claude 等海外模型的区域阻断。
 *  2. 价格 / 性能 / 中文能力做了分档，让用户在设置页可自由切换。
 *  3. 所有模型都通过 OpenRouter (https://openrouter.ai) 统一调用，
 *     接入方式一致；切换时只需修改 model id 字符串。
 *
 * 文档参考（2026-05）：https://openrouter.ai/models
 */

export type ModelTier = "fast" | "balanced" | "smart" | "reasoning";
export type ModelFamily = "DeepSeek" | "Qwen" | "GLM" | "Kimi";

export interface ModelCard {
  /** OpenRouter 上的模型 ID（调用时传入） */
  id: string;
  /** 展示名 */
  label: string;
  /** 模型家族 */
  family: ModelFamily;
  /** 性能档位 */
  tier: ModelTier;
  /** 中文能力（A/A+/S 等主观评级） */
  chineseRating: string;
  /** $ / M output token 估算（USD） */
  pricePerMOutput: number;
  /** 是否推荐作为默认 */
  recommended?: boolean;
  /** 简短描述 */
  description: string;
  /** 上下文长度（K） */
  contextK: number;
}

export const MODEL_CATALOG: ModelCard[] = [
  // ============ DeepSeek 系列 ============
  {
    id: "deepseek/deepseek-v3.2",
    label: "DeepSeek V3.2",
    family: "DeepSeek",
    tier: "balanced",
    chineseRating: "S",
    pricePerMOutput: 1.1,
    recommended: true,
    description: "性价比最优，强中文 / 推理 / 工具调用；本系统默认模型",
    contextK: 128,
  },
  {
    id: "deepseek/deepseek-v3.1-terminus",
    label: "DeepSeek V3.1 Terminus",
    family: "DeepSeek",
    tier: "balanced",
    chineseRating: "A+",
    pricePerMOutput: 1.0,
    description: "上一代稳定旗舰，长上下文 128K",
    contextK: 128,
  },

  // ============ Qwen 系列 ============
  {
    id: "qwen/qwen3-32b",
    label: "Qwen3 32B",
    family: "Qwen",
    tier: "balanced",
    chineseRating: "A+",
    pricePerMOutput: 0.28,
    description: "阿里通义千问 · 通用任务高性价比",
    contextK: 128,
  },
  {
    id: "qwen/qwen-plus",
    label: "Qwen Plus",
    family: "Qwen",
    tier: "smart",
    chineseRating: "A+",
    pricePerMOutput: 1.6,
    description: "强中文写作 / 摘要",
    contextK: 128,
  },

  // ============ Zhipu GLM 系列 ============
  {
    id: "z-ai/glm-4.5",
    label: "GLM-4.5",
    family: "GLM",
    tier: "balanced",
    chineseRating: "S",
    pricePerMOutput: 1.92,
    description: "智谱 GLM · 中文场景胜过 GPT-4o（实测 94% vs 89%）",
    contextK: 128,
  },
  {
    id: "z-ai/glm-4.5-air",
    label: "GLM-4.5 Air",
    family: "GLM",
    tier: "fast",
    chineseRating: "A",
    pricePerMOutput: 0.2,
    description: "轻量低成本，适合批量分类 / 去重",
    contextK: 128,
  },

  // ============ Kimi 系列 ============
  {
    id: "moonshotai/kimi-k2",
    label: "Kimi K2",
    family: "Kimi",
    tier: "smart",
    chineseRating: "S",
    pricePerMOutput: 3.0,
    description: "月之暗面 · 超长上下文 (200K+)",
    contextK: 256,
  },
];

/** 默认模型 ID —— 与 Prisma User.preferredModel 默认值保持一致 */
export const DEFAULT_MODEL_ID = "deepseek/deepseek-v3.2";

/** 找一个模型，找不到则返回默认 */
export function getModelCard(id: string): ModelCard {
  return (
    MODEL_CATALOG.find((m) => m.id === id) ??
    MODEL_CATALOG.find((m) => m.id === DEFAULT_MODEL_ID)!
  );
}

/** 按 tier 分组 */
export function byTier(tier: ModelTier): ModelCard[] {
  return MODEL_CATALOG.filter((m) => m.tier === tier);
}
