/**
 * 端到端功能测试 (Phase 1 + Phase 2 + 设计切换)
 *
 * 运行：npx tsx scripts/e2e-test.ts
 *
 * 测试范围：
 *   1. 6 个数据源抓取器（逐个隔离测试）
 *   2. 4 个核心 API 端点
 *   3. 4 个页面状态码
 *   4. 数据库去重 / 表现完整性
 *   5. AI 模型目录与默认值
 *   6. Auth.js 凭据登录闭环
 */

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_MODEL_ID,
  MODEL_CATALOG,
  getModelCard,
} from "../src/lib/ai/models";
import { ALL_PLATFORMS } from "../src/lib/scrapers";
import {
  ClassifySchema,
  ScoreSchema,
  SummarySchema,
  CATEGORY_VALUES,
} from "../src/lib/ai/schemas";
import { classify } from "../src/lib/ai/prompts/classify";
import { summarize } from "../src/lib/ai/prompts/summarize";
import { score as scoreItem } from "../src/lib/ai/prompts/score";
import { processBatch } from "../src/lib/ai/pipeline";
import { runAlertMatch } from "../src/lib/ai/alert-match";
import { hasOpenRouterKey } from "../src/lib/ai/openrouter";

const BASE = "http://localhost:3000";
const CRON_BEARER = "Bearer dev-cron-secret-please-replace-1234567890";

interface TestResult {
  group: string;
  name: string;
  passed: boolean;
  detail?: string;
}

const results: TestResult[] = [];

function pass(group: string, name: string, detail?: string) {
  results.push({ group, name, passed: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(group: string, name: string, detail: string) {
  results.push({ group, name, passed: false, detail });
  console.log(`  ✗ ${name} — ${detail}`);
}

async function group(name: string, fn: () => Promise<void>) {
  console.log(`\n▶ ${name}`);
  await fn();
}

const db = new PrismaClient();

// ============ Tests ============

async function testTypeAndCatalog() {
  await group("AI 模型目录", async () => {
    const groupName = "AI Model Catalog";

    // 默认模型存在
    const def = getModelCard(DEFAULT_MODEL_ID);
    if (def.id === DEFAULT_MODEL_ID) {
      pass(groupName, `DEFAULT_MODEL_ID 解析`, def.label);
    } else {
      fail(groupName, "DEFAULT_MODEL_ID 解析", `期望 ${DEFAULT_MODEL_ID} 得到 ${def.id}`);
    }

    // 所有模型都属于国产家族
    const allowed = new Set(["DeepSeek", "Qwen", "GLM", "Kimi"]);
    const foreign = MODEL_CATALOG.filter((m) => !allowed.has(m.family));
    if (foreign.length === 0) {
      pass(groupName, "模型目录仅含国产家族", `${MODEL_CATALOG.length} 条全部合规`);
    } else {
      fail(
        groupName,
        "模型目录仅含国产家族",
        `发现海外: ${foreign.map((f) => f.id).join(", ")}`,
      );
    }

    // 各模型必填字段
    let invalid = 0;
    for (const m of MODEL_CATALOG) {
      if (!m.id || !m.label || !m.family || m.pricePerMOutput < 0) invalid++;
    }
    if (invalid === 0) {
      pass(groupName, "模型字段完整性", `${MODEL_CATALOG.length} 条 OK`);
    } else {
      fail(groupName, "模型字段完整性", `${invalid} 条不合规`);
    }

    // 推荐模型仅一个，且为默认
    const recommended = MODEL_CATALOG.filter((m) => m.recommended);
    if (recommended.length === 1 && recommended[0].id === DEFAULT_MODEL_ID) {
      pass(groupName, "推荐标记一致性", "1 条且为默认");
    } else {
      fail(
        groupName,
        "推荐标记一致性",
        `推荐 ${recommended.length} 条`,
      );
    }
  });
}

async function testUser() {
  await group("用户数据", async () => {
    const g = "User";
    const admin = await db.user.findUnique({
      where: { email: "admin@nexus.local" },
    });
    if (admin) {
      pass(g, "admin 用户存在", admin.email);
    } else {
      fail(g, "admin 用户存在", "未找到 admin@nexus.local");
      return;
    }
    if (admin.passwordHash) {
      pass(g, "admin 有密码 hash", `长度 ${admin.passwordHash.length}`);
    } else {
      fail(g, "admin 有密码 hash", "为空");
    }
    if (admin.preferredModel === DEFAULT_MODEL_ID) {
      pass(g, "admin 默认模型已切到国产", admin.preferredModel);
    } else {
      fail(
        g,
        "admin 默认模型已切到国产",
        `期望 ${DEFAULT_MODEL_ID} 实际 ${admin.preferredModel}`,
      );
    }
  });
}

async function testPages() {
  await group("页面状态码", async () => {
    const g = "Pages";
    const pages = ["/", "/admin/ingest", "/dashboard", "/login"];
    for (const p of pages) {
      try {
        const r = await fetch(`${BASE}${p}`);
        if (r.status === 200) pass(g, `GET ${p}`, "200");
        else fail(g, `GET ${p}`, `${r.status}`);
      } catch (e) {
        fail(g, `GET ${p}`, (e as Error).message);
      }
    }

    // 详情页（需要有一条 HotSpot 才能测真实路径）
    const any = await db.hotSpot.findFirst({ where: { status: "active" } });
    if (any) {
      try {
        const r = await fetch(`${BASE}/hotspot/${any.id}`);
        r.status === 200
          ? pass(g, `GET /hotspot/[id]`, `${any.id.slice(0, 10)}... 200`)
          : fail(g, `GET /hotspot/[id]`, `${r.status}`);
      } catch (e) {
        fail(g, `GET /hotspot/[id]`, (e as Error).message);
      }
    }
  });
}

async function testHotSpotDetailApi() {
  await group("API · /api/hotspots/[id] 单条详情", async () => {
    const g = "HotSpot Detail";

    // 找一条 active HotSpot
    const sample = await db.hotSpot.findFirst({
      where: { status: "active" },
      include: { sources: true },
    });
    if (!sample) {
      fail(g, "找一条 HotSpot 当样本", "DB 没有 active HotSpot");
      return;
    }

    // 1) 正常 GET
    const r = await fetch(`${BASE}/api/hotspots/${sample.id}`);
    if (r.status !== 200) {
      fail(g, `GET 正常 id`, `${r.status}`);
      return;
    }
    const data = await r.json();
    const expected = [
      "id",
      "title",
      "summary",
      "category",
      "tags",
      "score",
      "engagementScore",
      "trendVelocity",
      "keyPoints",
      "entities",
      "processedAt",
      "firstSeenAt",
      "updatedAt",
      "sources",
    ];
    const missing = expected.filter((k) => !(k in data));
    missing.length === 0
      ? pass(
          g,
          "GET 单条返回完整字段",
          `${expected.length} 字段全有 · sources=${data.sources.length}`,
        )
      : fail(g, "GET 单条返回完整字段", `缺: ${missing.join(",")}`);

    // 2) tags / keyPoints / entities 都是合法 JSON
    let jsonOk = true;
    for (const k of ["tags", "keyPoints", "entities"]) {
      try {
        const arr = JSON.parse(data[k] as string);
        if (!Array.isArray(arr)) jsonOk = false;
      } catch {
        jsonOk = false;
      }
    }
    jsonOk
      ? pass(g, "tags/keyPoints/entities 都是 JSON 数组", "OK")
      : fail(g, "JSON 字段解析", "存在非合法 JSON 或非数组");

    // 3) 不存在的 id → 404
    const bad = await fetch(`${BASE}/api/hotspots/no-such-id-zzz-12345`);
    bad.status === 404
      ? pass(g, "不存在 id 应 404", "404 ✓")
      : fail(g, "不存在 id 应 404", `实际 ${bad.status}`);
  });
}

async function testStatsApi() {
  await group("API · stats / hotspots", async () => {
    const g = "API";

    // /api/admin/stats
    const sRes = await fetch(`${BASE}/api/admin/stats`);
    if (sRes.status === 200) {
      const data = await sRes.json();
      const expected = [
        "totalHotSpots",
        "todayNew",
        "urgentCount",
        "keywordsCount",
        "platformCounts",
        "recentLogs",
        "recentHotspots",
      ];
      const missing = expected.filter((k) => !(k in data));
      if (missing.length === 0) {
        pass(
          g,
          "/api/admin/stats schema",
          `total=${data.totalHotSpots} todayNew=${data.todayNew} logs=${data.recentLogs.length}`,
        );
      } else {
        fail(g, "/api/admin/stats schema", `缺字段: ${missing.join(",")}`);
      }
    } else {
      fail(g, "/api/admin/stats", `${sRes.status}`);
    }

    // /api/hotspots 默认
    const hRes = await fetch(`${BASE}/api/hotspots?limit=5`);
    if (hRes.status === 200) {
      const data = await hRes.json();
      if (Array.isArray(data.items)) {
        pass(
          g,
          "/api/hotspots 默认",
          `items.length=${data.items.length}, total=${data.total}`,
        );
      } else {
        fail(g, "/api/hotspots 默认", "items 非数组");
      }
    } else {
      fail(g, "/api/hotspots 默认", `${hRes.status}`);
    }

    // /api/hotspots 平台过滤
    const fRes = await fetch(`${BASE}/api/hotspots?platform=twitter&limit=5`);
    if (fRes.status === 200) {
      const data = await fRes.json();
      const allTwitter = data.items.every((it: { sources: { platform: string }[] }) =>
        it.sources.some((s) => s.platform === "twitter"),
      );
      if (allTwitter) {
        pass(g, "/api/hotspots 平台过滤", `twitter ${data.items.length} 条`);
      } else {
        fail(g, "/api/hotspots 平台过滤", "包含非 twitter 项");
      }
    } else {
      fail(g, "/api/hotspots 平台过滤", `${fRes.status}`);
    }

    // /api/hotspots 关键词
    const kRes = await fetch(`${BASE}/api/hotspots?q=AI&limit=5`);
    if (kRes.status === 200) {
      pass(g, "/api/hotspots q=AI", "200");
    } else {
      fail(g, "/api/hotspots q=AI", `${kRes.status}`);
    }
  });
}

async function testAuthApi() {
  await group("Auth.js API", async () => {
    const g = "Auth";

    // /api/auth/providers
    const pRes = await fetch(`${BASE}/api/auth/providers`);
    if (pRes.status === 200) {
      const data = await pRes.json();
      if (data && typeof data === "object" && "credentials" in data) {
        pass(g, "/api/auth/providers", `providers=${Object.keys(data).join(",")}`);
      } else {
        fail(g, "/api/auth/providers", `缺 credentials provider`);
      }
    } else {
      fail(g, "/api/auth/providers", `${pRes.status}`);
    }

    // /api/auth/csrf
    const cRes = await fetch(`${BASE}/api/auth/csrf`);
    if (cRes.status === 200) {
      const data = await cRes.json();
      if (data.csrfToken) {
        pass(g, "/api/auth/csrf", `token len=${data.csrfToken.length}`);
      } else {
        fail(g, "/api/auth/csrf", "无 csrfToken");
      }
    } else {
      fail(g, "/api/auth/csrf", `${cRes.status}`);
    }

    // /api/auth/session（未登录应返回空）
    const sRes = await fetch(`${BASE}/api/auth/session`);
    if (sRes.status === 200) {
      pass(g, "/api/auth/session", "200（匿名）");
    } else {
      fail(g, "/api/auth/session", `${sRes.status}`);
    }
  });
}

async function testScrapersIsolated() {
  await group("6 个抓取器（隔离）", async () => {
    const g = "Scrapers";
    for (const p of ALL_PLATFORMS) {
      const start = Date.now();
      try {
        const res = await fetch(`${BASE}/api/ingest?platforms=${p}`, {
          method: "POST",
          headers: {
            Authorization: CRON_BEARER,
            "Content-Type": "application/json",
          },
        });
        const data = await res.json();
        const r = data.results?.[0];
        if (res.ok && r?.status === "success") {
          pass(
            g,
            `${p}`,
            `fetched ${r.itemsFetched} · ins ${r.inserted} · upd ${r.updated} · ${r.durationMs}ms`,
          );
        } else {
          fail(g, `${p}`, r?.errorMsg ?? `HTTP ${res.status}`);
        }
      } catch (e) {
        fail(g, `${p}`, `${(e as Error).message} (${Date.now() - start}ms)`);
      }
    }
  });
}

async function testDatabaseIntegrity() {
  await group("数据库完整性", async () => {
    const g = "DB";

    const total = await db.hotSpot.count();
    const sources = await db.hotSpotSource.count();
    pass(g, "数据量", `HotSpot=${total} · HotSpotSource=${sources}`);

    // 去重约束：(platform, url) 应唯一
    const dupQuery = await db.$queryRaw<
      Array<{ platform: string; url: string; cnt: number }>
    >`SELECT platform, url, COUNT(*) as cnt FROM HotSpotSource GROUP BY platform, url HAVING cnt > 1 LIMIT 5`;
    if (dupQuery.length === 0) {
      pass(g, "去重约束 (platform, url) 唯一", "无重复");
    } else {
      fail(
        g,
        "去重约束 (platform, url) 唯一",
        `${dupQuery.length} 条重复: ${dupQuery
          .map((d) => `${d.platform}:${d.cnt}`)
          .join(",")}`,
      );
    }

    // 6 平台都有数据
    const grouped = await db.hotSpotSource.groupBy({
      by: ["platform"],
      _count: { _all: true },
    });
    const platformsWithData = new Set(grouped.map((g) => g.platform));
    const missing = ALL_PLATFORMS.filter((p) => !platformsWithData.has(p));
    if (missing.length === 0) {
      pass(
        g,
        "6 平台均有数据",
        grouped.map((g) => `${g.platform}=${g._count._all}`).join(" · "),
      );
    } else {
      fail(g, "6 平台均有数据", `缺: ${missing.join(", ")}`);
    }

    // IngestLog 都成功
    const recentLogs = await db.ingestLog.findMany({
      orderBy: { startedAt: "desc" },
      take: 12,
    });
    const failed = recentLogs.filter((l) => l.status !== "success");
    if (failed.length === 0) {
      pass(
        g,
        "最近 12 条 IngestLog 全部成功",
        `last log: ${recentLogs[0]?.platform} ${recentLogs[0]?.itemsCount}`,
      );
    } else {
      fail(
        g,
        "最近 IngestLog 状态",
        `${failed.length} 条失败: ${failed.map((f) => f.platform).join(",")}`,
      );
    }
  });
}

async function testCredentialsAuth() {
  await group("Auth.js 凭据登录闭环", async () => {
    const g = "Login";

    // 1. 获取 CSRF
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const cookieHeader = csrfRes.headers.get("set-cookie") ?? "";
    const { csrfToken } = await csrfRes.json();
    if (!csrfToken) {
      fail(g, "获取 CSRF token", "无 token");
      return;
    }

    // 提取 csrf cookie
    const csrfCookie = cookieHeader
      .split(",")
      .find((c) => c.includes("csrf-token"));
    if (!csrfCookie) {
      fail(g, "Set-Cookie 包含 csrf-token", `header=${cookieHeader.slice(0, 200)}`);
      return;
    }
    pass(g, "获取 CSRF token", `len=${csrfToken.length}`);

    // 2. 提交登录
    const body = new URLSearchParams({
      csrfToken,
      email: "admin@nexus.local",
      password: "admin12345",
      redirect: "false",
      callbackUrl: BASE,
    });

    const cookies = csrfCookie.split(";")[0];
    const loginRes = await fetch(
      `${BASE}/api/auth/callback/credentials`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: cookies,
        },
        body: body.toString(),
        redirect: "manual",
      },
    );

    // 成功表现：302/200 + 设置 session token cookie
    const setCookie = loginRes.headers.get("set-cookie") ?? "";
    const hasSessionCookie =
      setCookie.includes("session-token") ||
      setCookie.includes("authjs.session-token") ||
      setCookie.includes("next-auth.session-token");

    if (
      (loginRes.status === 200 || loginRes.status === 302) &&
      hasSessionCookie
    ) {
      pass(g, "凭据登录成功", `status=${loginRes.status}, 含 session cookie`);
    } else {
      fail(
        g,
        "凭据登录成功",
        `status=${loginRes.status} setCookie=${setCookie.slice(0, 200)}`,
      );
    }

    // 3. 错误密码应失败
    const badBody = new URLSearchParams({
      csrfToken,
      email: "admin@nexus.local",
      password: "wrong-password",
      redirect: "false",
      callbackUrl: BASE,
    });
    const badRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookies,
      },
      body: badBody.toString(),
      redirect: "manual",
    });
    const badSetCookie = badRes.headers.get("set-cookie") ?? "";
    const badHasSession =
      badSetCookie.includes("session-token") &&
      !badSetCookie.includes(`session-token=;`);

    if (!badHasSession) {
      pass(g, "错误密码应拒绝", `status=${badRes.status}, 无新 session`);
    } else {
      fail(g, "错误密码应拒绝", `居然颁发了 session: ${badSetCookie.slice(0, 200)}`);
    }
  });
}

async function testAiPipelineStatic() {
  await group("AI Pipeline · 静态完整性", async () => {
    const g = "AI Pipeline";

    // 1) 三个 Zod schema 都能 parse 一个合法对象
    const validClassify = ClassifySchema.safeParse({
      category: "tech",
      tags: ["AI", "OpenAI"],
      confidence: 0.9,
    });
    validClassify.success
      ? pass(g, "ClassifySchema 解析合法对象", "OK")
      : fail(g, "ClassifySchema 解析合法对象", validClassify.error.message);

    const validScore = ScoreSchema.safeParse({
      score: 85,
      reasoning: "重大事件",
      trendVelocity: 90,
    });
    validScore.success
      ? pass(g, "ScoreSchema 解析合法对象", "OK")
      : fail(g, "ScoreSchema 解析合法对象", validScore.error.message);

    const validSummary = SummarySchema.safeParse({
      summary: "OpenAI 发布了 GPT-6 模型，参数规模提升 5 倍。",
      keyPoints: ["GPT-6 发布", "参数 5x"],
      entities: ["OpenAI", "GPT-6"],
    });
    validSummary.success
      ? pass(g, "SummarySchema 解析合法对象", "OK")
      : fail(g, "SummarySchema 解析合法对象", validSummary.error.message);

    // 2) 非法 category 必须被拒绝
    const badCategory = ClassifySchema.safeParse({
      category: "天气",
      tags: ["x"],
      confidence: 0.5,
    });
    !badCategory.success
      ? pass(g, "ClassifySchema 拒绝非枚举 category", "天气 → rejected")
      : fail(g, "ClassifySchema 拒绝非枚举 category", "竟然通过了");

    // 3) 分类枚举数量与文档一致（8 个）
    CATEGORY_VALUES.length === 8
      ? pass(g, "category 枚举数量", `${CATEGORY_VALUES.length} = 8 ✓`)
      : fail(g, "category 枚举数量", `期望 8 实际 ${CATEGORY_VALUES.length}`);

    // 4) 三个 prompt 包装函数都是 async function
    const allFns = [classify, summarize, scoreItem];
    const nonFn = allFns.find((f) => typeof f !== "function");
    !nonFn
      ? pass(g, "classify / summarize / score 都是 function", "")
      : fail(g, "三个 prompt 函数", "存在非函数");

    // 5) processBatch 和 runAlertMatch 都是 function
    typeof processBatch === "function" && typeof runAlertMatch === "function"
      ? pass(g, "processBatch / runAlertMatch 是 function", "")
      : fail(g, "Pipeline / Alert 入口", "不是 function");
  });
}

async function testProcessApiRouting() {
  await group("API · /api/process 路由健康", async () => {
    const g = "AI API";

    // 1) 无 token → 401
    const noAuth = await fetch(`${BASE}/api/process?limit=1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    noAuth.status === 401
      ? pass(g, "无 token 应 401", "401 ✓")
      : fail(g, "无 token 应 401", `实际 ${noAuth.status}`);

    // 2) 错误 token → 401
    const badAuth = await fetch(`${BASE}/api/process?limit=1`, {
      method: "POST",
      headers: {
        Authorization: "Bearer wrong-secret",
        "Content-Type": "application/json",
      },
    });
    badAuth.status === 401
      ? pass(g, "错误 token 应 401", "401 ✓")
      : fail(g, "错误 token 应 401", `实际 ${badAuth.status}`);

    // 3) 非法 scope → 400
    const badScope = await fetch(
      `${BASE}/api/process?scope=bogus`,
      {
        method: "POST",
        headers: {
          Authorization: CRON_BEARER,
          "Content-Type": "application/json",
        },
      },
    );
    badScope.status === 400
      ? pass(g, "非法 scope 应 400", "400 ✓")
      : fail(g, "非法 scope 应 400", `实际 ${badScope.status}`);

    // 4) OPENROUTER_API_KEY 状态报告（非测试，只是信息）
    hasOpenRouterKey()
      ? pass(g, "OPENROUTER_API_KEY 已配置", "✓")
      : pass(g, "OPENROUTER_API_KEY 未配置", "（跳过集成测试）");
  });
}

/**
 * 可选：真实跑一遍 AI Pipeline（消耗 token）
 * 仅当环境变量 RUN_AI_TESTS=1 时执行
 */
async function testAiPipelineIntegration() {
  if (process.env.RUN_AI_TESTS !== "1") {
    console.log("\n▶ AI Pipeline · 真实集成（已跳过，设 RUN_AI_TESTS=1 启用）");
    return;
  }

  await group("AI Pipeline · 真实集成（RUN_AI_TESTS=1）", async () => {
    const g = "AI Integration";

    if (!hasOpenRouterKey()) {
      fail(g, "OPENROUTER_API_KEY 检查", "未配置，无法跑");
      return;
    }

    // 找 1 条 score=0 的 HotSpot 跑一遍
    const candidate = await db.hotSpot.findFirst({
      where: { status: "active", score: 0 },
      orderBy: { engagementScore: "desc" },
    });
    if (!candidate) {
      pass(g, "无 score=0 的 HotSpot", "全部已 AI 处理过，跳过");
      return;
    }

    const tStart = Date.now();
    const res = await fetch(
      `${BASE}/api/process?limit=1&scope=unprocessed`,
      {
        method: "POST",
        headers: {
          Authorization: CRON_BEARER,
          "Content-Type": "application/json",
        },
      },
    );
    const dur = Date.now() - tStart;
    if (!res.ok) {
      fail(g, "POST /api/process", `HTTP ${res.status} (${dur}ms)`);
      return;
    }
    const data = await res.json();
    if (data?.ai?.succeeded >= 1) {
      pass(
        g,
        "POST /api/process 实跑 1 条",
        `succeeded=${data.ai.succeeded} ${dur}ms`,
      );
    } else {
      fail(
        g,
        "POST /api/process 实跑 1 条",
        `succeeded=${data?.ai?.succeeded} failed=${data?.ai?.failed}`,
      );
    }

    // 校验 DB 真的写回了
    const updated = await db.hotSpot.findUnique({ where: { id: candidate.id } });
    if (updated && updated.score > 0 && updated.summary && updated.category) {
      pass(
        g,
        "HotSpot 字段已写回",
        `score=${updated.score} category=${updated.category} summary 长度 ${updated.summary.length}`,
      );
    } else {
      fail(
        g,
        "HotSpot 字段未写回",
        `score=${updated?.score} category=${updated?.category} summary=${updated?.summary?.slice(0, 30)}`,
      );
    }
  });
}

// ============ Main ============

async function main() {
  console.log("======================================");
  console.log("  E2E Functional Test — HotPulse v0.3");
  console.log("======================================");

  await testTypeAndCatalog();
  await testUser();
  await testPages();
  await testStatsApi();
  await testAuthApi();
  await testCredentialsAuth();
  await testScrapersIsolated();
  await testDatabaseIntegrity();
  await testAiPipelineStatic();
  await testProcessApiRouting();
  await testHotSpotDetailApi();
  await testAiPipelineIntegration();

  // 汇总
  console.log("\n======================================");
  console.log("  REPORT");
  console.log("======================================");
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const failed = total - passed;
  console.log(`  Total:  ${total}`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log("======================================");
  if (failed > 0) {
    console.log("\nFailures:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  ✗ [${r.group}] ${r.name}: ${r.detail}`);
    }
  }
  await db.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FATAL:", e);
  await db.$disconnect();
  process.exit(2);
});
