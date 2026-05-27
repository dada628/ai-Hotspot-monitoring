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
  isTechRelated,
  isBilibiliTechPartition,
  TECH_FILTER_META,
} from "../src/lib/tech-filter";
import {
  autoVariants,
  buildKeywordQueries,
  entityAllVariants,
  KEYWORD_CATALOG,
  KEYWORD_CATALOG_META,
} from "../src/lib/scrapers/keywords";
import {
  extractPublishedAt,
  pickEarliestPublishedAt,
} from "../src/lib/published-at";
import {
  collectSourceExcerpts,
  extractSourceExcerpt,
  isUsefulExcerpt,
} from "../src/lib/source-excerpt";
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
      "publishedAt",
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

    // 4) v8 新增：source 也透传 publishedAt 字段
    const srcWithPubField = data.sources.every(
      (s: Record<string, unknown>) => "publishedAt" in s,
    );
    srcWithPubField
      ? pass(g, "source 透传 publishedAt 字段", `${data.sources.length} 条 source 全部含字段`)
      : fail(g, "source 透传 publishedAt 字段", "存在 source 缺 publishedAt 键");

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

async function testRelatedApi() {
  await group("API · /api/hotspots/[id]/related 相关推荐", async () => {
    const g = "Related";

    const sample = await db.hotSpot.findFirst({
      where: { status: "active" },
    });
    if (!sample) {
      fail(g, "找一条 HotSpot 当样本", "DB 没有 active HotSpot");
      return;
    }

    // 1) 默认 limit=6
    const r = await fetch(`${BASE}/api/hotspots/${sample.id}/related`);
    if (r.status !== 200) {
      fail(g, `GET 默认`, `${r.status}`);
      return;
    }
    const data = await r.json();

    const expected = ["main", "items", "candidatesScanned", "windowDays"];
    const missing = expected.filter((k) => !(k in data));
    missing.length === 0
      ? pass(
          g,
          "返回结构完整",
          `items=${data.items.length} candidates=${data.candidatesScanned} window=${data.windowDays}d`,
        )
      : fail(g, "返回结构完整", `缺: ${missing.join(",")}`);

    // 2) items 不包含自己
    const selfIncluded = data.items.some(
      (it: { id: string }) => it.id === sample.id,
    );
    selfIncluded
      ? fail(g, "items 应不含自己", "包含自己 ✗")
      : pass(g, "items 应不含自己", "✓");

    // 3) items 按 relevance desc 排序
    let sortedOk = true;
    for (let i = 1; i < data.items.length; i++) {
      if (data.items[i].relevance > data.items[i - 1].relevance) {
        sortedOk = false;
        break;
      }
    }
    sortedOk
      ? pass(g, "按 relevance desc 排序", "✓")
      : fail(g, "按 relevance desc 排序", "存在乱序");

    // 4) limit 参数被尊重
    const r2 = await fetch(
      `${BASE}/api/hotspots/${sample.id}/related?limit=3`,
    );
    const d2 = await r2.json();
    d2.items.length <= 3
      ? pass(g, "limit=3 应 ≤3 条", `${d2.items.length} 条`)
      : fail(g, "limit=3 应 ≤3 条", `${d2.items.length} 条`);

    // 5) 不存在 id → 404
    const bad = await fetch(
      `${BASE}/api/hotspots/no-such-id-zzz-12345/related`,
    );
    bad.status === 404
      ? pass(g, "不存在 id 应 404", "✓")
      : fail(g, "不存在 id 应 404", `${bad.status}`);

    // 6) 所有 items 的 relevance 都 ≥ MIN（0.05）
    const allAboveMin = data.items.every(
      (it: { relevance: number }) => it.relevance >= 0.05,
    );
    allAboveMin
      ? pass(g, "所有 items relevance ≥ 0.05", "✓")
      : fail(g, "所有 items relevance ≥ 0.05", "存在低于阈值的项");
  });
}

async function testPublishedAt() {
  await group("发布时间字段 · 解析 + API 透传", async () => {
    const g = "PublishedAt";

    // ----- 1) extractPublishedAt 平台映射 -----
    const ts = 1716700800; // 2024-05-26 08:00 UTC（一个明确的旧时间点）
    const iso = new Date(ts * 1000).toISOString();

    const cases: Array<{
      platform: Parameters<typeof extractPublishedAt>[0];
      metric: Record<string, unknown>;
      expectMs: number | null;
      desc: string;
    }> = [
      { platform: "googlenews", metric: { published: iso }, expectMs: ts * 1000, desc: "googlenews ISO" },
      { platform: "infoq", metric: { published: iso }, expectMs: ts * 1000, desc: "infoq ISO" },
      { platform: "hackernews", metric: { time: ts }, expectMs: ts * 1000, desc: "hackernews Unix 秒" },
      { platform: "reddit", metric: { publishedAt: ts }, expectMs: ts * 1000, desc: "reddit Unix 秒" },
      { platform: "bilibili", metric: { publishedAt: ts }, expectMs: ts * 1000, desc: "bilibili Unix 秒" },
      { platform: "twitter", metric: { publishedAt: iso }, expectMs: ts * 1000, desc: "twitter ISO" },
      { platform: "weibo", metric: {}, expectMs: null, desc: "weibo 无发布语义 → null" },
      { platform: "zhihu", metric: {}, expectMs: null, desc: "zhihu 无发布语义 → null" },
      { platform: "github", metric: {}, expectMs: null, desc: "github 无发布语义 → null" },
    ];

    let ok = 0;
    const failures: string[] = [];
    for (const c of cases) {
      const got = extractPublishedAt(c.platform, c.metric);
      const gotMs = got ? got.getTime() : null;
      if (gotMs === c.expectMs) ok++;
      else failures.push(`${c.desc} 期望 ${c.expectMs} 得到 ${gotMs}`);
    }
    failures.length === 0
      ? pass(g, "9 平台 extractPublishedAt 映射", `${ok}/${cases.length} 全通过`)
      : fail(g, "9 平台 extractPublishedAt 映射", failures.join(" / "));

    // ----- 2) 脏数据范围校验 -----
    const dirty: Array<[Parameters<typeof extractPublishedAt>[0], Record<string, unknown>, string]> = [
      ["hackernews", { time: -1 }, "负 Unix 秒"],
      ["hackernews", { time: 0 }, "0 Unix 秒"],
      ["googlenews", { published: "not a date" }, "非法字符串"],
      ["googlenews", { published: "" }, "空字符串"],
      ["googlenews", { published: "1970-01-01T00:00:01Z" }, "1980 前"],
    ];
    let dirtyOk = 0;
    const dirtyFail: string[] = [];
    for (const [p, m, desc] of dirty) {
      const got = extractPublishedAt(p, m);
      if (got === null) dirtyOk++;
      else dirtyFail.push(`${desc} 应为 null 但得到 ${got.toISOString()}`);
    }
    dirtyFail.length === 0
      ? pass(g, "脏数据全部返回 null", `${dirtyOk}/${dirty.length} 拒绝`)
      : fail(g, "脏数据全部返回 null", dirtyFail.join(" / "));

    // ----- 3) pickEarliestPublishedAt 取最早 -----
    const t1 = new Date("2024-05-01T00:00:00Z").getTime() / 1000;
    const t2 = new Date("2024-06-01T00:00:00Z").getTime() / 1000;
    const earliest = pickEarliestPublishedAt([
      { platform: "hackernews", metric: { time: t2 } },
      { platform: "hackernews", metric: { time: t1 } },
      { platform: "weibo", metric: {} },
    ]);
    earliest && earliest.getTime() === t1 * 1000
      ? pass(g, "pickEarliestPublishedAt 取最早", earliest.toISOString())
      : fail(
          g,
          "pickEarliestPublishedAt 取最早",
          `期望 ${new Date(t1 * 1000).toISOString()} 得到 ${earliest?.toISOString()}`,
        );

    // ----- 4) /api/hotspots 列表项透传 publishedAt + 关联字段 -----
    const r = await fetch(`${BASE}/api/hotspots?limit=10`);
    if (r.status !== 200) {
      fail(g, "/api/hotspots 列表请求", `HTTP ${r.status}`);
      return;
    }
    const list = (await r.json()) as {
      items: Array<{
        publishedAt?: string | null;
        processedAt?: string | null;
        trendVelocity?: number | null;
        sources: Array<{ publishedAt?: string | null }>;
      }>;
    };
    const allHavePublishedKey = list.items.every((it) => "publishedAt" in it);
    const allHaveProcessedKey = list.items.every((it) => "processedAt" in it);
    const allHaveVelocityKey = list.items.every((it) => "trendVelocity" in it);
    const allSourceHaveKey = list.items.every((it) =>
      it.sources.every((s) => "publishedAt" in s),
    );
    allHavePublishedKey
      ? pass(g, "列表 item 透传 publishedAt 字段", `${list.items.length} 条全部含字段`)
      : fail(g, "列表 item 透传 publishedAt 字段", "存在 item 缺字段");
    allHaveProcessedKey
      ? pass(g, "列表 item 透传 processedAt 字段", "OK")
      : fail(g, "列表 item 透传 processedAt 字段", "存在 item 缺字段");
    allHaveVelocityKey
      ? pass(g, "列表 item 透传 trendVelocity 字段", "OK")
      : fail(g, "列表 item 透传 trendVelocity 字段", "存在 item 缺字段");
    allSourceHaveKey
      ? pass(g, "列表 source 透传 publishedAt 字段", "OK")
      : fail(g, "列表 source 透传 publishedAt 字段", "存在 source 缺字段");

    // ----- 5) DB 实测：至少有 HotSpot 已写入 publishedAt -----
    const withPub = await db.hotSpot.count({
      where: { publishedAt: { not: null } },
    });
    withPub > 0
      ? pass(g, "DB 含 publishedAt 数据", `${withPub} 条 HotSpot 已写入`)
      : fail(g, "DB 含 publishedAt 数据", "0 条 — 检查 ingest.ts 写入逻辑");
  });
}

async function testSourceExcerpt() {
  await group("SourceExcerpt · v9 原文素材", async () => {
    const g = "SourceExcerpt";

    // 1) 无效摘录过滤（InfoQ 占位符 / 过短）
    const badCases = ["点击查看原文>", "短", "  ", ""];
    const badOk = badCases.every((t) => !isUsefulExcerpt(t));
    badOk
      ? pass(g, "isUsefulExcerpt 拒绝占位符/过短", `${badCases.length} 条全拒绝`)
      : fail(g, "isUsefulExcerpt 拒绝占位符/过短", "存在应拒绝的条目");

    const goodOk = isUsefulExcerpt(
      "Graphs that teach > graphs that impress. Turn any code into an interactive knowledge graph.",
    );
    goodOk
      ? pass(g, "isUsefulExcerpt 接受有效英文描述", "OK")
      : fail(g, "isUsefulExcerpt 接受有效英文描述", "误判为无效");

    // 2) extractSourceExcerpt 字段优先级
    const fromGh = extractSourceExcerpt({
      description: "Learn it. Build it. Ship it for others.",
      excerpt: "",
    });
    fromGh === "Learn it. Build it. Ship it for others."
      ? pass(g, "extractSourceExcerpt 读 description", "OK")
      : fail(g, "extractSourceExcerpt 读 description", String(fromGh));

    const fromInfoq = extractSourceExcerpt({ excerpt: "点击查看原文>" });
    fromInfoq === null
      ? pass(g, "extractSourceExcerpt 过滤 InfoQ 占位符", "null")
      : fail(g, "extractSourceExcerpt 过滤 InfoQ 占位符", String(fromInfoq));

    // 3) collectSourceExcerpts 去重
    const collected = collectSourceExcerpts([
      {
        platform: "github",
        rawTitle: "foo/bar",
        metric: { description: "Same text repeated for dedupe test here." },
      },
      {
        platform: "googlenews",
        rawTitle: "other",
        metric: { excerpt: "Same text repeated for dedupe test here." },
      },
    ]);
    collected.length === 1
      ? pass(g, "collectSourceExcerpts 去重", "2 源同文 → 1 条")
      : fail(g, "collectSourceExcerpts 去重", `得到 ${collected.length} 条`);

    // 4) SummarySchema v9 长度约束
    const shortSummary = SummarySchema.safeParse({
      summary: "太短了。",
      keyPoints: ["a", "b", "c"],
      entities: ["X"],
    });
    !shortSummary.success
      ? pass(g, "SummarySchema 拒绝 <80 字 summary", "rejected")
      : fail(g, "SummarySchema 拒绝 <80 字 summary", "竟然通过");

    const longOk = SummarySchema.safeParse({
      summary:
        "OpenAI 于本周发布新一代大模型，官方强调在代码与推理场景的性能提升，并调整 API 定价策略。此举被视为回应竞争对手近期密集迭代的信号。对开发者而言，上下文长度与工具调用稳定性是关键；企业用户则更关注合规与私有化部署选项。",
      keyPoints: ["新模型发布", "API 定价调整", "竞争格局变化"],
      entities: ["OpenAI"],
    });
    longOk.success
      ? pass(g, "SummarySchema 接受 80+ 字长导读", "OK")
      : fail(g, "SummarySchema 接受 80+ 字长导读", longOk.error?.message ?? "");

    // 5) DB：googlenews 新 ingest 应含 excerpt 字段
    const gnSample = await db.hotSpotSource.findFirst({
      where: { platform: "googlenews", metric: { contains: '"excerpt"' } },
      orderBy: { fetchedAt: "desc" },
      select: { metric: true },
    });
    if (gnSample) {
      try {
        const m = JSON.parse(gnSample.metric) as Record<string, unknown>;
        const ex = typeof m.excerpt === "string" ? m.excerpt : "";
        ex.length >= 20 && isUsefulExcerpt(ex)
          ? pass(g, "DB googlenews metric.excerpt 有效", `${ex.length} 字符`)
          : fail(g, "DB googlenews metric.excerpt 有效", `excerpt="${ex}"`);
      } catch {
        fail(g, "DB googlenews metric.excerpt 有效", "metric JSON 解析失败");
      }
    } else {
      fail(g, "DB googlenews metric.excerpt 有效", "无含 excerpt 的 googlenews 记录 — 先跑 ingest");
    }
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

async function testTechFilter() {
  await group("科技相关性过滤（isTechRelated / B 站分区）", async () => {
    const g = "TechFilter";

    // 1) 关键词总量合理（防止意外清空或炸到上千）
    if (TECH_FILTER_META.total >= 80 && TECH_FILTER_META.total <= 400) {
      pass(
        g,
        "关键词总量在合理区间",
        `${TECH_FILTER_META.total}（中文 ${TECH_FILTER_META.cnCount} + 英长 ${TECH_FILTER_META.enLongCount} + 英短 ${TECH_FILTER_META.enShortCount}）`,
      );
    } else {
      fail(
        g,
        "关键词总量在合理区间",
        `total=${TECH_FILTER_META.total}（期望 80-400）`,
      );
    }

    // 2) 中文正样本必须命中
    const cnPositive = [
      "OpenAI 发布 GPT-5 内测版",
      "字节跳动开源大模型 Qwen3",
      "英伟达发布新一代 AI 芯片",
      "苹果 iPhone 17 Pro 发布",
      "马斯克谈 Tesla FSD V13",
      "小米发布新一代鸿蒙",
    ];
    const cnMissed = cnPositive.filter((s) => !isTechRelated(s));
    if (cnMissed.length === 0) {
      pass(g, "中文科技正样本全命中", `${cnPositive.length} 条 OK`);
    } else {
      fail(g, "中文科技正样本全命中", `漏: ${cnMissed.join(" | ")}`);
    }

    // 3) 英文正样本必须命中
    const enPositive = [
      "OpenAI announces GPT-5",
      "Microsoft releases Copilot upgrade",
      "How to fine-tune a Llama 3 model",
      "Anthropic launches Claude 4",
      "Apple unveils new iPad Pro",
    ];
    const enMissed = enPositive.filter((s) => !isTechRelated(s));
    if (enMissed.length === 0) {
      pass(g, "英文科技正样本全命中", `${enPositive.length} 条 OK`);
    } else {
      fail(g, "英文科技正样本全命中", `漏: ${enMissed.join(" | ")}`);
    }

    // 3.5) v6 新增词覆盖（工程术语 + AI/数据术语 + 短词）
    const v6Positive = [
      "Building a C compiler in Rust",
      "How encryption protects your data",
      "RAG vs fine-tuning: which is better?",
      "Postgres benchmark vs MySQL 8",
      "Kubernetes orchestration in production",
      "RLHF training pipeline explained",
      "Pinecone vs Weaviate for vector database",
    ];
    const v6Missed = v6Positive.filter((s) => !isTechRelated(s));
    if (v6Missed.length === 0) {
      pass(g, "v6 新增词正样本全命中", `${v6Positive.length} 条 OK`);
    } else {
      fail(g, "v6 新增词正样本全命中", `漏: ${v6Missed.join(" | ")}`);
    }

    // 4) 负样本必须拒绝（典型娱乐/社会/政经）
    const negative = [
      "刘德华演唱会延期",
      "NBA 总冠军预测",
      "今日全国天气预报",
      "Florida restored HIV assistance funding",
      "Adam Vareberg wins regional cooking contest",
      "浪姐综艺导演吴梦知离职",
    ];
    const falsePositives = negative.filter((s) => isTechRelated(s));
    if (falsePositives.length === 0) {
      pass(g, "非科技负样本全部拒绝", `${negative.length} 条 OK`);
    } else {
      fail(g, "非科技负样本全部拒绝", `误命中: ${falsePositives.join(" | ")}`);
    }

    // 5) 边界：短英文词 "AI" 不应误匹配 "said" / "paid"
    const tricky = ["He said it would rain", "Paid subscribers grow 5%"];
    const trickyHit = tricky.filter((s) => isTechRelated(s));
    if (trickyHit.length === 0) {
      pass(g, "短词边界：'said'/'paid' 不误命中 'AI'", "OK");
    } else {
      fail(g, "短词边界：'said'/'paid' 不误命中 'AI'", trickyHit.join(" | "));
    }

    // 6) B 站分区白名单
    const partitionOk =
      isBilibiliTechPartition("科技") &&
      isBilibiliTechPartition("知识") &&
      !isBilibiliTechPartition("生活") &&
      !isBilibiliTechPartition("游戏") &&
      !isBilibiliTechPartition(null);
    if (partitionOk) {
      pass(g, "B 站分区白名单 = 科技/知识", "OK");
    } else {
      fail(g, "B 站分区白名单 = 科技/知识", "判定不正确");
    }
  });
}

async function testKeywords() {
  await group("关键词中心 · 变体扩展 + query 合成", async () => {
    const g = "Keywords";

    // 1) 用户原例 · 连字符 → 空格变体：'GPT-Codex-5.3'
    const v1 = autoVariants("GPT-Codex-5.3");
    if (v1.includes("GPT-Codex-5.3") && v1.includes("GPT Codex 5.3")) {
      pass(g, "autoVariants 连字符→空格变体", `[${v1.join(", ")}]`);
    } else {
      fail(
        g,
        "autoVariants 连字符→空格变体",
        `期望含 'GPT-Codex-5.3' 和 'GPT Codex 5.3'，实得 [${v1.join(", ")}]`,
      );
    }

    // 2) 用户原例反向 · 空格 → 连字符变体：'Codex 5.3'
    const v2 = autoVariants("Codex 5.3");
    if (v2.includes("Codex 5.3") && v2.includes("Codex-5.3")) {
      pass(g, "autoVariants 空格→连字符变体", `[${v2.join(", ")}]`);
    } else {
      fail(
        g,
        "autoVariants 空格→连字符变体",
        `期望含 'Codex 5.3' 和 'Codex-5.3'，实得 [${v2.join(", ")}]`,
      );
    }

    // 3) 目录元信息：实体数 + family 覆盖
    const minEntities = 20;
    const minFamilies = 10;
    if (
      KEYWORD_CATALOG_META.totalEntities >= minEntities &&
      KEYWORD_CATALOG_META.families.length >= minFamilies
    ) {
      pass(
        g,
        `目录规模：实体 ≥ ${minEntities}, family ≥ ${minFamilies}`,
        `实得 entities=${KEYWORD_CATALOG_META.totalEntities}, families=${KEYWORD_CATALOG_META.families.length} (${KEYWORD_CATALOG_META.families.join("/")})`,
      );
    } else {
      fail(
        g,
        `目录规模：实体 ≥ ${minEntities}, family ≥ ${minFamilies}`,
        `entities=${KEYWORD_CATALOG_META.totalEntities}, families=${KEYWORD_CATALOG_META.families.length}`,
      );
    }

    // 4) 英文 query 合成：primary 非空、长度合理、含 ChatGPT
    const en = buildKeywordQueries({ lang: "en" });
    const enOk =
      en.primary !== "()" &&
      en.secondary !== "()" &&
      en.primary.length > 0 &&
      en.primary.length <= 800 &&
      en.secondary.length <= 800 &&
      en.primary.includes("ChatGPT");
    if (enOk) {
      pass(
        g,
        "buildKeywordQueries(en) primary/secondary 健康",
        `primary ${en.meta.primaryTokens}token/${en.meta.primaryChars}字; secondary ${en.meta.secondaryTokens}token/${en.meta.secondaryChars}字`,
      );
    } else {
      fail(
        g,
        "buildKeywordQueries(en) primary/secondary 健康",
        `primary 长度 ${en.primary.length}, 含 ChatGPT? ${en.primary.includes("ChatGPT")}, secondary 长度 ${en.secondary.length}`,
      );
    }

    // 5) 用户原例核心断言：secondary 必须命中 Codex 系列变体
    const codexVariants = ["Codex", "GPT-Codex", "Codex 5.3", "GPT-Codex-5.3", "GPT Codex 5.3"];
    const codexHits = codexVariants.filter((v) => en.secondary.includes(v));
    if (codexHits.length >= 3) {
      pass(
        g,
        "secondary 覆盖用户原例 Codex 变体（≥3 种）",
        `命中 ${codexHits.length} 种: [${codexHits.join(", ")}]`,
      );
    } else {
      fail(
        g,
        "secondary 覆盖用户原例 Codex 变体（≥3 种）",
        `仅命中 ${codexHits.length} 种: [${codexHits.join(", ")}]`,
      );
    }

    // 6) 中文 query 合成：含国产模型品牌 + 中文话题词；不含英文专用模型品牌
    //    注意区分 'Llama'（Meta 模型，lang='en'）vs 'LlamaIndex'（工具栈，lang='both'）。
    //    用 \b 词边界正则把 Meta 的 Llama 系列识别准确；LlamaIndex 不会被误命中。
    const zh = buildKeywordQueries({ lang: "zh" });
    const zhBothLang = zh.primary.includes("DeepSeek") || zh.primary.includes("深度求索");
    const zhQwen = zh.primary.includes("通义千问") || zh.primary.includes("Qwen");
    const zhTopic = zh.primary.includes("大模型") || zh.primary.includes("人工智能");
    const llamaWord = /\bLlama\b|\bLLaMA\b/;
    const zhNoLlama = !llamaWord.test(zh.primary) && !llamaWord.test(zh.secondary);
    if (zhBothLang && zhQwen && zhTopic && zhNoLlama) {
      pass(
        g,
        "buildKeywordQueries(zh) 国产模型 + 话题词齐 + 排除 Meta Llama",
        `primary ${zh.meta.primaryTokens}token; secondary ${zh.meta.secondaryTokens}token`,
      );
    } else {
      fail(
        g,
        "buildKeywordQueries(zh) 国产模型 + 话题词齐 + 排除 Meta Llama",
        `DeepSeek=${zhBothLang}, Qwen=${zhQwen}, 大模型/人工智能=${zhTopic}, 不含独立 Llama=${zhNoLlama}`,
      );
    }

    // 7) 字符上限保护：maxChars=100 强制截断后仍能返回非空 query
    const tight = buildKeywordQueries({ lang: "en", maxChars: 100 });
    if (
      tight.primary !== "()" &&
      tight.primary.length <= 100 &&
      tight.secondary.length <= 100
    ) {
      pass(
        g,
        "maxChars=100 截断后 primary 仍非空 且 不越线",
        `primary ${tight.primary.length}字, secondary ${tight.secondary.length}字`,
      );
    } else {
      fail(
        g,
        "maxChars=100 截断后 primary 仍非空 且 不越线",
        `primary='${tight.primary}', secondary='${tight.secondary}'`,
      );
    }

    // 8) 别名展开去重：同一 entity 的 alias 自动变体合并后不重复
    const codexEntity = KEYWORD_CATALOG.find((e) =>
      e.aliases.some((a) => a.includes("Codex")),
    );
    if (codexEntity) {
      const expanded = entityAllVariants(codexEntity);
      const unique = new Set(expanded);
      if (expanded.length === unique.size && expanded.length >= 4) {
        pass(
          g,
          "entityAllVariants(Codex) 展开去重",
          `${expanded.length} 个变体: [${expanded.join(", ")}]`,
        );
      } else {
        fail(
          g,
          "entityAllVariants(Codex) 展开去重",
          `expanded=${expanded.length}, unique=${unique.size}`,
        );
      }
    } else {
      fail(g, "entityAllVariants(Codex) 展开去重", "目录中找不到含 Codex 的 entity");
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
      summary:
        "OpenAI 发布 GPT-6 模型，官方称参数规模较上一代显著提升，并强化代码与多模态能力。发布被视为对齐主要竞争对手近期节奏。开发者关注 API 定价与上下文窗口；企业用户关注合规与私有化选项。",
      keyPoints: ["GPT-6 发布", "参数规模提升", "API 与合规待观察"],
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

    // 3b) 多条 ids → 400
    const multiIds = await fetch(
      `${BASE}/api/process?ids=id1,id2`,
      {
        method: "POST",
        headers: {
          Authorization: CRON_BEARER,
          "Content-Type": "application/json",
        },
      },
    );
    multiIds.status === 400
      ? pass(g, "多条 ids 应 400", "400 ✓")
      : fail(g, "多条 ids 应 400", `实际 ${multiIds.status}`);

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
  await testTechFilter();
  await testKeywords();
  await testPublishedAt();
  await testSourceExcerpt();
  await testScrapersIsolated();
  await testDatabaseIntegrity();
  await testAiPipelineStatic();
  await testProcessApiRouting();
  await testHotSpotDetailApi();
  await testRelatedApi();
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
