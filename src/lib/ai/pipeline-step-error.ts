/** AI Pipeline 某一步（classify / summarize / score）失败时抛出，便于 API 与前端展示步骤 */
export type PipelineStepName = "classify" | "summarize" | "score";

const STEP_LABEL_ZH: Record<PipelineStepName, string> = {
  classify: "分类",
  summarize: "长导读",
  score: "评分",
};

export class PipelineStepError extends Error {
  readonly step: PipelineStepName;

  constructor(step: PipelineStepName, detail: string) {
    super(`${step}: ${detail}`);
    this.name = "PipelineStepError";
    this.step = step;
  }
}

export function formatPipelineStepError(step: PipelineStepName, detail: string): string {
  const label = STEP_LABEL_ZH[step] ?? step;
  const clean = detail.replace(/^(classify|summarize|score):\s*/i, "");
  return `失败步骤：${label} — ${clean}`;
}

export function parsePipelineStepFromMessage(msg: string): PipelineStepName | null {
  const m = /^(classify|summarize|score):/i.exec(msg.trim());
  if (!m) return null;
  return m[1].toLowerCase() as PipelineStepName;
}
