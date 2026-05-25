/**
 * OpenRouter 客户端封装
 *
 * 设计要点：
 *  1. 单例 provider 实例（首次调用时懒加载，避免在没有 KEY 的环境（CI/SSG）启动时崩溃）
 *  2. 默认走 deepseek/deepseek-v3.2（对中文区域无访问限制 + 性价比最优）
 *  3. 开启 OpenRouter "response-healing" 插件 —— 当模型偶发性返回带 markdown 包裹/缺括号/多余文本
 *     的 JSON 时，OpenRouter 自动修复，配合 generateObject 的 Zod 校验形成双保险
 *
 * 参考（2026-05 已验证）：
 *  - https://www.npmjs.com/package/@openrouter/ai-sdk-provider v2.9.0
 *  - https://www.npmjs.com/package/ai v6.0.191
 */

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";
import { DEFAULT_MODEL_ID } from "./models";

let cachedProvider: ReturnType<typeof createOpenRouter> | null = null;

/**
 * 获取（或惰性创建）OpenRouter provider 实例
 * 错误抛在使用端，避免模块加载阶段崩溃
 */
function getProvider() {
  if (cachedProvider) return cachedProvider;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY 未配置 —— 请在 .env 中填入 OpenRouter API Key",
    );
  }

  cachedProvider = createOpenRouter({
    apiKey,
    // Application 头便于在 OpenRouter dashboard 区分流量
    headers: {
      "HTTP-Referer": process.env.AUTH_URL ?? "http://localhost:3000",
      "X-Title": "HotPulse · AI Hotspot Monitoring",
    },
  });
  return cachedProvider;
}

/**
 * 拿一个具体模型实例（可直接传给 ai SDK 的 generateText / generateObject）
 *
 * @param modelId OpenRouter 模型 ID，省略则用系统默认 deepseek/deepseek-v3.2
 * @example
 *   const model = getModel();
 *   const { object } = await generateObject({ model, schema, prompt });
 */
export function getModel(modelId?: string): LanguageModel {
  const provider = getProvider();
  return provider(modelId ?? DEFAULT_MODEL_ID, {
    // response-healing 仅对非流式请求生效；与 generateObject 配合最佳
    plugins: [{ id: "response-healing" }],
  });
}

/**
 * 是否已配置 API Key（不会触发 throw，可用于 UI 健康检查）
 */
export function hasOpenRouterKey(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}
