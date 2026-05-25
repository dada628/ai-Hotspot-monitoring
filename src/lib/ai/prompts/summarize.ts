/**
 * AI Pipeline · 摘要链（summarize）
 *
 * 输入：标题 + 多源原始标题（用于补全语境）
 * 输出：50-200 字中文摘要 + 3-5 条 keyPoints + ≤ 8 个关键实体
 *
 * 设计要点：
 *  - 我们只有标题（没爬正文），所以 prompt 要明确告诉 AI "基于标题做合理推断、不要瞎编"
 *  - 严禁感叹号、营销腔、"网友热议"之类的废话（已写在 schema describe 中）
 *  - 多个源时把各平台原始标题拼起来给 AI，让它综合信息
 */

import { generateObject } from "ai";
import { getModel } from "../openrouter";
import { SummarySchema, type SummaryOutput } from "../schemas";

export interface SummarizeInput {
  title: string;
  category?: string | null;
  /** 多源场景下，各平台的原始标题（用于丰富上下文） */
  sourceTitles?: Array<{ platform: string; rawTitle: string }>;
}

const SYSTEM_PROMPT = `你是一名严谨的中文新闻编辑，负责为热点话题写结构化摘要。

输入限制：你只能看到标题（可能多源），看不到原文正文。
因此：
1. 不要捏造细节（具体数字、人物对话、地点）
2. 可以做合理的语境推断，但要保持客观、克制
3. 摘要本身写"发生了什么"+"关键背景"，禁止"网友热议""引发轰动"等套话
4. 不用感叹号，语气平静

输出三部分：
- summary：50-200 中文字
- keyPoints：3-5 条要点，每条 ≤ 30 字
- entities：人物 / 机构 / 产品 / 地名，最多 8 个

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

  const { object } = await generateObject({
    model: getModel(modelId),
    schema: SummarySchema,
    system: SYSTEM_PROMPT,
    prompt: `请为以下热点生成结构化摘要：\n${lines.join("\n")}`,
  });

  return object;
}
