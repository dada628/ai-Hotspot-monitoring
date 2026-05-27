/**
 * AI Pipeline 输出 Schema（Zod）
 *
 * 所有 prompt 链都通过 generateObject + 这些 schema 约束 LLM 输出。
 * 一处定义、多处复用：prompts/* 用于校验、TypeScript 类型用于业务消费。
 *
 * 注意：所有字段都加 .describe()，AI SDK 会把它们作为 JSON Schema 的 description
 * 传给模型，显著提升输出质量与稳定性。
 */

import { z } from "zod";

// ===== 共用枚举 =====

export const CATEGORY_VALUES = [
  "tech",
  "society",
  "entertainment",
  "finance",
  "sports",
  "culture",
  "science",
  "other",
] as const;

export type Category = (typeof CATEGORY_VALUES)[number];

/** category → 中文标签（前端 badge 用） */
export const CATEGORY_LABELS_ZH: Record<Category, string> = {
  tech: "科技",
  society: "社会",
  entertainment: "娱乐",
  finance: "财经",
  sports: "体育",
  culture: "文化",
  science: "科学",
  other: "其他",
};

// ===== 1. 分类 (classify) =====

export const ClassifySchema = z.object({
  category: z
    .enum(CATEGORY_VALUES)
    .describe("热点最贴近的主分类，必须是给定枚举之一"),
  tags: z
    .array(z.string().min(1).max(12))
    .max(5)
    .describe("2-5 个简短标签，中文优先，每个 ≤ 6 字。例如：[\"OpenAI\", \"GPT\", \"模型发布\"]"),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("分类置信度 0-1，越接近 1 越确定"),
});
export type ClassifyOutput = z.infer<typeof ClassifySchema>;

// ===== 2. 评分 (score) =====

export const ScoreSchema = z.object({
  score: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "综合热度评分 0-100。参考因素：跨平台热度规模、社会影响力、时效性、关注人群广度。" +
        "85+ = 紧急级（需要立刻关注的事件），70-84 = 重要，40-69 = 一般，<40 = 低关注度",
    ),
  reasoning: z
    .string()
    .max(160)
    .describe("简短的中文打分理由，1-2 句话，≤ 80 字"),
  trendVelocity: z
    .number()
    .min(0)
    .max(100)
    .describe(
      "爆发速度 0-100：判断这条热点是处于'刚起'/'上升'/'见顶'/'下行'。" +
        "0-20=平稳/已过气，20-50=温和上升，50-80=快速上升，80-100=正在爆发",
    ),
});
export type ScoreOutput = z.infer<typeof ScoreSchema>;

// ===== 3. 摘要 (summarize) =====

export const SummarySchema = z.object({
  summary: z
    .string()
    .min(80)
    .max(800)
    .describe(
      "中文长导读 200-500 字（详情页阅读用）。结构：①背景/来龙去脉 ②核心内容（技术点/事件细节）③重要性或影响 ④适合谁关注。" +
        "有『原文摘录』时优先基于摘录展开；只有标题时基于标题做合理推断，但禁止编造具体数字/引语。" +
        "禁止营销腔、感叹号、'网友热议'类套话。技术类要写清技术名词与场景。",
    ),
  keyPoints: z
    .array(z.string().min(2).max(80))
    .min(3)
    .max(5)
    .describe("3-5 条关键信息点，每条一句话 ≤ 50 字，覆盖事实/技术点/影响"),
  entities: z
    .array(z.string().min(1).max(30))
    .max(8)
    .describe("出现的关键实体：人物 / 机构 / 产品 / 地名，最多 8 个"),
});
export type SummaryOutput = z.infer<typeof SummarySchema>;

// ===== 通用：标记某条热点已被 AI Pipeline 处理过 =====

/**
 * 一次完整的 AI 处理产出（写回 HotSpot 表）
 *
 * 注：v1 不做 dedupe，每条 HotSpot 独立处理，这个结构对应单条
 */
export interface AiEnrichedFields {
  category: Category;
  tags: string[];
  score: number;
  trendVelocity: number;
  summary: string;
  keyPoints: string[];
  entities: string[];
}
