/** v9 之前 AI 摘要通常 <150 字；低于此阈值视为可单条重跑长导读 */
export const LEGACY_SUMMARY_MAX_LEN = 150;

export type SingleAiActionLabel = "AI 处理" | "生成长导读";

export interface SingleAiAction {
  label: SingleAiActionLabel;
}

/**
 * 是否应在首页卡片 / 详情页展示单条 AI 按钮。
 * - 未处理（无 processedAt）→ 「AI 处理」
 * - 已处理但仍为 v9 前短摘要 → 「生成长导读」（API ids= 可重跑）
 */
export function getSingleAiAction(opts: {
  processedAt: string | null;
  summary?: string | null;
}): SingleAiAction | null {
  if (!opts.processedAt) {
    return { label: "AI 处理" };
  }
  const len = (opts.summary ?? "").trim().length;
  if (len > 0 && len < LEGACY_SUMMARY_MAX_LEN) {
    return { label: "生成长导读" };
  }
  return null;
}
