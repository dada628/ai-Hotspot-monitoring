/**
 * 相关性 Judge · LLM 判官
 *
 * 输入：用户搜索词 query + 热点 title/summary
 * 输出：tier / score / directMention / reason
 *
 * 供 scripts/relevance-eval/run.ts 批量评估；未来可并入 Pipeline（P2）。
 */

import { generateObject } from "ai";
import { getModel } from "./openrouter";
import {
  RelevanceJudgeSchema,
  type RelevanceJudgeOutput,
} from "./relevance-schemas";

export interface RelevanceJudgeInput {
  query: string;
  title: string;
  summary?: string | null;
}

const SYSTEM_PROMPT = `你是中文热点信息流的相关性审核员。
用户会在搜索框输入查询词 query，系统展示热点条目（标题 + 可选摘要）。
你的任务：判断该条目与用户 query 的相关程度。

分级标准（三选一，必须严格执行）：
1. direct（直接相关）
   - 标题或摘要中**明确出现** query 原文，或业界公认的别名/写法变体。
   - 例：query=DeepSeek → 标题含「DeepSeek」「深度求索」；query=GPT-Codex-5.3 → 含「Codex 5.3」「GPT-Codex」。
   - 仅 tag/分类暗示、未点名 query → 不是 direct。

2. related（关联相关）
   - 与 query 同属一条技术/产品脉络，但**未直接点名** query。
   - 例：query=OpenAI，标题讲「Anthropic 发布 Claude 4」→ related。
   - 例：query=RAG，标题讲「向量数据库 Pinecone 融资」→ related。

3. irrelevant（不相关）
   - 与 query 无实质关联；或仅泛泛「AI/科技/互联网」而无 query 所指对象。
   - 例：query=DeepSeek，标题「今日全国天气预报」→ irrelevant。
   - 子串误命中不算：query=AI 时，英文 "said"/"paid" 不含 AI 语义 → irrelevant。

directMention：仅当标题/摘要有 query 或公认别名时为 true。
score：direct 通常 75-100；related 40-74；irrelevant 0-35。
输出严格符合 JSON schema，不要额外文字。`;

export async function judgeRelevance(
  input: RelevanceJudgeInput,
  modelId?: string,
): Promise<RelevanceJudgeOutput> {
  const summaryBlock = input.summary?.trim()
    ? `\n摘要：${input.summary.trim()}`
    : "\n摘要：（无）";

  const { object } = await generateObject({
    model: getModel(modelId),
    schema: RelevanceJudgeSchema,
    system: SYSTEM_PROMPT,
    prompt: `查询词 query：${input.query}\n标题：${input.title}${summaryBlock}`,
  });

  return object;
}
