/**
 * GET /api/process/status
 *
 * 返回当前 AI Pipeline 的进度快照，供前端 polling 使用。
 *
 * 设计要点：
 *  - 进度状态存于 src/lib/ai/pipeline.ts 模块级变量（内存）
 *  - 无鉴权（本地 dev 用；生产环境上线时建议加 Bearer 校验）
 *  - cache: no-store，确保每次都拿最新进度
 *
 * 响应字段 = ProgressSnapshot：
 *  - running:       是否有 batch 在跑
 *  - scanned:       已处理（succeeded + failed）
 *  - succeeded/failed: 计数
 *  - total:         本批总数
 *  - currentTitle:  当前正在处理的标题（≤40 字截断）
 *  - startedAt/finishedAt: ISO 时间
 *  - modelId:       使用的模型
 */
import { NextResponse } from "next/server";
import { getCurrentProgress } from "@/lib/ai/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getCurrentProgress(), {
    headers: { "Cache-Control": "no-store" },
  });
}
