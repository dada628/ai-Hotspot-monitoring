/**
 * AI Pipeline · 分类链（classify）
 *
 * 输入：一条热点的标题 + 可选的多源信息
 * 输出：category（8 枚举之一）+ 2-5 个中文标签 + 置信度
 *
 * 设计要点：
 *  - 短 prompt、低 token、单条独立处理（与去重无关）
 *  - 系统级 prompt 约束输出风格；用户 prompt 只塞事实
 *  - 失败时直接抛错，让 pipeline 决定是否跳过此条
 */

import { generateObject } from "ai";
import { getModel } from "../openrouter";
import { ClassifySchema, type ClassifyOutput } from "../schemas";

export interface ClassifyInput {
  title: string;
  /** 该热点已经出现在哪些平台（用于辅助 AI 判断领域，例如全在 GitHub 通常是 tech） */
  platforms?: string[];
}

const SYSTEM_PROMPT = `你是一名中文热点话题分类专家。
任务：根据用户提供的热点标题与来源，输出严格符合 JSON schema 的分类结果。

分类标准（8 选 1）：
- tech：科技产品、编程、AI、互联网公司、数码、芯片
- science：科研突破、医学、天文、物理、生物学
- society：社会民生、政策法规、突发事件、教育、城市
- finance：股市、加密货币、宏观经济、企业财报、商业并购
- entertainment：影视、综艺、游戏、明星、网红
- sports：体育赛事、运动员、电竞
- culture：文学、艺术、历史、宗教、传统文化
- other：以上都不贴切

约束：
- tags 至少 2 个，至多 5 个，中文优先，每个 ≤ 6 字
- confidence 反映真实把握度，不要总输出 0.95+
- 严格按 schema 输出，不要任何额外文字`;

export async function classify(
  input: ClassifyInput,
  modelId?: string,
): Promise<ClassifyOutput> {
  const platformLine = input.platforms?.length
    ? `\n出现平台：${input.platforms.join("、")}`
    : "";

  const { object } = await generateObject({
    model: getModel(modelId),
    schema: ClassifySchema,
    system: SYSTEM_PROMPT,
    prompt: `请对以下热点分类：\n标题：${input.title}${platformLine}`,
  });

  return object;
}
