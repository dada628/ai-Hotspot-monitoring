/**
 * generateObject 包装：schema 失败时带错误摘要重试 + 可选归一化后再校验。
 */

import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import type { z } from "zod";

export interface GenerateWithRetryOptions<S extends z.ZodTypeAny> {
  model: LanguageModel;
  schema: S;
  system: string;
  prompt: string;
  maxAttempts?: number;
  /** 校验失败时追加给模型的硬性约束说明 */
  repairHints?: string;
  normalize?: (obj: z.infer<S>) => z.infer<S>;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export async function generateWithRetry<S extends z.ZodTypeAny>(
  opts: GenerateWithRetryOptions<S>,
): Promise<z.infer<S>> {
  const maxAttempts = opts.maxAttempts ?? 3;
  const basePrompt = opts.prompt;
  let prompt = basePrompt;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { object } = await generateObject({
        model: opts.model,
        schema: opts.schema,
        system: opts.system,
        prompt,
      });

      const candidate = opts.normalize ? opts.normalize(object) : object;
      const parsed = opts.schema.safeParse(candidate);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new Error(`归一化后仍不符合 schema：${issues}`);
      }
      return parsed.data;
    } catch (err) {
      lastError = err;
      if (attempt >= maxAttempts) break;

      const msg = errorMessage(err);
      prompt = `${basePrompt}

【第 ${attempt} 次输出未通过 JSON schema 校验，请严格修正后重试】
错误摘要：${msg}
${opts.repairHints ?? "请逐字段对照 schema 的 min/max/条数要求。"}`;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(errorMessage(lastError));
}
