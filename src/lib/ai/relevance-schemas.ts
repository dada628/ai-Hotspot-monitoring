/**
 * 相关性 Judge · Zod Schema
 *
 * 用于「用户搜索词 q + 热点 title/summary」的语义相关性评估（P1 eval 套件）。
 * 与 tech-filter（科技宽口径）分离：此处只回答「与本次 query 的关系」。
 */

import { z } from "zod";

export const RELEVANCE_TIER_VALUES = [
  "direct",
  "related",
  "irrelevant",
] as const;

export type RelevanceTier = (typeof RELEVANCE_TIER_VALUES)[number];

export const RelevanceJudgeSchema = z.object({
  tier: z
    .enum(RELEVANCE_TIER_VALUES)
    .describe(
      "direct=标题或摘要明确出现查询词或其公认别名；related=同主题但未直接点名查询词；irrelevant=与查询无关或仅泛泛提及行业",
    ),
  score: z
    .number()
    .min(0)
    .max(100)
    .describe("0-100 相关度连续分；direct 通常 ≥75，irrelevant 通常 ≤35"),
  directMention: z
    .boolean()
    .describe(
      "查询词（或公认别名/型号写法变体，如 GPT-Codex-5.3 与 Codex 5.3）是否在标题或摘要中被明确提及",
    ),
  reason: z
    .string()
    .min(8)
    .max(200)
    .describe("一句话中文理由，说明 tier 与 directMention 的判断依据"),
});

export type RelevanceJudgeOutput = z.infer<typeof RelevanceJudgeSchema>;

/** golden.jsonl 单条（人工标注） */
export const GoldenCaseSchema = z.object({
  id: z.string().min(1),
  query: z.string().min(1),
  title: z.string().min(1),
  summary: z.string().optional(),
  expectedTier: z.enum(RELEVANCE_TIER_VALUES),
  notes: z.string().optional(),
});

export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
