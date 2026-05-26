# HotPulse · AI 项目交接文档

> **此文档面向"下一个 AI"** —— 新开对话时让 AI 快速恢复完整项目上下文，避免重新理解或踩历史决策的坑。
> 最后更新：2026-05-26（**v5**，含信息流交互修复 + 科技相关性源头过滤）

---

## 0. 快速事实卡

| 字段 | 值 |
|---|---|
| **项目名** | HotPulse · AI 热点监控（曾名 NEXUS / AI Hotspot Monitoring，**当前品牌：HotPulse**） |
| **目标** | 抓取多源 9 平台**科技**热点 → AI 分类评分摘要 → 个性化预警 |
| **代码路径** | `d:\project001\ai-Hotspot monitoring` |
| **包名** | `ai-hotspot-monitoring`（`package.json`） |
| **运行平台** | Windows（PowerShell），本地开发 |
| **GitHub 仓库** | <https://github.com/dada628/ai-Hotspot-monitoring>（main 分支已托管） |
| **当前阶段** | Phase 1+2+2.5+2.6+2.7+2.8+2.9 ✅ · **Phase 3 AI Pipeline ✅** · **Phase 2.X 详情页 + 相关推荐 + 多类目扩展 ✅** · **Phase 2.Y v5 信息流交互修复 + 科技源头过滤 ✅** · Phase 4 用户认证 UI 待开工 |
| **测试** | `npx tsx scripts/e2e-test.ts` —— **61 项 PASS**（v4 55 项 + v5 新增 6 项 TechFilter 单元测） |
| **dev URL** | <http://localhost:3000> |
| **AI 默认模型** | `deepseek/deepseek-v3.2`（OpenRouter，含 response-healing 插件） |
| **HEAD commit** | `6d4bf79` chore(scripts): 一次性清理历史非科技 HotSpot 脚本 |

---

## 1. 用户偏好与硬约束（CRITICAL）

> 这些是用户**明确表达过**的约束，违反会被打回。

### 1.1 设计 / 风格

1. **前端要"独特、不千篇一律"** —— 不用现成 UI 库（不用 shadcn/MUI/Ant）。Aceternity UI 例外：它是**单文件复制粘贴**式（已 paste 到 `src/components/aceternity/`），不是依赖型 UI 库。
2. **UI 风格 = HotPulse 2.0 Cyber Calm**：深蓝太空 + 玻璃拟态 + **cyan-blue 单调系**（紫色降权为次要 tone）+ electric cyan `#00e5ff` 作扫描指示色。
   - 已经历两次切换：CP2077 黄黑 → HotPulse 1.0（蓝紫）→ HotPulse 2.0 Cyber Calm。**不要回退**。
3. **AI 模型仅用国产**：DeepSeek / Qwen / GLM / Kimi —— 通过 OpenRouter 统一接入；默认 `deepseek/deepseek-v3.2`。**不要**引入 GPT-4o / Claude / Gemini。
4. **MCP 验证最新 API**：写代码前用 WebSearch/Context7/Firecrawl/WebFetch 拉最新 API 文档，避免过时代码。

### 1.2 Git / 流程（**v2 新增 · CRITICAL**）

5. **每完成一个完整任务/小阶段就 commit + push** —— 见 `.cursor/rules/git-auto-push.mdc`，`alwaysApply: true`。
6. **commit 和 push 都要先报告再执行**：
   - **第一次确认**：commit message + 改动列表 → AskQuestion → 执行 commit
   - **第二次确认**：push 之前 → AskQuestion → 执行 push
7. **凡是需要用户决定/确认的地方，一律用 AskQuestion 工具呈现选择题**，**不要**写"请回复 OK/确认"这类纯文字。这条规则**也写在了 git-auto-push.mdc 里**。
8. **不确定的内容必须 AskQuestion**：选源、改 schema、删除/重命名文件、新依赖等。

### 1.3 工作流

9. 用户期望"设计→人工确认→分步骤开发→测试→验收"。每完成一阶段先报告等用户验收，**不要默认推进下一阶段**。
10. 中文回复；不写废话注释；不用 emoji（除非用户明确要求）。
11. PowerShell 不支持 `&&` → 用 `;` 或拆成多次 Shell 调用。
12. 多行 commit message → 用 `.git/COMMIT_MSG_TMP` 文件 + `git commit -F`（PowerShell HEREDOC 对中文引号嵌套解析有 bug）。
13. **agent skills 排在最后** —— 先把网页版做扎实再封装。

### 1.4 数据源

14. **Twitter** 走 `https://twitterapi.io`（第三方，已配 key）。**用户决定 Twitter 当前不动**，不调门槛。
15. **机器之心 RSS 已废**（`/rss` 变成商业页），已用 **InfoQ 中文** 替代。

---

## 2. 技术栈（带具体版本，2026-05 验证过）

| 层 | 选型 | 版本 | 关键决策 |
|---|---|---|---|
| 框架 | Next.js | **16.2.6** | App Router + RSC + `typedRoutes: true`（路径必须真实存在） |
| 语言 | TypeScript | 5.7.3 | strict 模式 |
| UI | Tailwind CSS | **4.x** | `@theme` 语法配置主题色；不要降回 3.x |
| 动画 | **motion** | **^12.x** | framer-motion 的官方轻量版，~25KB gz，Aceternity Spotlight 在用 |
| DB | SQLite + Prisma | **6.19.3** | **特意降级**：Prisma 7 强制 `url` 移到 `prisma.config.ts`，太复杂 |
| DB 同步 | **`prisma db push`** | — | 项目**从来没用过** `prisma migrate`，没有 migration 历史。改 schema 直接 push 即可 |
| 认证 | Auth.js v5 | **5.0.0-beta.31** | beta.25 与 Next 16 冲突，必须 ≥31；策略 `jwt` |
| RSS 解析 | **rss-parser** | **^3.x** | google-news / infoq 在用 |
| **AI SDK** | **`ai`** | **^6.0.191** | Vercel AI SDK v6 · `generateObject` + Zod schema |
| **AI Provider** | **`@openrouter/ai-sdk-provider`** | **^2.9.0** | OpenRouter 接入器 |
| **Zod** | `zod` | **^3.25.76** | ai@6 强约束 ≥3.25.76 \|\| ^4.x，**已升级**；与 auth.ts 兼容 |
| 字体 | Inter + JetBrains Mono | latest | CP2077 时期用过 Rajdhani/Orbitron，已淘汰 |

---

## 3. 项目结构（关键路径）

```text
ai-Hotspot monitoring/
├── .cursor/
│   ├── mcp.json                      # Cursor MCP 配置（context7 / firecrawl）
│   └── rules/
│       └── git-auto-push.mdc         # ★ alwaysApply 规则：commit + push 流程 + AskQuestion 强制
├── docs/
│   ├── REQUIREMENTS.md
│   ├── DESIGN.md                     # ADR D-001 ~ D-012
│   └── HANDOVER.md                   # ← 你正在读
├── scripts/
│   ├── e2e-test.ts                   # ★ v5 升至 61 项（v4 55 + v5 新增 6 项 TechFilter）
│   ├── backfill-engagement-score.ts  # 一次性回填工具（公式调整后可重跑）
│   ├── cleanup-non-tech.ts           # ★ v5 新增 · 一次性清理非科技 HotSpot（dry-run/--apply）
│   ├── debug-stats.ts                # ★ 本地诊断脚本（已在 .gitignore，不进 git）
│   ├── debug-scan.ts                 # ★ 本地扫描验证（已在 .gitignore）
│   └── debug-ai-smoke.ts             # ★ v3 新增 · AI 链 smoke 测试（已在 .gitignore）
├── prisma/
│   ├── schema.prisma                 # ★ v4 新增 keyPoints / entities / processedAt 字段
│   ├── seed.ts
│   ├── migrate-default-model.ts
│   └── dev.db                        # SQLite，运行时生成
├── src/
│   ├── app/
│   │   ├── page.tsx                  # ★ v5 修改 · time/cred URL 透传 + 相关性 pill 无 kw 时禁用
│   │   ├── hotspot/[id]/page.tsx     # ★ v4 新增 · 单条详情页（单列长页布局）
│   │   ├── admin/ingest/page.tsx     # 数据采集控制台
│   │   ├── dashboard/page.tsx        # Phase 4 占位
│   │   ├── login/page.tsx            # Phase 4 占位
│   │   ├── globals.css               # HotPulse 2.0 设计系统
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── ingest/route.ts                  # POST 触发抓取（Bearer ${CRON_SECRET}）
│   │       ├── process/route.ts                 # ★ v3 新增 · POST 触发 AI Pipeline
│   │       ├── hotspots/route.ts                # ★ v5 重写 · 5 种排序差异化 + time 窗口 + relevance 需 kw
│   │       ├── hotspots/[id]/route.ts           # ★ v4 新增 · GET 单条详情（14 字段 + sources）
│   │       ├── hotspots/[id]/related/route.ts   # ★ v4 新增 · GET 相关推荐
│   │       └── admin/stats/route.ts
│   ├── components/
│   │   ├── Brand.tsx
│   │   ├── StatCard.tsx              # 内嵌 card-spotlight 鼠标跟手光晕
│   │   ├── Tabs.tsx
│   │   ├── PillSelect.tsx
│   │   ├── HotItemCard.tsx           # ★ v4 修改 · 标题点击跳 /hotspot/[id]，底部"原文 ↗"小链接
│   │   ├── Badge.tsx
│   │   └── aceternity/               # ★ Aceternity UI（自存，单文件复制式）
│   │       ├── Spotlight.tsx         # ⚠️ 注意：无 fill prop，只接受 gradientFirst/Second/Third
│   │       ├── Sparkles.tsx          # 纯 Canvas 粒子，无 tsparticles 依赖
│   │       ├── CardSpotlight.tsx     # 鼠标跟手通用组件
│   │       └── BorderBeam.tsx        # 边框流光（紧急/扫描中）
│   └── lib/
│       ├── auth.ts
│       ├── db.ts
│       ├── platforms.ts              # 9 平台元数据
│       ├── ingest.ts                 # 抓取→入库；engagementScore 计算
│       ├── score.ts                  # 本地兜底评分（9 平台公式 + 24h 衰减）
│       ├── tech-filter.ts            # ★ v5 新增 · 科技关键词白名单 + isTechRelated/isBilibiliTechPartition
│       ├── scrapers/
│       │   ├── index.ts              # 注册中心（9 个 scraper）
│       │   ├── types.ts              # Platform 类型（9 个）
│       │   ├── http.ts
│       │   ├── github.ts             # GitHub trending（100% 科技，不过滤）
│       │   ├── weibo.ts              # ★ v5 修改 · 出口套 isTechRelated（标题）
│       │   ├── zhihu.ts              # ★ v5 修改 · 出口套 isTechRelated（标题 + excerpt）
│       │   ├── bilibili.ts           # ★ v5 修改 · tname 分区白名单（科技 + 知识）
│       │   ├── twitter.ts            # TwitterAPI.io（查询已限定 AI 关键词，不动）
│       │   ├── hackernews.ts         # ★ v5 修改 · topstories 路加 isTechRelated 软过滤
│       │   ├── reddit.ts             # r/LocalLLaMA + r/MachineLearning（100% AI，不过滤）
│       │   ├── google-news.ts       # ★ v5 收紧 · 7 路 → 5 路（删 finance/society，留 ai/tech/science）
│       │   └── infoq.ts              # InfoQ 中文 RSS（100% 科技，不过滤）
│       └── ai/                       # ★ v3 全新目录（AI Pipeline）
│           ├── models.ts             # 7 个国产模型 + DEFAULT_MODEL_ID
│           ├── openrouter.ts         # ★ v3 · OpenRouter 客户端封装（response-healing 插件）
│           ├── schemas.ts            # ★ v3 · Zod schemas（Classify/Score/Summary）+ AiEnrichedFields 类型
│           ├── pipeline.ts           # ★ v3 · processBatch 编排（classify→summarize→score 串行）
│           ├── alert-match.ts        # ★ v3 · 订阅规则匹配 + Alert 创建/更新
│           └── prompts/
│               ├── classify.ts      # ★ v3 · category + tags
│               ├── score.ts         # ★ v3 · 0-100 + trendVelocity
│               └── summarize.ts     # ★ v3 · summary + keyPoints + entities
├── types/
│   └── next-auth.d.ts
├── .gitignore                        # 含 debug-stats / debug-scan / debug-ai-smoke 排除
├── .env                              # OPENROUTER_API_KEY + TWITTERAPI_IO_KEY + CRON_SECRET
├── .env.example
└── package.json
```

---

## 4. 当前状态（按 Phase）

| Phase | 状态 | 内容 |
|---|---|---|
| 1 · 骨架 | ✅ | Next 16 + Prisma 6 + Auth.js v5 + 主题 + 4 路由 |
| 2 · 多源抓取 | ✅ | 原 6 个源全部 SUCCESS |
| 2.5 · 设计切换 | ✅ | CP2077 → HotPulse 1.0 重构 |
| 2.6 · 国产模型默认 | ✅ | `deepseek/deepseek-v3.2` 已迁移所有用户 |
| 2.7 · E2E 测试 | ✅ | `scripts/e2e-test.ts` 起步 31/31 PASS |
| 2.8 · UI 升级 HotPulse 2.0 Cyber Calm | ✅ | Aceternity UI（Spotlight/Sparkles/CardSpotlight/BorderBeam）+ Hero + cyan-blue + SVG |
| 2.9 · 数据源加固 | ✅ | 本地兜底评分 + Reddit/Google News/InfoQ + HN 双源混合 |
| **3 · AI Pipeline** | ✅ **v3 完成** | classify + summarize + score 三链（**跳过 dedupe**）+ alert-match + `/api/process` + 前端按钮 |
| **2.X · 信息丰富度广度** | ✅ **v4 完成** | Google News 7 路多类目 + 详情页 + keyPoints/entities/processedAt 字段 + 相关推荐 |
| **2.Y · 信息流交互修复 + 科技过滤** | ✅ **v5 完成** | 5 种排序差异化（hotness/importance/relevance/2 时间）+ time 窗口生效 + relevance 需 keyword + 科技相关性源头过滤（tech-filter + 5 scrapers 收紧 + 清理脚本，DB 710→337） |
| 4 · 用户认证 UI + Dashboard | ⏳ **下一步** | 现在 `/login` `/dashboard` 还是占位 |
| 5 · 定时任务 + 预警 + 设置 | ⏳ | 模型动态切换在这里做 |
| 6 · 集成测试 + 验收 | ⏳ | 网页版正式 release |
| 7 · Agent Skills | ⏳ | 最后做 |

> **关于 dedupe（去重）**：v3 商讨阶段用户选择**暂缓**——理由是单条 HotSpot 跨平台合并需要 embedding + 多对多重写，风险高、ROI 待评估。v1 每条 HotSpot 独立处理。如果未来要做：建议先用 cosine similarity + 阈值合并，再考虑 LLM judge。

---

## 5. 数据流（端到端）

```
┌─────────────┐   POST /api/ingest      ┌──────────────┐
│  用户点击    │ ───────────────────►  │ runAll() 并发  │
│ "立即扫描"   │     Bearer CRON_SECRET │ Promise.       │
└─────────────┘                        │ allSettled     │
                                       └───────┬────────┘
                                               ▼
   ┌──────┬──────┬─────────┬────────┬────────┬────────┬───────┬───────────┬───────┐
   │weibo │zhihu │bilibili │ github │twitter │ hn 2x  │reddit │googlenews │ infoq │ 9 scrapers
   └───┬──┴──┬───┴────┬────┴───┬────┴───┬────┴───┬────┴──┬────┴────┬──────┴───┬───┘
       │     │        │        │        │        │       │         │          │
       ▼     ▼        ▼        │        │        ▼       │         ▼          │
       isTechRelated tname     │        │       isTech-  │         5 路收紧   │
       过滤 标题  分区白名单   │        │       Related  │         (v5)        │
       (v5)  (v5)   (v5)       │        │       软过滤   │                     │
                                │        │       (v5)    │                     │
                                ▼        ▼               ▼                     ▼
                              github/twitter/reddit/infoq 信任直通（v5：HN topstories 收紧后等同信任）
       └─────┴────────┴────────┴────────┴────────┴───────┴─────────┴──────────┘
                          ▼
                  RawHotItem[] 数组（已过滤掉非科技）
                          ▼
              runIngest() → upsert
                          │
                          ├──→ calcEngagementScore(platform, metric, fetchedAt)
                          │     │  分平台公式：log10(raw) × multiplier
                          │     │  24h 衰减：每过 24h −5 分，下限 30
                          │     └→ 写入 HotSpot.engagementScore（多源取 max）
                          ▼
              ┌──────────────────────┐
              │ HotSpot              │ ← 一个唯一热点
              │  └─ HotSpotSource(s) │ ← 唯一约束 (platform, url)
              └──────────────────────┘
                          │
              ┌───────────┴──────────────────────────────────┐
              │ Phase 3：AI Pipeline（手动触发：UI 按钮/API）│  ← v3 上线
              │   POST /api/process?limit=N&scope=unprocessed │
              │           Bearer ${CRON_SECRET}                │
              │                       │                        │
              │   processBatch()      │                        │
              │     ├─→ classify  →  category + tags           │
              │     ├─→ summarize →  summary + keyPoints + entities │ ← v4 持久化后两个
              │     └─→ score     →  0-100 score + trendVelocity    │
              │                       │                        │
              │   写回 HotSpot：category/tags/summary/score/   │
              │     trendVelocity/keyPoints/entities/processedAt│
              │                       │                        │
              │   runAlertMatch() → 按订阅规则创建 Alert       │
              └────────────────────────────────────────────────┘
                          ▼
              GET /api/hotspots（★ v5 重写：5 种排序差异化）
                · newest_seen    : firstSeenAt desc
                · newest_updated : updatedAt desc
                · importance     : [score desc, engagementScore desc, updatedAt desc]
                · hotness        : 内存复合 effectiveScore×0.7 + log(sourceCount+1)×3 + velocity×0.75
                · relevance      : title/tag/summary 命中加权（3/2/1）；无 keyword 时降级 hotness
                筛选：platform / severity / time(1h|6h|24h|7d) / cred（占位）/ q
                          ▼
              前端 effectiveScore = score > 0 ? score : engagementScore
                          ▼
              HotItemCard（标题点击跳详情页 + 底部"原文 ↗"小链接）
                          ▼
              GET /api/hotspots/[id]         ← v4 单条 14 字段
              GET /api/hotspots/[id]/related ← v4 相关推荐
                          ▼
              /hotspot/[id] 详情页（单列长页）
              · Hero · 4 评分卡 · AI 摘要 · 关键要点 · 关键实体
              · 多源对比 · 相关热点（6 条迷你卡）· 元数据
```

---

## 6. 关键设计决策（精简 ADR）

| # | 决策 | 原因 |
|---|---|---|
| D-001 | Next 16 + Prisma 6 + Auth.js v5 | 用户要"最新但稳定" |
| D-002 | SQLite 本地 / PG 生产 | 多用户、轻量、迁移容易 |
| D-003 | Twitter 走 TwitterAPI.io（不走官方 X API） | 用户提供 key |
| D-004 | 不用 shadcn，自研组件 | 用户要"独特" |
| D-005 | OpenRouter Key 系统级共享 | 降低用户注册门槛 |
| D-006 | ~~默认 gemini-2.5-flash~~ | 海外模型被淘汰 |
| D-007 | 默认 `deepseek/deepseek-v3.2` | 海外模型对中文区有限制 |
| D-008 | UI 切到 HotPulse 风 | 用户提供截图作为目标 |
| D-009 | 数据源扩到 6 个（+ Twitter + HackerNews） | 用户给了 key + 顺手补 HN |
| **D-010** | **Git 流程：commit/push 都用 AskQuestion 双确认** | 用户偏好"先报告再执行"+"提问式交互" |
| **D-011** | **接入 Aceternity UI（单文件复制式，不算"UI 库"）** | 用户明确要求 + Aceternity 是 paste-able 代码 |
| **D-012** | **本地兜底评分 engagementScore** | AI Pipeline 未上线，前端 score=0 导致排序混乱 |
| **D-013** | **数据源扩到 9 个（+ Reddit/Google News/InfoQ）** | 用户要求"多个搜索引擎"+ AI 工程师导向 |
| **D-014** | **机器之心换 InfoQ** | 机器之心官方 RSS 废弃为商业页 |
| **D-015** | **`prisma db push` 替代 `prisma migrate`** | 项目无 migration 历史，db push 简单可行 |
| **D-016** | **AI Pipeline 串行（非并行）+ 单批 limit 默认 5** | OpenRouter 速率 + token 成本控制；可被 `?limit=` 覆盖 |
| **D-017** | **v1 跳过 dedupe** | 跨平台合并风险高、ROI 不明；用户拍板暂缓到 v2 |
| **D-018** | **AI 处理触发=手动**（UI 按钮 + `/api/process`） | v1 不自动触发，避免每次 ingest 都吃 token；Phase 5 再做定时 |
| **D-019** | **Zod schema 内 `.describe()` 引导 LLM** | structured output 比 free-form 更稳；用 ai SDK v6 `generateObject` |
| **D-020** | **HotSpot 加 keyPoints/entities/processedAt 字段** | v3 时 SummarySchema 已产出 keyPoints/entities 但没存；v4 详情页需要 → 持久化 |
| **D-021** | **Google News 多类目召回 + `categoryHint` 仅作元数据** | AI 仍自行判断 category，避免桶错位；hint 给未来"按类目筛选"留接口 |
| **D-022** | **相关热点 = 内存评分（非向量库）** | 候选 200 条规模够用；公式 `tagOverlap×0.5 + categoryMatch×0.3 + recency×0.15 + scoreBonus×0.05`；未来要扩可换 cosine similarity |
| **D-023** | **v5 · 5 种排序差异化（hotness/importance/relevance 各异）** | 用户图片反馈"排序点了毫无反应"，根因是后端三者共用 ORDER BY。新设计：importance 严格 AI score，hotness 内存复合（跨源数 + velocity 加权），relevance 字段命中加权且要求 keyword；用户选 fallback 语义（importance 未 AI 处理回退 engagementScore） |
| **D-024** | **v5 · 信息流加 time 窗口；cred 仅接收参数不过滤** | time（1h/6h/24h/7d）必须前后端都支持，之前前端 state 改了但参数没传；cred 暂留占位，等未来"平台可靠性分层"再启用 |
| **D-025** | **v5 · 科技相关性源头过滤（不入库非科技）** | 用户要求"信息都跟科技相关"，采用思路 3 混合：weibo/zhihu 标题关键词白名单 / bilibili tname 分区白名单（科技+知识） / google-news 删 finance+society 2 路 / hackernews topstories 软过滤；前端不加 toggle，全靠源头过滤 |
| **D-026** | **v5 · 清理脚本信任 5 平台（github/infoq/reddit/hackernews/twitter）** | HN/Twitter 历史里有 ~10% 政经/科普内容，但关键词表对英文工程术语（C compiler / encryption / bytecode / Codex / Grok）覆盖不全，强删会误杀 ~50%；统一信任避免误杀，只清理 weibo/zhihu/bilibili/googlenews 4 个噪音源（710→337，0% 误杀） |

---

## 7. 历史踩过的坑（必读）

### 项目早期
1. **Prisma 7 升级失败** → 锁 6.19.3
2. **Next 16 + next-auth beta.25 冲突** → 升到 `5.0.0-beta.31`
3. **`create-next-app` 因目录名含空格大写失败** → 手动创建 `package.json`
4. **Windows 文件锁 EPERM** → `taskkill /F /IM node.exe` 后 `prisma generate` 才能跑（本对话又踩了一次）
5. **`typedRoutes` 严格** → `<Link href="/x">` 中 `/x` 必须真实存在
6. **Zhihu 401/403** → 三层兜底（cookie → HTML JSON → 60s.viki.moe）
7. **GitHub HTML 结构变了** → 调过两次正则
8. **MatrixRain（CP2077 时期）的 `canvas.clientWidth` 错当可写属性** → 已删
9. **PowerShell 不支持 `&&`** → 用 `;` 或单独调用

### v2 新踩坑
10. **PowerShell HEREDOC 中文引号嵌套**：`git commit -m "$(@'...'@)"` 中如果 message 含 `"...AI 热点"` 这种内层双引号，PowerShell 会误把内层引号当参数边界。**解决**：写到 `.git/COMMIT_MSG_TMP` 文件，`git commit -F`。
11. **`git push` 输出在 PowerShell 被标红**：git 把进度信息打到 stderr，PowerShell 当作错误。**实际 exit code 0 就是成功**，看输出的 `main -> main` 才是真信号。
12. **`prisma migrate dev` 触发 reset database**：因为项目无 migration 历史。**解决**：用 `db push`，不要用 migrate dev。
13. **机器之心官方 `/rss` 已废**：现在返回 HTML 商业页面（"数据服务"页），不是 RSS XML。**解决**：用 InfoQ `https://www.infoq.cn/feed.xml` 替代。
14. **`Record<Platform, Scraper>` 类型严格**：扩展 Platform 类型时，必须同时在 SCRAPERS 注册新 scraper，否则 TS 报错。**策略**：commit 拆分时类型 + scraper 实现要在同一个 commit。

### v3 新踩坑（Phase 3 AI Pipeline）
15. **`ai@^6.0.0` 强约束 `zod@^3.25.76 \|\| ^4.x`**：项目当时是 `zod@^3.23.8`，npm 会抛 ERESOLVE。**解决**：`npm install zod@^3.25.76`，verify auth.ts/schemas.ts 中已有 zod usage 不受影响（patch 升级）。
16. **WebFetch 拉 ai-sdk.dev 超时**：MCP fetch 间歇性失败。**解决**：fallback 到 WebSearch + 多关键词组合，最终确认 `generateObject` 在 v6 仍可用。
17. **PowerShell 显示 UTF-8 JSON 中文乱码**：API 响应 `{"summary":"人工智能..."}` 在 PowerShell 终端显示为 `{"summary":"äººå·¥..."}`。**这是终端显示问题，不是数据问题**。验证：用 `ConvertFrom-Json | Select` 解析后再 print 也乱码，但浏览器看是正常的。**忽略即可**，不要尝试改编码。
18. **Windows 文件锁 EPERM（再次踩）**：`prisma db push` 时 `prisma generate` 阶段失败 → `EPERM: operation not permitted, rename 'query_engine-windows.dll.node.tmp...'`。**解决**：`taskkill /F /IM node.exe`（杀掉所有 dev server），然后 `npx prisma generate` 重跑；最后重启 `npm run dev`。

### v4 新踩坑（详情页 + 相关推荐）
19. **typedRoutes 严格模式下动态路由参数赋值给变量会报错**：
    ```ts
    const href = `/hotspot/${id}` as const;   // ✗ TS2322
    <Link href={href}>...                      // ✗ 不被 RouteImpl 识别
    ```
    **解决**：用 `as Route` 断言 + 直接传 JSX：
    ```ts
    import type { Route } from "next";
    <Link href={`/hotspot/${id}` as Route}>...
    ```
    或重启 dev server 让 Next 重新生成 `.next/types`。
20. **Aceternity Spotlight 没有 `fill` prop**：实际 props 是 `gradientFirst/Second/Third`。**解决**：写代码前先 Grep `interface SpotlightProps` 看真实定义；不假设 API。
21. **`<HotItemCard>` 整张卡是 `<a>` 时无法嵌套 `<Link>`/`<a>`**：HTML 不允许 `<a>` 嵌 `<a>`。**解决**：v4 改为 `<div>` + 标题独立 `<Link>` + 底部"原文 ↗" `<a target=_blank>` + 该 `<a>` 加 `e.stopPropagation()` 防止冒泡到任何父元素。
22. **AI 相关推荐冷启动数据稀疏**：刚部署时大部分 HotSpot 没经 AI 处理，`category=null` & `tags=[]` → 所有候选 relScore=0.15（只有 recency 贡献）。**这不是 bug**，是数据现状。**解决**：建议演示前先跑 8-20 条 AI 处理，让相关性算法有"原料"。

### v5 新踩坑（信息流交互修复 + 科技源头过滤）

23. **Prisma SQLite 不支持表达式 orderBy**：`hotness` 排序想用复合公式 `effectiveScore×0.7 + log(sourceCount+1)×3 + velocity×0.75`，但 Prisma SQLite 的 orderBy 只支持字段。**解决**：拉一个候选池（limit×4，上限 200），用 `[score desc, engagementScore desc, updatedAt desc]` 预排序保证 AI 高分项在前，再在内存里复合打分二次排序。`relevance` 同样做内存计算（命中加权）。
24. **前端两个筛选（time/cred）state 改了但 URL 没传**：用户图片反馈"点了没反应"，根因是 `loadAll` 的 `URLSearchParams` 漏写 time/cred 两个字段，后端也没接。这是典型的"前后端约定不对齐"。**解决**：前后端同时补，且 cred 即使本期不过滤也接收占位，避免 future 字段污染。
25. **`isTechRelated('said')` 等英文短词误命中**：关键词表里有 "AI"，如果用 `lowercase.includes("ai")` 会命中 "said" / "paid"。**解决**：把英文词分两层——长词（≥5 字母）用 lowercase includes、短词（如 AI/ML/GPT/GPU）用 `\b...\b` 正则边界。
26. **HN/Twitter 强删会误杀大量科技内容**：第一版清理脚本只信任 github/infoq/reddit，结果 HN 36 条/Twitter 11 条待删里 ~50%/~70% 是真科技（"C compilers"、"Twilio"、"Codex"、"Gnutella"、"bytecode" 这些专业词不在关键词表）。**解决**：把 hackernews 和 twitter 也加入 `ALWAYS_KEEP_PLATFORMS`（信任）；脚本只清理 weibo/zhihu/bilibili/googlenews 4 个真噪音源；删除 710→337（0% 误杀）。
27. **PowerShell 中 `\$` 被当变量解析**：用 `npx tsx -e "...db.\$disconnect()..."` 会报 `检索不到变量"$disconnect"`。**解决**：内联 -e 改为写到临时文件 `scripts/_inspect-cleanup.ts` 跑，跑完再 Delete 删除。
28. **B 站分区白名单收得过严会数据稀疏**：用户只勾"科技"分区时，B 站 50 条热门里平均只能命中 2-5 条；加上"知识"分区后命中 5-15 条，相对稳定。**经验**：分区白名单宁可多 1 个相关大类。

---

## 8. 数据库现状（2026-05-26 21:30 快照 · v5 清理后）

```
HotSpotSource 分布（337 条 HotSpot · 较 v4 522 条减少是因 v5 清理掉 373 条非科技数据）：
  googlenews    79   ← v5 删 finance/society 路后，旧多类目数据仍存
  twitter       71   ← 信任不动
  hackernews    54   ← 信任不动；topstories 软过滤新生效
  reddit        50
  infoq         30
  github        23
  zhihu         15   ← v5 从 66 → 15（命中科技关键词的）
  weibo          9   ← v5 从 119 → 9（命中科技关键词的）
  bilibili       6   ← v5 从 78 → 6（科技/知识分区的）

HotSpot 字段填充情况（清理后比例提高）：
  HotSpot.score:           ~10 条（手动跑过 AI 处理的）
  HotSpot.engagementScore: ~280 条
  HotSpot.summary:         ~10 条
  HotSpot.keyPoints:       ~10 条
  HotSpot.entities:        ~10 条
  HotSpot.processedAt:     ~10 条

User             = 1 条（admin@nexus.local / admin12345 · 默认模型 deepseek/deepseek-v3.2）
Subscription     = 0 条（Phase 5 才会出现）
Alert            = 0 条
IngestLog        持续累积（每次 ingest 一条 per 平台）

注：要让前端"看上去丰富"，建议演示前手动跑 20-30 条 AI 处理：
  Invoke-WebRequest -Uri 'http://localhost:3000/api/process?limit=20&scope=unprocessed' `
    -Method POST -Headers @{Authorization='Bearer dev-cron-secret-please-replace-1234567890'}

注 2：v5 之后每次 ingest 入库都会被 tech-filter 过滤，weibo/zhihu 每次新增 0-8 条，
bilibili 0-5 条，是正常的"低召回 + 高质量"状态。不必担心数量变少。
```

---

## 9. 环境变量（`.env`）

```env
DATABASE_URL="file:./dev.db"
AUTH_SECRET="dev-secret-please-replace-in-production-1234567890abcdef"
AUTH_URL="http://localhost:3000"
AUTH_GITHUB_ID=""                # 留空则不启用 GitHub OAuth
AUTH_GITHUB_SECRET=""
OPENROUTER_API_KEY="sk-or-v1-..."  # 已配
CRON_SECRET="dev-cron-secret-please-replace-1234567890"
FIRECRAWL_API_KEY=""             # 未使用
TWITTERAPI_IO_KEY="new1_..."     # 已配
```

---

## 10. 30 秒快速验证状态

```powershell
# 1) 类型检查
npm run type-check

# 2) 启动 dev（如未启动）
npm run dev

# 3) E2E 测试 —— 55 项 PASS（含 AI 静态/路由 + 详情页 + 相关推荐）
npx tsx scripts/e2e-test.ts
# 想跑真实 AI 集成：
# $env:RUN_AI_TESTS=1; npx tsx scripts/e2e-test.ts; Remove-Item env:RUN_AI_TESTS

# 4) 触发一次抓取（dev secret 见 .env）
$hdr = @{ Authorization = 'Bearer dev-cron-secret-please-replace-1234567890' }
Invoke-WebRequest -Uri 'http://localhost:3000/api/ingest' -Method POST -Headers $hdr -UseBasicParsing

# 5) 触发 AI 处理（默认 limit=5，scope=unprocessed）
Invoke-WebRequest -Uri 'http://localhost:3000/api/process?limit=5' -Method POST -Headers $hdr -UseBasicParsing

# 6) 单条详情 API（先拿一个 id）
$id = (Invoke-WebRequest -Uri 'http://localhost:3000/api/hotspots?limit=1' -UseBasicParsing).Content | ConvertFrom-Json | % { $_.items[0].id }
Invoke-WebRequest -Uri "http://localhost:3000/api/hotspots/$id" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:3000/api/hotspots/$id/related?limit=6" -UseBasicParsing

# 7) 浏览器访问
# http://localhost:3000/              # 信息流（点卡片标题跳详情页）
# http://localhost:3000/hotspot/$id   # 详情页
# http://localhost:3000/admin/ingest  # 采集控制台

# 8) 本地诊断脚本（不在 git）
npx tsx scripts/debug-stats.ts        # DB 分布快查
npx tsx scripts/debug-scan.ts         # 实跑一次扫描
npx tsx scripts/debug-ai-smoke.ts     # AI 链 smoke（验证 OpenRouter + 3 链）
```

---

## 11. Git 流程（**v2 新增 · 必读**）

### 本地 + 远程

```
本地 → main → origin/main → https://github.com/dada628/ai-Hotspot-monitoring
```

### 最近 commit 历史（HEAD 倒序）

```
6d4bf79 chore(scripts): 一次性清理历史非科技 HotSpot 脚本             ← v5 任务 3
185b06c feat(scrapers): 科技相关性源头过滤（让信息都跟科技相关）        ← v5 任务 2
eb95b11 fix(hotspots): 5 种排序真正差异化 + time 筛选生效 + relevance 需 keyword  ← v5 任务 1
a84b0f9 feat(ui): HotSpot 详情页内嵌"相关热点"区块 + 推荐 API           ← v4 任务 3
e075114 feat(ui): HotSpot 详情页 + 新增 keyPoints/entities/processedAt   ← v4 任务 2
55acad8 feat(scrapers): Google News 多类目扩展（AI/科技/财经/社会/科学 × 中英） ← v4 任务 1
5882117 feat(ai): Phase 3 任务 3 · Pipeline 串联 + /api/process + 预警匹配 + 前端按钮  ← v3
cf2960e feat(ai): Phase 3 任务 2 · 三个单条 AI 处理链（classify/score/summarize）       ← v3
106c9c8 feat(ai): Phase 3 任务 1 · AI 基建（OpenRouter 客户端 + Zod schemas）            ← v3
4d42cd6 chore: gitignore 排除本地 debug 脚本                          ← v2
15fab94 feat(scrapers): 新增 3 个数据源 + HackerNews 双源混合         ← v2
9896daa feat(score): 加入本地兜底评分系统（engagementScore）          ← v2
e1d76c1 feat(ui): 升级前端为 HotPulse 2.0 Cyber Calm（接入 Aceternity UI）  ← v2
b0f77d5 chore: 初始化 HotPulse 项目骨架（Phase 1+2 完成）             ← v1
```

### 流程（违反 = 用户打回）

1. **每完成一个完整任务/小阶段**就走流程，不要堆积
2. **报告改动**：列出文件 + 改了什么 + 为什么
3. **跑检查**：`git status` / `git diff` / `npm run type-check`
4. **AskQuestion 确认 commit**：选择题（确认 / 改 message / 取消）
5. **执行 commit**：多行 message **必须用 `.git/COMMIT_MSG_TMP` + `git commit -F`**，删除临时文件
6. **AskQuestion 确认 push**：选择题（推送 / 暂缓）
7. **执行 push**：`git push origin main`
8. **报告结果**：`git status` + 远程 commit URL

### 硬约束

- ❌ 禁 `--force` / `push --force` / `--no-verify`
- ❌ 禁 `git config` 修改
- ❌ 禁 `--amend` 已 push 的 commit
- ❌ 禁提交 `.env` / `dev.db` / `node_modules`（已 gitignore）
- ✅ pre-commit hook 修改文件 → 创建**新** commit，**不**要 amend
- ✅ commit 失败/拒绝 → 修问题再 commit，**不**要 amend

### commit message 风格（AI 自行判断）

- 小修小补 → 中文短句：`修复知乎抓取的 401 兜底`
- 功能性 → Conventional Commits：`feat: 接入 OpenRouter 客户端封装`
- 多文件 → 标题 + 空行 + 列表正文

---

## 12. 待办（下一步候选方向）

### Phase 4：用户认证 UI + Dashboard（**下一个推荐方向**）

需要做：

1. `/login` 页面真实化：Credentials + GitHub OAuth 登录 UI（当前是占位）
2. `/dashboard` 页面：
   - 用户订阅列表 CRUD
   - 自己的 Alert 列表
   - "我的偏好" 设置（默认 AI 模型选择 / 通知开关）
3. 顶部导航加用户头像/退出按钮
4. 中间件保护 `/dashboard` 路由（未登录跳 `/login`）
5. e2e-test.ts 加用户登录后访问 `/dashboard` 用例

### Phase 5：定时任务 + 预警通知 + 设置（用户已暂缓 AI 自动触发）

- Cron：node-cron 或 Vercel Cron 触发 `/api/ingest` → `/api/process`
- Alert 通知：邮件 / Webhook（Phase 3 已生成 Alert 记录，但没出口）
- 用户在 Dashboard 切换默认 AI 模型（数据库已有 `User.defaultModelId` 字段）

### Phase 2.X 信息增强候选（来自 v4 商讨，未选的）

- **B2 正文抓取 + 真实摘要**（中等工作量）：当前 AI 只看 title 推断，加 Firecrawl/cheerio 抓正文后 AI summarize 质量本质提升，token 成本涨 2-3 倍
- **B3 热度走势历史快照**（中等）：新表 `HotSpotMetricSnapshot`，每次 ingest 记录一次，详情页画 24h 曲线
- **A1 新源**（中等 × 7）：V2EX / 掘金 / 36氪 / 少数派 / ProductHunt / HuggingFace Papers / Dev.to
- **C1 行业垂直榜 tabs**（小）：首页加 "AI 热榜 / 财经热榜 / 社会热榜" tabs（已有 category 字段）
- **C2 全局热门关键词云**（小）：聚合近 24h 高频 tag 做 trending 区块

### Phase 6：集成测试 + 生产部署

- Vercel 部署 + Postgres 迁移（替换 SQLite，需测 schema 兼容性）
- 真实用户测试

### Phase 7：Agent Skills（**最后做**，用户原话）

- 把网页版功能封装为 Cursor Skill / MCP Tool

---

### Phase 3 dedupe 模块（v1 跳过的，未来候选）

如果未来要做 HotSpot 跨平台合并：

- 思路 1（轻量）：cosine similarity 基于 title embedding（OpenRouter 有 BGE-large 等）+ 阈值 0.85
- 思路 2（重）：LLM judge 两两比对（贵，慎用）
- 关键约束：合并时要保留所有 sources，且对前端排序/详情页"多源对比"不产生回归

---

## 13. MCP 配置（项目级）

`.cursor/mcp.json`：

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
- **context7** —— 库文档查询（当前会话可能未启用，缺 API key）
- **firecrawl** —— 网页抓取兜底

实际工作中：**Context7 不可用时直接用 WebSearch + WebFetch 拉 Aceternity / RSS 等文档**，效果一样。

---

## 14. 工作流模板（给下一个 AI）

用户期望的对话模板：

```
1. 用户提出需求/反馈
2. 你（AI）先用 MCP / WebSearch / WebFetch 拉最新 API 文档（避免过时代码）
3. 拆分 TODO，必要时 AskQuestion 让用户确认方向
4. 分步骤实现，每一步报告进度
5. 跑测试（npx tsx scripts/e2e-test.ts 或新增用例）
6. AskQuestion 确认 commit（用选择题，不用纯文字）
7. 用 .git/COMMIT_MSG_TMP + git commit -F 执行
8. AskQuestion 确认 push
9. git push origin main，报告 commit hash + 远程链接
10. 等用户确认再进下一阶段
```

**重要风格**：

- 中文回复
- 不写废话注释
- 不用 emoji
- 文件操作用 Read/StrReplace/Write，不用 cat/sed/awk
- PowerShell：`;` 替代 `&&`；多行中文 message 用文件传递
- **每一次"完成一阶段"都要走 commit + push 流程**，不要堆积改动

---

## 15. v2 对话做的主要事（commits `b0f77d5..4d42cd6`）

> 这一节是给下一个 AI 看 v1 → v2 的差异。

### 1. 建立 Git 流程规则（commit `b0f77d5`）

- 新建 `.cursor/rules/git-auto-push.mdc`（`alwaysApply: true`）
- 内容：commit/push 双 AskQuestion 确认 + 安全约束 + PowerShell 适配
- 初始化 git 仓库，关联到 `https://github.com/dada628/ai-Hotspot-monitoring`
- 首次提交：50 个文件 / 13900 行

### 2. UI 升级 HotPulse 2.0 Cyber Calm（commit `e1d76c1`）

- 接入 Aceternity UI（自存于 `src/components/aceternity/`）
- 4 个组件：
  - **Spotlight**：双向聚光，motion 驱动
  - **Sparkles**：纯 Canvas 粒子（避免 tsparticles 重依赖）
  - **CardSpotlight**：鼠标跟手光晕（StatCard / HotItemCard 内嵌使用）
  - **BorderBeam**：边框流光（紧急热点 + 扫描中按钮）
- 新增 Hero 区域：双向 Spotlight + Sparkles 背景 + 渐变大标题"实时捕捉 AI 热点" + LIVE 状态点 + 上次扫描计时
- 配色从蓝紫转向 cyan-blue 单调系（紫色降权）；新增 electric cyan `#00e5ff` 作扫描指示
- 全部 emoji → SVG 图标
- 新依赖：`motion` ~25KB gz

### 3. 后端数据源加固（commits `9896daa` + `15fab94` + `4d42cd6`）

#### 诊断（用户说"几乎全是 Twitter"，但数据说不是）

- 数据真相：Twitter 仅占 14%（34/245），中文社区占 70%
- 真因：**`HotSpot.score = 0`**（AI Pipeline 未上线）→ 前端按 metric 兜底 → Twitter 的 likes 数字最大 → 看起来主导

#### A · 本地兜底评分（commit `9896daa`）

- HotSpot 表加 `engagementScore Float` 字段（`prisma db push`）
- `src/lib/score.ts`：9 平台公式（log10 缩放 + 24h 时间衰减）
- ingest.ts 入库时计算，多 source 取 max
- API 排序兜底 `[score desc, engagementScore desc, updatedAt desc]`
- 前端 `effectiveScore = score > 0 ? score : engagementScore`
- 回填脚本 `scripts/backfill-engagement-score.ts`（已跑，72 条获分）

#### C · 新增 3 个数据源（commit `15fab94`）

- `reddit.ts`：r/LocalLLaMA + r/MachineLearning，30 条
- `google-news.ts`：中英双语 RSS（"AI OR LLM" / "AI OR 大模型"），28 条
- `infoq.ts`：InfoQ 中文 RSS，20 条（**机器之心官方 RSS 已废**，换 InfoQ）
- `hackernews.ts`：升级为双源混合（topstories + Algolia AI search）
- 新依赖：`rss-parser`
- 实测 9/9 平台全部成功；DB 245 → 329

#### 杂项（commit `4d42cd6`）

- `.gitignore` 加 `/scripts/debug-stats.ts` + `/scripts/debug-scan.ts`（本地诊断工具不进 git）

### 4. 用户决策记录

| 议题 | 用户选择 |
|---|---|
| 数据源扩展范围 | A + C + D（评分系统 + 新源 + schema 字段） |
| 新源选择 | 全部 4 个（HN 扩展 + Reddit + Google News + 机器之心） |
| Twitter 收紧 | **不动**（数据反驳了"低质"的感受） |
| 机器之心替代 | InfoQ |
| commit 拆分 | 3 个 commit（feat(score) + feat(scrapers) + chore） |
| debug-scan.ts 处理 | 加进 .gitignore（与 debug-stats.ts 同处理） |
| UI 配色方向 | Cyan-Blue 冷调 |
| Hero 文案 | "实时捕捉 AI 热点 / 扫描 6 平台·AI 智能分类·第一时间预警" |

---

## 16. v3 对话做的主要事 · Phase 3 AI Pipeline（commits `106c9c8..5882117`）

> 整个 Phase 3 拆为 3 个 commit，每个独立可上线。

### 任务 1：AI 基建（commit `106c9c8`）

- 升级 `zod` 到 `^3.25.76`（ai SDK v6 强约束）
- 新增 `ai@^6.0.191` + `@openrouter/ai-sdk-provider@^2.9.0`
- 新增 `src/lib/ai/openrouter.ts`：
  - `getProvider()` 懒加载 + `hasOpenRouterKey()`
  - `getModel(modelId)`，默认 `deepseek/deepseek-v3.2`
  - **启用 `response-healing` 插件**（structured output 容错）
- 新增 `src/lib/ai/schemas.ts`：
  - `ClassifySchema` / `ScoreSchema` / `SummarySchema`（用 `.describe()` 引导 LLM）
  - `CATEGORY_VALUES` 枚举 8 个 + `CATEGORY_LABELS_ZH` 中文标签
  - `AiEnrichedFields` 类型（v4 扩展为含 keyPoints/entities）

### 任务 2：三个单条 AI 处理链（commit `cf2960e`）

- `src/lib/ai/prompts/classify.ts` —— 输入 title + 可选 platforms → category + tags
- `src/lib/ai/prompts/score.ts` —— 输入 title + metrics + age + engagementHint → 0-100 score + trendVelocity
- `src/lib/ai/prompts/summarize.ts` —— 输入 title + 多源 rawTitles → summary + keyPoints + entities
- 共同特征：所有 prompt 都强调"不捏造、不夸张、客观简洁"
- 新增本地 smoke test `scripts/debug-ai-smoke.ts`（已 .gitignore，不进 git）

### 任务 3：Pipeline 串联 + API + 预警 + 前端按钮（commit `5882117`）

- `src/lib/ai/pipeline.ts`：
  - `processBatch({ limit, scope, window, modelId })` 编排器
  - **串行调用** classify → summarize → score（控速控成本）
  - 单条失败隔离，不影响 batch 其他条目
  - 写回 HotSpot：category/tags/summary/score/trendVelocity（v3 时还没 keyPoints/entities/processedAt，v4 补上）
- `src/lib/ai/alert-match.ts`：
  - `runAlertMatch(hotSpotIds)` 在 AI 处理完后被 Pipeline 调用
  - 匹配规则：keywords + platforms + categories + minScore
  - 创建或更新 `Alert` 记录
- `src/app/api/process/route.ts`：
  - POST `/api/process`，Bearer `CRON_SECRET` 鉴权
  - 参数：`?limit=5&scope=unprocessed&window=24h&model=...`
  - 返回 `{ ai: ProcessReport, alerts: AlertMatchReport }`
- 前端：`src/app/page.tsx` 顶部加"AI 处理"按钮（SparklesIcon + BorderBeam 动效）
- e2e-test.ts 增至 45 项

### v3 用户决策记录

| 议题 | 用户选择 |
|---|---|
| Phase 3 拆分 | 3 个 commit（基建 / 单链 / 集成） |
| dedupe 模块 | **暂缓**（v1 跳过，未来评估） |
| AI 触发方式 | **手动触发**（UI 按钮 / API），v1 不自动 |
| 默认模型 | `deepseek/deepseek-v3.2`（不要海外模型） |
| Push 节奏 | 全部 3 个 commit 完成后一起 push |

---

## 17. v4 对话做的主要事 · 信息丰富度广度提升（commits `55acad8..a84b0f9`）

> 主题："增加信息的丰富度广度"。拆为 3 个独立 commit。

### 任务 1（A2 广度）：Google News 多类目扩展（commit `55acad8`）

- `src/lib/scrapers/google-news.ts`：查询从 2 路（AI×中英）扩为 **7 路**：
  - `ai-en` / `ai-zh` / `tech-en` / `tech-zh` / `finance-zh` / `society-zh` / `science-en`
- 每路 metric 新增 `categoryHint` + `queryLabel` 元数据
- 注意 **D-021**：categoryHint 不强制覆盖 AI 分类，AI 仍自行判断
- 上限调整：PER_QUERY 18 → 10、TOTAL 28 → 45（避免单源压制中文社区）
- **实测效果**：1.9s 拉 30 条；累积量 19 → 74，翻 3.9 倍

### 任务 2（B1 深度）：HotSpot 详情页 + 3 个新字段（commit `e075114`）

- **Schema 变更**（`prisma db push` 已同步）：
  - HotSpot 加 `keyPoints` (String JSON) + `entities` (String JSON) + `processedAt` (DateTime?)
  - 老数据非破坏：默认 `"[]"` / null
- 后端：
  - `src/app/api/hotspots/[id]/route.ts` —— GET 单条 14 字段 + sources
  - `src/lib/ai/pipeline.ts` 补写回新字段
  - `src/lib/ai/schemas.ts` 的 `AiEnrichedFields` 扩展
- 前端：
  - `src/app/hotspot/[id]/page.tsx` 单列长页详情：
    - Hero（severity + category + AI 增强 + 跨源徽章）
    - 4 个评分卡（综合/爆发/兜底/跨源）
    - AI 摘要 + 关键要点 + 关键实体 + 多源对比 + 元数据
  - `src/components/HotItemCard.tsx` 改造：
    - 加 `id` prop
    - 标题部分改为 `<Link href={`/hotspot/${id}` as Route}>` 跳详情页
    - 底部加"原文 ↗" `<a target=_blank>`（`e.stopPropagation()` 防冒泡）
    - 整张卡从 `<a>` 改为 `<div>`（不能 `<a>` 嵌 `<a>`）
- e2e-test.ts 增至 49 项

### 任务 3（C3 关联广度）：详情页内嵌"相关热点" + API（commit `a84b0f9`）

- 新增 `src/app/api/hotspots/[id]/related/route.ts`：
  - 评分公式：`tagOverlap×0.5 + categoryMatch×0.3 + recency×0.15 + scoreBonus×0.05`
  - 候选集：近 7 天 active HotSpot 取 200 条，**内存评分排序**（见 D-022）
  - relScore < 0.05 视为不相关
- 详情页新增"相关热点"区块（多源对比下方）：
  - 2 列网格 + 迷你卡（类目/同类/共享 tag 数/相关度% 徽章）
  - 加载骨架屏 + 空状态 + 失败不阻塞主内容
- **实测排序**（AI 数据丰富后）：`0.617 > 0.575 > 0.5 > 0.45`，符合预期（共享 tag + catMatch > 仅 catMatch）
- e2e-test.ts 增至 **55 项 PASS**

### v4 用户决策记录

| 议题 | 用户选择 |
|---|---|
| 方向选择 | A2 + B1 + C3（多类目 + 详情页 + 相关推荐） |
| 拆分粒度 | 小步快跑，每个选项 1 commit |
| Schema 变更 | 加 keyPoints + entities（让 AI 产出被完整看见） |
| 详情页布局 | 单列长页（阅读体验优先） |
| Push 节奏 | 每个 commit 完成立即 push |

---

## 18. v5 对话做的主要事 · 信息流交互修复 + 科技相关性源头过滤（commits `eb95b11..6d4bf79`）

> 用户两个明确反馈：
> 1. "图片上一些排序功能没有真正的实现，点了还是毫无反应" → 信息流交互修复
> 2. "当前有些信息是跟科技无关的，我想信息都是跟科技相关的" → 科技源头过滤

### 任务 1：5 种排序真正差异化（commit `eb95b11`）

#### 诊断

- `src/app/api/hotspots/route.ts` 的 ORDER BY 把 `hotness/importance/relevance` 三个排序合并成同一条 SQL → 点击切换列表完全不变
- `src/app/page.tsx` 的 `loadAll` 漏写 `time` / `cred` 两个 state 到 URLSearchParams → 后端也根本没接这俩参数

#### 后端重写

- 排序分发：
  - `newest_seen` / `newest_updated`：直接 Prisma orderBy 单字段
  - `importance`：`[score desc, engagementScore desc, updatedAt desc]`（用户选 fallback 语义）
  - `hotness`：候选池（limit×4，上限 200）→ 内存复合分 `effectiveScore×0.7 + log10(sourceCount+1)×20×0.15 + (trendVelocity ?? 0)×5×0.15`
  - `relevance`：候选池 → 内存命中加权（title +3 / tag +2 / summary +1）；无 q 时降级 hotness
- 新增 time 筛选：`firstSeenAt >= now - window`，支持 1h/6h/24h/7d
- 接收 cred 参数（占位，等 D-026 体系再启用）

#### 前端

- `loadAll` 把 time/cred 写入 URLSearchParams
- 相关性 pill 在 `keyword` 为空时 disabled + 灰显 + tooltip 提示
- `sort=relevance && !keyword` 自动回退 hotness

#### 验证

- type-check ✓
- e2e 55/55 PASS（未影响现有用例）
- 手测 8 个 API 组合：5 种 sort 的 top3 ID 各异；time=1h vs 24h 返回不同子集；relevance 无 keyword 正确降级

---

### 任务 2：科技相关性源头过滤（commit `185b06c`）

#### 诊断（数据采样 8 条/平台）

| 平台 | 实测科技率 | 处理 |
|---|---|---|
| github / infoq / reddit / twitter | 90-100% | 不动 |
| hackernews | ~90% | topstories 加软过滤；Algolia AI 不动 |
| googlenews | ~50% | 收紧到 ai/tech/science 5 路 |
| weibo / zhihu | ~12% | 标题关键词白名单 |
| bilibili | ~0% | tname 分区白名单 |

#### 新增 `src/lib/tech-filter.ts`

- 242 个中英双语关键词（73 中文 + 41 英长 + 128 英短）
- `isTechRelated(text)`：中文 includes、英文长词 lowercase includes、英文短词 `\b...\b` 边界
- `isBilibiliTechPartition(tname)`：用户选定 = 科技 + 知识

#### 5 个 scraper 改造

- `google-news`：删 finance-zh + society-zh 两路 → 保留 ai-en/zh、tech-en/zh、science-en；TOTAL_LIMIT 45→32
- `bilibili`：filter list by `isBilibiliTechPartition(tname)`
- `weibo`：两路抓取出口 `filter((it) => isTechRelated(it.title))`
- `zhihu`：三路出口 `filter((it) => isTechRelated(it.title) || isTechRelated(excerpt))`
- `hackernews`：topstories return 前加 isTechRelated 软过滤；Algolia AI 不动

#### e2e 增 6 项 TechFilter 用例

- 关键词总量在 80-400 区间
- 中文/英文正样本全命中
- 非科技负样本全部拒绝
- 短词边界："said" / "paid" 不误命中 "AI"
- B 站分区白名单 = 科技/知识

总用例 55→61 全部 PASS。

#### 实测过滤效果

- weibo 50 → 4（92% 过滤）
- zhihu 50 → 2（96% 过滤）
- bilibili 50 → 0（本次抓回的 50 条无一在科技/知识分区）
- googlenews 50 → 30 唯一

---

### 任务 3：一次性清理历史非科技数据（commit `6d4bf79`）

#### 新增 `scripts/cleanup-non-tech.ts`

- 默认 dry-run，必须 `--apply` 才删除（学 backfill 风格）
- 信任平台白名单：github / infoq / reddit / **hackernews / twitter**
- 判定规则：标题 / summary / source.rawTitle 都不命中 `isTechRelated` 且 sources 中没有任何信任平台 → 删除
- 分批 100 条 deleteMany；HotSpotSource / Alert 走 onDelete:Cascade 自动连带
- 删后打印剩余 HotSpot 平台分布

#### 关键调整：把 HN/Twitter 加入信任白名单

第一版只信任 github/infoq/reddit，结果 dry-run 显示：
- HackerNews 36 条待删（实际 ~50% 是真科技：C compiler / Twilio / Gnutella / bytecode / HIPAA / programming language……）
- Twitter 11 条待删（~70% 真科技：Stanford lecture / Erdős 数学 / Codex / Grok / SynthID……）

根因：英文工程术语词表覆盖不足。临时改为信任这两个源（HN/Twitter 整体科技率 90-95%，少量混入数据可忍），避免大规模误杀。

#### 实跑结果

- 710 → 337（删 373 条，52.5%）
- 0% 误杀（清理范围严格限定 weibo/zhihu/bilibili/googlenews 4 个真噪音源）
- 10 条样本 100% 是娱乐/社会/体育/政经

### v5 用户决策记录

| 议题 | 用户选择 |
|---|---|
| 排序范围 | 严格只做方案 A（5 种排序差异化 + time/cred 透传），暂不做平台可靠性分层 |
| importance 未 AI 处理回退 | AI score 优先 → engagementScore 接着排（fallback） |
| relevance 无关键词 | 禁用该 pill 并提示 |
| 总体科技过滤思路 | 思路 3 混合（源头过滤） |
| weibo/zhihu 过滤强度 | tech_broad（80-120 词专业词） |
| B 站分区白名单 | 科技 + 知识 |
| HN topstories | 关键词软过滤 |
| 前端 toggle | 不加 |
| 历史数据 | 一次性脚本清理 |
| HN/Twitter 清理 | 加入信任白名单（避免误杀） |
| Commit 拆分 | v5 任务 1 单独；任务 2+3 拆 2 个 |

---

## 19. 入口参考

- 详细需求 → `docs/REQUIREMENTS.md`
- 详细技术方案 + ADR → `docs/DESIGN.md`
- 用户验收过的测试套件 → `scripts/e2e-test.ts`（**61/61 PASS**）
- 本地诊断 → `scripts/debug-stats.ts` / `scripts/debug-scan.ts` / `scripts/debug-ai-smoke.ts`（不在 git）
- 一次性清理 → `scripts/cleanup-non-tech.ts`（v5 新增，进 git，可重跑）
- Git 规则 → `.cursor/rules/git-auto-push.mdc`
- AI Pipeline 核心 → `src/lib/ai/`
- 科技相关性过滤 → `src/lib/tech-filter.ts`
- 数据源加固历史 → §15（v2）+ §16（v3）+ §17（v4）+ §18（v5）

**祝下一个 AI 玩得愉快 · HEAD = `6d4bf79`**
