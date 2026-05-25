/**
 * AI Pipeline · 评分链（score）
 *
 * 输入：热点的标题 + 多平台 metric + 已有的本地兜底分 + 时间维度
 * 输出：综合 score(0-100) + 一句中文打分理由 + trendVelocity(爆发速度)
 *
 * 设计要点：
 *  - AI 出 score 后会覆盖前端展示的 effectiveScore（覆盖 engagementScore）
 *  - 把 metric 简化成易读的字符串再喂给模型，避免 LLM 处理 JSON 数字格式时翻车
 *  - 把本地兜底分（engagementHint）作为"基线参考"传给 AI，让它在此基础上调整
 */

import { generateObject } from "ai";
import { getModel } from "../openrouter";
import { ScoreSchema, type ScoreOutput } from "../schemas";

export interface ScoreInputMetric {
  platform: string;
  /** 该平台的主互动量（已格式化为人类可读，例如 "微博热度 8.5万"、"GitHub ★ 1234"） */
  display: string;
}

export interface ScoreInput {
  title: string;
  /** AI 已写好的摘要（可空），有助于 AI 评估事件重要度 */
  summary?: string | null;
  category?: string | null;
  metrics?: ScoreInputMetric[];
  /** 距离首次发现的小时数；越久越要降权 */
  ageHours?: number;
  /** 本地兜底分（0-100），作为基线给 AI 参考 */
  engagementHint?: number;
}

const SYSTEM_PROMPT = `你是一名资深热点编辑，需要为热点综合打分。

评分维度（综合权衡，不要单一因素决定）：
1. 事件本身的社会影响力（重大事故、政策、行业里程碑 ≫ 八卦闲谈）
2. 跨平台覆盖度（多平台同时讨论 > 单平台）
3. 互动量级（百万级讨论 > 千级）
4. 时效性（新鲜事件加分，超过 24h 适度降权）
5. 关注人群广度（全民关注 > 小圈层）

分档参考：
- 90-100：举国关注 / 行业地震级事件
- 75-89：明显重要、值得追踪
- 55-74：值得一看，但不紧急
- 35-54：小众或边缘信息
- 0-34：噪音、营销稿、过期信息

trendVelocity 单独评估"现在还在涨吗"：
- 80-100：正在爆发（刚起、热度还在攀升）
- 50-79：快速上升
- 20-49：温和上升 / 见顶
- 0-19：平稳 / 已过气

严格按 schema 输出 JSON，理由控制在 1-2 句、≤ 80 字。`;

export async function score(
  input: ScoreInput,
  modelId?: string,
): Promise<ScoreOutput> {
  const lines: string[] = [`标题：${input.title}`];

  if (input.category) lines.push(`已分类：${input.category}`);
  if (input.summary) lines.push(`摘要：${input.summary}`);

  if (input.metrics?.length) {
    lines.push(`平台互动：`);
    for (const m of input.metrics) {
      lines.push(`  · ${m.platform}：${m.display}`);
    }
  }
  if (typeof input.ageHours === "number") {
    lines.push(`首次出现：约 ${input.ageHours.toFixed(1)} 小时前`);
  }
  if (typeof input.engagementHint === "number" && input.engagementHint > 0) {
    lines.push(
      `本地兜底分（仅供参考，可自行调高/调低）：${input.engagementHint.toFixed(0)}`,
    );
  }

  const { object } = await generateObject({
    model: getModel(modelId),
    schema: ScoreSchema,
    system: SYSTEM_PROMPT,
    prompt: `请对以下热点综合打分：\n${lines.join("\n")}`,
  });

  return object;
}
