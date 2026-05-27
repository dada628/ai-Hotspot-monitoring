/**
 * AI Pipeline · 摘要链（summarize）
 *
 * v9: 详情页长导读 200-500 字；输入除标题外增加各平台原文摘录（RSS snippet / github description 等）
 */

import { generateObject } from "ai";
import { getModel } from "../openrouter";
import { SummarySchema, type SummaryOutput } from "../schemas";

export interface SummarizeInput {
  title: string;
  category?: string | null;
  /** 多源场景下，各平台的原始标题 */
  sourceTitles?: Array<{ platform: string; rawTitle: string }>;
  /** v9: 各平台原文摘录（已过滤无效占位符） */
  sourceExcerpts?: Array<{ platform: string; excerpt: string }>;
}

const SYSTEM_PROMPT = `你是一名严谨的中文科技/新闻编辑，为热点话题写「详情页长导读」。

## 输入
- 主标题 + 可选的多平台原始标题
- 可选的「原文摘录」（来自 RSS 摘要、GitHub 项目描述等；可能不完整）

## 写作要求
1. summary 写 200-500 个中文字，分 4 层信息（可自然分段，不要用小标题编号）：
   - 这条热点是什么、在什么背景下出现
   - 核心内容：技术点、产品、事件细节（有摘录时务必用上）
   - 为什么值得关注：行业影响、争议点、时效性
   - 适合哪类读者跟进（开发者 / 架构师 / 关注 AI 政策者等）
2. 有原文摘录时：以摘录为事实基础展开，不要与摘录矛盾
3. 只有标题、无摘录时：基于标题做合理推断，但禁止捏造具体数字、人物原话、未出现的公司行为
4. 禁止：感叹号、营销腔、「网友热议」「引发轰动」「具体情况需后续披露」等空话
5. keyPoints 写 3-5 条，每条有实质信息（技术名词、结论、影响），不要复述 summary 第一句

严格按 JSON schema 输出。`;

export async function summarize(
  input: SummarizeInput,
  modelId?: string,
): Promise<SummaryOutput> {
  const lines: string[] = [`主标题：${input.title}`];
  if (input.category) lines.push(`分类：${input.category}`);

  if (input.sourceTitles?.length) {
    lines.push(`各平台原始标题：`);
    for (const s of input.sourceTitles) {
      lines.push(`  · [${s.platform}] ${s.rawTitle}`);
    }
  }

  if (input.sourceExcerpts?.length) {
    lines.push(`原文摘录（请优先据此写 summary）：`);
    for (const s of input.sourceExcerpts) {
      lines.push(`  · [${s.platform}] ${s.excerpt}`);
    }
  } else {
    lines.push(
      `（无原文摘录，仅标题可用 — 请从标题提取技术/事件关键词做深度解读，但仍禁止编造细节）`,
    );
  }

  const { object } = await generateObject({
    model: getModel(modelId),
    schema: SummarySchema,
    system: SYSTEM_PROMPT,
    prompt: `请为以下热点生成结构化长导读：\n${lines.join("\n")}`,
  });

  return object;
}
