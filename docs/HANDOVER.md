# HotPulse · AI 项目交接文档

> **此文档面向"下一个 AI"** —— 新开对话时让 AI 快速恢复完整项目上下文，避免重新理解或踩历史决策的坑。  
> 最后更新：2026-05-26

---

## 0. 快速事实卡

| 字段 | 值 |
|---|---|
| **项目名** | HotPulse · AI 热点监控（也曾名为 NEXUS / AI Hotspot Monitoring，**当前品牌：HotPulse**） |
| **目标** | 抓取多源（微博/知乎/B站/GitHub/Twitter/HackerNews）热点 → AI 分类去重评分摘要 → 个性化预警 |
| **代码路径** | `d:\project001\ai-Hotspot monitoring` |
| **包名** | `ai-hotspot-monitoring` (`package.json`) |
| **运行平台** | Windows (PowerShell)，本地开发 |
| **当前阶段** | Phase 1 + 2 完成；Phase 3（AI Pipeline）待开工 |
| **测试** | `npx tsx scripts/e2e-test.ts` —— 31 项全部 PASS |
| **dev URL** | <http://localhost:3000> |

---

## 1. 用户偏好与硬约束（CRITICAL）

> 这些是用户**明确表达过**的约束，违反会被打回。

1. **前端要"独特、不千篇一律"** —— 不用现成 UI 库（不用 shadcn/MUI/Ant），自研组件。
2. **UI 风格 = HotPulse**：深蓝太空 + 玻璃拟态 + 圆角现代 + 蓝青渐变。
   - 已经经历过一次切换：CP2077 黄黑（用户判定"ugly"）→ HotPulse。**不要回退到 CP2077。**
3. **AI 模型仅用国产**：DeepSeek / Qwen / GLM / Kimi —— 通过 OpenRouter 统一接入。
   - **不要**引入 GPT-4o / Claude / Gemini 等海外模型（用户提示中国大陆有区域访问限制）。
   - 默认模型：`deepseek/deepseek-v3.2`（见 `src/lib/ai/models.ts`）。
4. **MCP 验证最新 API**：写代码前用 WebSearch/Context7/Firecrawl MCP 拉最新 API 文档，避免用过时代码。
5. **工作流**：用户期望"设计→人工确认→分步骤开发→测试→验收"。每完成一阶段先报告等用户验收，不要默认推进。
6. **Twitter 数据源**：走 `https://twitterapi.io`（第三方），不走官方 X API。Key 已在 `.env` 里。
7. **agent skills 排在最后** —— 先把网页版做扎实再封装。

---

## 2. 技术栈（带具体版本，2026-05 验证过）

| 层 | 选型 | 版本 | 关键决策 |
|---|---|---|---|
| 框架 | Next.js | **16.2.6** | App Router + RSC + `typedRoutes: true`（路径必须真实存在） |
| 语言 | TypeScript | 5.7.3 | strict 模式 |
| UI | Tailwind CSS | **4.x** | `@theme` 语法配置主题色；不要降回 3.x |
| DB | SQLite + Prisma | **6.19.3** | **特意降级**：Prisma 7 强制把 `url` 移到 `prisma.config.ts`，太复杂，选择维持 6.x |
| 认证 | Auth.js v5 | **5.0.0-beta.31** | beta.25 与 Next 16 冲突，必须 ≥31；策略 `jwt` |
| AI SDK | `@openrouter/ai-sdk-provider` | 2.9.x | Phase 3 才会引入 |
| 字体 | Inter + JetBrains Mono | latest | 之前用过 Rajdhani/Orbitron（CP2077 时期），已淘汰 |

---

## 3. 项目结构（关键路径）

```text
ai-Hotspot monitoring/
├── docs/
│   ├── REQUIREMENTS.md         # 需求文档（含用户原话）
│   ├── DESIGN.md               # 技术方案 + ADR 决策记录（D-001 ~ D-009）
│   └── HANDOVER.md             # ← 你正在读
├── scripts/
│   └── e2e-test.ts             # 端到端测试套件（31 项）
├── prisma/
│   ├── schema.prisma           # 数据模型
│   ├── seed.ts                 # 默认管理员账户
│   ├── migrate-default-model.ts# 一次性迁移脚本（已运行）
│   └── dev.db                  # SQLite，运行时生成
├── src/
│   ├── app/
│   │   ├── page.tsx            # 主页 = HotPulse 热点雷达仪表盘（含 4 统计卡 + 筛选 + 信息流）
│   │   ├── admin/ingest/page.tsx  # 数据采集控制台（手动触发抓取）
│   │   ├── dashboard/page.tsx  # Phase 4 占位（个人仪表盘）
│   │   ├── login/page.tsx      # Phase 4 占位（登录 UI）
│   │   ├── globals.css         # HotPulse 设计系统（@theme + glass + 动画）
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts  # Auth.js handler
│   │       ├── ingest/route.ts              # POST 触发抓取（Bearer ${CRON_SECRET}）
│   │       ├── hotspots/route.ts            # GET 信息流（带筛选排序）
│   │       └── admin/stats/route.ts         # GET 统计数据
│   ├── components/
│   │   ├── Brand.tsx           # Logo + 渐变方块
│   │   ├── StatCard.tsx        # 4 个统计卡
│   │   ├── Tabs.tsx
│   │   ├── PillSelect.tsx      # 下拉筛选
│   │   ├── HotItemCard.tsx     # 信息流单卡
│   │   └── Badge.tsx
│   └── lib/
│       ├── auth.ts             # Auth.js v5 配置（Credentials + 条件性 GitHub）
│       ├── db.ts               # Prisma client 单例
│       ├── platforms.ts        # 6 平台元数据（颜色/标签/度量）
│       ├── ingest.ts           # 抓取→入库逻辑（upsert + IngestLog）
│       ├── scrapers/
│       │   ├── index.ts        # 注册中心 + runOne/runAll
│       │   ├── types.ts
│       │   ├── http.ts         # fetchWithTimeout, UA 轮换
│       │   ├── weibo.ts        # 主 API + 60s 聚合兜底
│       │   ├── zhihu.ts        # 三层兜底：cookie → HTML JSON → 聚合 API
│       │   ├── bilibili.ts     # 官方 popular API
│       │   ├── github.ts       # HTML 解析 Trending
│       │   ├── twitter.ts      # ★ TwitterAPI.io advanced_search（X-API-Key）
│       │   └── hackernews.ts   # ★ firebase 公开 API
│       └── ai/
│           └── models.ts       # ★ 7 个国产模型目录 + DEFAULT_MODEL_ID
├── types/
│   └── next-auth.d.ts          # Auth.js 类型扩展
├── .env                        # 含 OPENROUTER_API_KEY + TWITTERAPI_IO_KEY（真实 key 在里面）
├── .env.example
└── package.json
```

---

## 4. 当前状态（按 Phase）

| Phase | 状态 | 内容 |
|---|---|---|
| 1 · 骨架 | ✅ | Next 16 + Prisma 6 + Auth.js v5 + 主题 + 4 路由 |
| 2 · 多源抓取 | ✅ | 6 个源全部 SUCCESS（含 Twitter + HackerNews） |
| 2.5 · 设计切换 | ✅ | CP2077 → HotPulse 重构 |
| 2.6 · 国产模型默认 | ✅ | `deepseek/deepseek-v3.2` 已迁移所有用户 |
| 2.7 · E2E 测试 | ✅ | `scripts/e2e-test.ts` 31/31 PASS |
| **3 · AI Pipeline** | ⏳ **下一步** | 分类/去重/评分/摘要/预警 5 链 |
| 4 · 用户认证 UI + Dashboard | ⏳ | 现在 `/login` `/dashboard` 还是占位 |
| 5 · 定时任务 + 预警 + 设置 | ⏳ | 模型动态切换在这里做 |
| 6 · 集成测试 + 验收 | ⏳ | 网页版正式 release |
| 7 · Agent Skills | ⏳ | 最后做 |

---

## 5. 数据流（端到端）

```
┌─────────────┐   POST /api/ingest      ┌──────────────┐
│  用户点击    │ ───────────────────►  │ runAll() 并发  │
│ "立即扫描"   │     Bearer CRON_SECRET │ Promise.       │
└─────────────┘                        │ allSettled     │
                                       └───────┬────────┘
                                               ▼
   ┌──────┬──────┬─────────┬────────┬────────┬────────────┐
   │weibo │zhihu │bilibili │ github │twitter │ hackernews │ 6 个 scraper
   └───┬──┴──┬───┴────┬────┴───┬────┴───┬────┴───────┬────┘
       └─────┴────────┴────────┴────────┴────────────┘
                          ▼
                  RawHotItem[] 数组
                          ▼
              runIngest() → upsert
                          ▼
              ┌──────────────────────┐
              │ HotSpot              │ ← 一个唯一热点
              │  └─ HotSpotSource(s) │ ← 唯一约束 (platform, url)
              └──────────────────────┘
                          │
              ┌───────────┴──────────┐
              │ Phase 3：AI 处理      │  ← 此处空白，待开发
              │  · 分类               │
              │  · 去重合并相似热点    │
              │  · 评分（0-100）      │
              │  · 摘要生成           │
              │  · 触发预警           │
              └──────────────────────┘
                          ▼
              GET /api/hotspots → 前端信息流
```

---

## 6. 关键设计决策（精简版 ADR，详见 DESIGN.md）

| # | 决策 | 原因 |
|---|---|---|
| D-001 | Next 16 + Prisma 6 + Auth.js v5 | 用户要"最新但稳定" |
| D-002 | SQLite 本地 / PG 生产 | 多用户、轻量、迁移容易 |
| D-003 | ~~跳过 Twitter~~ → 后来通过 TwitterAPI.io 接入 | 用户提供 key |
| D-004 | 不用 shadcn，自研组件 | 用户要"独特" |
| D-005 | OpenRouter Key 系统级共享 | 降低用户注册门槛 |
| D-006 | ~~默认 gemini-2.5-flash~~ | 海外模型被取代 |
| D-007 | **默认 `deepseek/deepseek-v3.2`** | 海外模型对中文区有限制 |
| D-008 | UI 切到 HotPulse 风 | 用户提供截图作为目标 |
| D-009 | 数据源扩到 6 个（+ Twitter + HackerNews） | 用户给了 key + 顺手补 HN |

---

## 7. 历史踩过的坑（必读）

1. **Prisma 7 升级失败** → 降到 6.19.3。Prisma 7 强制 `url` 移到 `prisma.config.ts`，太复杂。
2. **Next.js 16 + next-auth beta.25 冲突** → 升到 `5.0.0-beta.31`。
3. **`create-next-app` 因目录名含空格大写失败** → 手动创建 `package.json` 并使用合规名 `ai-hotspot-monitoring`。
4. **Windows 文件锁 EPERM** → `taskkill` 老的 Node 进程后 `prisma generate` 才能跑。
5. **`typedRoutes` 严格** → `<Link href="/dashboard">` 编译时必须找得到 `app/dashboard/page.tsx`。**不要随便写不存在的链接**。
6. **Zhihu 401** → 实现了三层兜底（cookie → HTML JSON → 60s.viki.moe 聚合 API）。
7. **GitHub HTML 结构变了** → 调过两次正则才能解析当前的 `<article class="Box-row">`。
8. **MatrixRain bug**（CP2077 时期已删）→ 当时把 `canvas.clientWidth` 当可写属性。教训：canvas 的 `clientWidth` 是只读 getter，要用 `style.width`。
9. **PowerShell 不支持 `&&`** → 多命令链要么 `;` 要么放到一个 Shell 工具调用里。

---

## 8. 数据库现状

```
HotSpot          ≈ 200+  条
HotSpotSource    ≈ 200+  条（唯一约束 (platform, url)）
IngestLog        ≈ 30+   条（全部 success）
User             = 1 条（admin@nexus.local / admin12345）
Subscription     = 0 条
Alert            = 0 条

平台分布：weibo ~65 · bilibili ~59 · zhihu ~36 · hackernews ~20 · github ~17 · twitter ~16
```

---

## 9. 环境变量（`.env`）

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="dev-secret-please-replace-in-production-1234567890abcdef"
AUTH_URL="http://localhost:3000"
AUTH_GITHUB_ID=""                # 留空则不启用 GitHub OAuth
AUTH_GITHUB_SECRET=""
OPENROUTER_API_KEY="sk-or-v1-..."  # 用户提供（已配置）
CRON_SECRET="dev-cron-secret-please-replace-1234567890"
FIRECRAWL_API_KEY=""             # 暂未使用（Phase 2 兜底备用）
TWITTERAPI_IO_KEY="new1_..."     # 用户提供（已配置）
```

---

## 10. 30 秒快速验证状态

```bash
# 1) 类型检查
npm run type-check

# 2) 启动 dev（如未启动）
npm run dev

# 3) E2E 测试
npx tsx scripts/e2e-test.ts

# 期待输出 "Passed: 31 / Failed: 0"
```

---

## 11. 待办（Phase 3 起点）

### Phase 3：AI Pipeline（用户已确认进入）

需要创建：

1. `src/lib/ai/openrouter.ts` —— OpenRouter 客户端封装（用 `@openrouter/ai-sdk-provider`）
2. `src/lib/ai/prompts/` —— 5 个 prompt 模板：
   - `classify.ts` —— 分类（tech / society / entertainment / finance / sports / culture / science / other）
   - `dedupe.ts` —— 跨平台相似热点合并
   - `score.ts` —— 0-100 评分
   - `summarize.ts` —— 摘要生成（含 tags）
   - `alert-match.ts` —— 匹配用户订阅触发预警
3. `src/lib/ai/pipeline.ts` —— 串联以上 5 链
4. `src/app/api/process/route.ts` —— POST 触发 AI 处理未处理的 HotSpot
5. **可选**：抓取后自动 AI 处理（钩到 `ingest.ts` 末尾）

输出落到 `HotSpot` 的：`category` / `tags` / `score` / `summary`（已有字段）

完成后：
- 前端 `HotItemCard` 上的 `MEDIUM` / `可信` / `分类` badge 用上真实 AI 输出
- 跑 `scripts/e2e-test.ts` 时加 AI 相关用例
- 报告等用户验收，然后进 Phase 4

### 已记录的 Phase 4-7 待办

见 README + DESIGN.md。

---

## 12. MCP 配置（项目级）

`.cursor/mcp.json` 内容：

```json
{
  "mcpServers": {
    "context7": { "command": "npx", "args": ["-y", "@upstash/context7-mcp@latest"], "env": { "CONTEXT7_API_KEY": "${env:CONTEXT7_API_KEY}" } },
    "firecrawl": { "command": "npx", "args": ["-y", "firecrawl-mcp@latest"], "env": { "FIRECRAWL_API_KEY": "${env:FIRECRAWL_API_KEY}" } }
  }
}
```

`.vscode/mcp.json` 是 VSCode 用的（不同格式），两份都保留。

可用 MCP：
- **`user-amap-maps`** —— 高德地图（项目本身不用到）
- **context7** —— 库文档查询
- **firecrawl** —— 网页抓取兜底（目前 scraper 没用到，但 key 字段已留）

---

## 13. 工作流模板（给下一个 AI）

用户期望的对话模板：

```
1. 我提出需求/反馈
2. 你（AI）先用 MCP 拉最新 API 文档（避免过时代码）
3. 拆分 TODO，必要时 AskQuestion 让我确认方向
4. 分步骤实现，每一步报告进度
5. 跑测试（npx tsx scripts/e2e-test.ts 或新增用例）
6. 报告结果 + 把验收点说清楚
7. 等我确认再进下一阶段
```

**重要风格**：
- 中文回复
- 不写废话注释（不解释代码字面意思，只写非显然意图）
- 不用 emoji（除非用户明确要求）
- 文件操作不要用 cat/sed/awk，用 Read/StrReplace/Write
- 长命令 PowerShell 不支持 `&&`，要么 `;` 要么单独调用

---

## 14. 入口参考

- 详细需求 → `docs/REQUIREMENTS.md`
- 详细技术方案 + ADR → `docs/DESIGN.md`
- 用户验收过的测试套件 → `scripts/e2e-test.ts`
- 用户最初的诉求原话 + 历次澄清回复 → 当前对话的最早几条消息

**祝下一个 AI 玩得愉快 ✨**
