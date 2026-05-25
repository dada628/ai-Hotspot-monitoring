/**
 * POST /api/ingest
 *
 * 触发一轮抓取+入库。
 * 鉴权：Bearer ${CRON_SECRET}
 *
 * Phase 2 简化版：所有平台并发抓取，逐个入库，返回汇总。
 */
import { NextResponse } from "next/server";
import { runIngest } from "@/lib/ingest";
import { ALL_PLATFORMS, type Platform } from "@/lib/scrapers";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  // 允许通过 URL 参数限定平台
  const url = new URL(req.url);
  const platformsParam = url.searchParams.get("platforms");
  let platforms: Platform[] = ALL_PLATFORMS;
  if (platformsParam) {
    const requested = platformsParam.split(",") as Platform[];
    platforms = requested.filter((p): p is Platform =>
      ALL_PLATFORMS.includes(p),
    );
    if (platforms.length === 0) {
      return NextResponse.json(
        { error: "Invalid platforms parameter" },
        { status: 400 },
      );
    }
  }

  try {
    const summary = await runIngest(platforms);
    return NextResponse.json(summary);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Ingest failed", detail: msg },
      { status: 500 },
    );
  }
}
