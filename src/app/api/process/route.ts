/**
 * POST /api/process
 *
 * 触发一轮 AI Pipeline 处理：对未 AI 处理过的 HotSpot 跑 classify → summarize → score，
 * 写回 DB；处理完后跑订阅匹配产出 Alert。
 *
 * 鉴权：Bearer ${CRON_SECRET}
 *
 * Query 参数：
 *  - ids:      单条 HotSpot ID（逗号分隔，本期仅支持 1 个）；与 scope 互斥
 *  - limit:    一次处理多少条（默认 20，最大 50）
 *  - scope:    "unprocessed"（默认）/ "all"（无 ids 时生效）
 *  - window:   时间窗小时数，默认 48（仅 unprocessed/all 生效）
 *  - model:    覆盖默认模型 ID（如 z-ai/glm-4.5-air）
 *
 * 返回：处理摘要 + 单条结果数组 + 预警匹配统计
 */
import { NextResponse } from "next/server";
import { processBatch } from "@/lib/ai/pipeline";
import { runAlertMatch } from "@/lib/ai/alert-match";

export const dynamic = "force-dynamic";
// 30 条 × 3 链 × 3s ≈ 4.5 分钟；留 5 分钟上限
export const maxDuration = 300;

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return true;
  const header = req.headers.get("authorization") ?? "";
  return header === `Bearer ${expected}`;
}

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.OPENROUTER_API_KEY) {
    return NextResponse.json(
      { error: "OPENROUTER_API_KEY 未配置" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit")) || 20;
  const scopeParam = url.searchParams.get("scope") ?? "unprocessed";
  const windowHours = Number(url.searchParams.get("window")) || 48;
  const modelId = url.searchParams.get("model") ?? undefined;
  const idsParam = url.searchParams.get("ids");

  const idList = idsParam
    ? idsParam
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  if (idList.length > 0) {
    if (idList.length > 1) {
      return NextResponse.json(
        { error: "ids 仅支持单条 HotSpot ID" },
        { status: 400 },
      );
    }
  } else if (scopeParam !== "unprocessed" && scopeParam !== "all") {
    return NextResponse.json(
      { error: "scope 只能是 unprocessed 或 all" },
      { status: 400 },
    );
  }

  try {
    const summary = await processBatch(
      idList.length > 0
        ? { limit: 1, scope: idList, modelId }
        : {
            limit,
            scope: scopeParam as "unprocessed" | "all",
            windowHours,
            modelId,
          },
    );

    if (idList.length > 0 && summary.scanned === 0) {
      return NextResponse.json({ error: "HotSpot 不存在" }, { status: 404 });
    }

    if (idList.length > 0 && summary.succeeded === 0 && summary.failed > 0) {
      const firstErr = summary.results.find((r) => r.status === "failed");
      return NextResponse.json(
        {
          error: "单条 AI 处理失败",
          detail: firstErr?.errorMsg ?? "未知错误",
        },
        { status: 500 },
      );
    }

    // 处理完跑订阅匹配
    const successIds = summary.results
      .filter((r) => r.status === "success")
      .map((r) => r.hotSpotId);
    const alertSummary = await runAlertMatch(successIds);

    return NextResponse.json({
      ai: summary,
      alerts: alertSummary,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "AI Pipeline 失败", detail: msg },
      { status: 500 },
    );
  }
}
