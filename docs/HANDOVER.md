# HotPulse · AI 项目交接文档

> **此文档面向"下一个 AI"** —— 新开对话时让 AI 快速恢复完整项目上下文，避免重新理解或踩历史决策的坑。
> 最后更新：2026-05-26（v2，含 UI 升级 + 数据源加固 + Git 流程规则）

---

## 0. 快速事实卡

| 字段 | 值 |
|---|---|
| **项目名** | HotPulse · AI 热点监控（曾名 NEXUS / AI Hotspot Monitoring，**当前品牌：HotPulse**） |
| **目标** | 抓取多源 9 平台热点 → AI 分类去重评分摘要 → 个性化预警 |
| **代码路径** | `d:\project001\ai-Hotspot monitoring` |
| **包名** | `ai-hotspot-monitoring`（`package.json`） |
| **运行平台** | Windows（PowerShell），本地开发 |
| **GitHub 仓库** | <https://github.com/dada628/ai-Hotspot-monitoring>（main 分支已托管） |
| **当前阶段** | Phase 1 + 2 + 2.5 + 2.6 + 2.7 + 2.8 + 2.9 完成；Phase 3（AI Pipeline）待开工 |
| **测试** | `npx tsx scripts/e2e-test.ts` —— 31 项 PASS（**未含新源用例**，下次开发要补） |
| **dev URL** | <http://localhost:3000> |

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
| AI SDK | `@openrouter/ai-sdk-provider` | 2.9.x | Phase 3 才会引入 |
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
│   ├── e2e-test.ts                   # 31 项测试（未含新源）
│   ├── backfill-engagement-score.ts  # 一次性回填工具（公式调整后可重跑）
│   ├── debug-stats.ts                # ★ 本地诊断脚本（已在 .gitignore，不进 git）
│   └── debug-scan.ts                 # ★ 本地扫描验证（已在 .gitignore）
├── prisma/
│   ├── schema.prisma                 # 数据模型（HotSpot 新增 engagementScore）
│   ├── seed.ts
│   ├── migrate-default-model.ts
│   └── dev.db                        # SQLite，运行时生成
├── src/
│   ├── app/
│   │   ├── page.tsx                  # 主页（Hero 区 + Spotlight + Sparkles + 信息流）
│   │   ├── admin/ingest/page.tsx     # 数据采集控制台
│   │   ├── dashboard/page.tsx        # Phase 4 占位
│   │   ├── login/page.tsx            # Phase 4 占位
│   │   ├── globals.css               # HotPulse 2.0 设计系统（cyan-blue + card-spotlight + border-beam）
│   │   ├── layout.tsx
│   │   └── api/
│   │       ├── auth/[...nextauth]/route.ts
│   │       ├── ingest/route.ts       # POST 触发抓取（Bearer ${CRON_SECRET}）
│   │       ├── hotspots/route.ts     # GET 信息流（排序 [score, engagementScore, updatedAt]）
│   │       └── admin/stats/route.ts
│   ├── components/
│   │   ├── Brand.tsx
│   │   ├── StatCard.tsx              # 内嵌 card-spotlight 鼠标跟手光晕
│   │   ├── Tabs.tsx
│   │   ├── PillSelect.tsx
│   │   ├── HotItemCard.tsx           # 鼠标跟手光晕 + critical 级 BorderBeam
│   │   ├── Badge.tsx
│   │   └── aceternity/               # ★ Aceternity UI（自存，单文件复制式）
│   │       ├── Spotlight.tsx         # 双向聚光（motion）
│   │       ├── Sparkles.tsx          # 纯 Canvas 粒子，无 tsparticles 依赖
│   │       ├── CardSpotlight.tsx     # 鼠标跟手通用组件
│   │       └── BorderBeam.tsx        # 边框流光（紧急/扫描中）
│   └── lib/
│       ├── auth.ts
│       ├── db.ts
│       ├── platforms.ts              # 9 平台元数据
│       ├── ingest.ts                 # 抓取→入库；新增 engagementScore 计算
│       ├── score.ts                  # ★ 本地兜底评分（9 平台公式 + 24h 衰减）
│       ├── scrapers/
│       │   ├── index.ts              # 注册中心（9 个 scraper）
│       │   ├── types.ts              # Platform 类型（9 个）
│       │   ├── http.ts
│       │   ├── weibo.ts
│       │   ├── zhihu.ts
│       │   ├── bilibili.ts
│       │   ├── github.ts
│       │   ├── twitter.ts            # TwitterAPI.io，不动
│       │   ├── hackernews.ts         # ★ 双源混合：topstories + Algolia AI search
│       │   ├── reddit.ts             # ★ r/LocalLLaMA + r/MachineLearning
│       │   ├── google-news.ts        # ★ 中英双语 RSS
│       │   └── infoq.ts              # ★ InfoQ 中文 RSS（替代废弃的机器之心）
│       └── ai/
│           └── models.ts             # 7 个国产模型 + DEFAULT_MODEL_ID
├── types/
│   └── next-auth.d.ts
├── .gitignore                        # 含 debug-stats.ts / debug-scan.ts 排除
├── .env                              # OPENROUTER_API_KEY + TWITTERAPI_IO_KEY
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
| 2.7 · E2E 测试 | ✅ | `scripts/e2e-test.ts` 31/31 PASS |
| **2.8 · UI 升级 HotPulse 2.0 Cyber Calm** | ✅ | Aceternity UI（Spotlight/Sparkles/CardSpotlight/BorderBeam）+ Hero + 配色转 cyan-blue + emoji → SVG |
| **2.9 · 数据源加固** | ✅ | 本地兜底评分系统 + 新增 3 源（Reddit/Google News/InfoQ）+ HN 双源混合 |
| 3 · AI Pipeline | ⏳ **下一步** | 分类/去重/评分/摘要/预警 5 链 |
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
   ┌──────┬──────┬─────────┬────────┬────────┬────────┬───────┬───────────┬───────┐
   │weibo │zhihu │bilibili │ github │twitter │ hn 2x  │reddit │googlenews │ infoq │ 9 scrapers
   └───┬──┴──┬───┴────┬────┴───┬────┴───┬────┴───┬────┴──┬────┴────┬──────┴───┬───┘
       └─────┴────────┴────────┴────────┴────────┴───────┴─────────┴──────────┘
                          ▼
                  RawHotItem[] 数组
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
              ┌───────────┴──────────┐
              │ Phase 3：AI 处理      │  ← 此处空白，待开发
              │  · 分类               │
              │  · 去重合并相似热点    │
              │  · 评分（0-100）→ score（覆盖 engagementScore）
              │  · 摘要生成           │
              │  · 触发预警           │
              └──────────────────────┘
                          ▼
              GET /api/hotspots
              排序：[score desc, engagementScore desc, updatedAt desc]
                          ▼
              前端 effectiveScore = score > 0 ? score : engagementScore
                          ▼
              HotItemCard 渲染（critical = BorderBeam + 红色 spotlight）
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

### 本次（v2）新踩坑
10. **PowerShell HEREDOC 中文引号嵌套**：`git commit -m "$(@'...'@)"` 中如果 message 含 `"...AI 热点"` 这种内层双引号，PowerShell 会误把内层引号当参数边界。**解决**：写到 `.git/COMMIT_MSG_TMP` 文件，`git commit -F`。
11. **`git push` 输出在 PowerShell 被标红**：git 把进度信息打到 stderr，PowerShell 当作错误。**实际 exit code 0 就是成功**，看输出的 `main -> main` 才是真信号。
12. **`prisma migrate dev` 触发 reset database**：因为项目无 migration 历史。**解决**：用 `db push`，不要用 migrate dev。
13. **机器之心官方 `/rss` 已废**：现在返回 HTML 商业页面（"数据服务"页），不是 RSS XML。**解决**：用 InfoQ `https://www.infoq.cn/feed.xml` 替代。
14. **`Record<Platform, Scraper>` 类型严格**：扩展 Platform 类型时，必须同时在 SCRAPERS 注册新 scraper，否则 TS 报错。**策略**：commit 拆分时类型 + scraper 实现要在同一个 commit。

---

## 8. 数据库现状（2026-05-26 02:30 快照）

```
HotSpotSource 分布（329 条 HotSpot）：
  bilibili      68
  weibo         67
  twitter       43
  zhihu         40
  reddit        31   ← v2 新源
  hackernews    24   ← 双源混合后多了
  infoq         20   ← v2 新源（替代机器之心）
  googlenews    19   ← v2 新源
  github        17

HotSpot.score:           0 条（AI Pipeline 未上线）
HotSpot.engagementScore: 151 条（每次新数据带分；旧记录 metric 字段不全的算不出）
HotSpot.summary:         0 条

User             = 1 条（admin@nexus.local / admin12345）
Subscription     = 0 条
Alert            = 0 条
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

# 3) E2E 测试（注意：未含新源用例，下次开发要补）
npx tsx scripts/e2e-test.ts

# 4) 数据库分布快查（本地脚本，不在 git）
npx tsx scripts/debug-stats.ts

# 5) 实跑一次扫描（本地脚本，不在 git）
npx tsx scripts/debug-scan.ts
```

---

## 11. Git 流程（**v2 新增 · 必读**）

### 本地 + 远程

```
本地 → main → origin/main → https://github.com/dada628/ai-Hotspot-monitoring
```

### 最近 commit 历史

```
4d42cd6 chore: gitignore 排除本地 debug 脚本
15fab94 feat(scrapers): 新增 3 个数据源 + HackerNews 双源混合
9896daa feat(score): 加入本地兜底评分系统（engagementScore）
e1d76c1 feat(ui): 升级前端为 HotPulse 2.0 Cyber Calm（接入 Aceternity UI）
b0f77d5 chore: 初始化 HotPulse 项目骨架（Phase 1+2 完成）
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

## 12. 待办（Phase 3 起点）

### Phase 3：AI Pipeline（用户已确认进入）

需要创建：

1. `src/lib/ai/openrouter.ts` —— OpenRouter 客户端封装
2. `src/lib/ai/prompts/`
   - `classify.ts` —— tech / society / entertainment / finance / sports / culture / science / other
   - `dedupe.ts` —— 跨平台相似热点合并
   - `score.ts` —— 0-100 评分（会覆盖 engagementScore）
   - `summarize.ts` —— 摘要 + tags
   - `alert-match.ts` —— 匹配用户订阅触发预警
3. `src/lib/ai/pipeline.ts` —— 串联 5 链
4. `src/app/api/process/route.ts` —— POST 触发 AI 处理
5. 可选：抓取后自动 AI 处理（钩到 `ingest.ts` 末尾）

完成后：
- 前端 `HotItemCard` 上的 badge 用上真实 AI 输出（`score` 覆盖 `engagementScore`）
- `scripts/e2e-test.ts` 补 AI 相关用例
- 报告等用户验收，然后进 Phase 4

### Phase 2.X 候选优化（可选，看用户优先级）

- UI 增加"按源分布"圆环图
- HotItemCard 加 source short-pill（`[R]` `[GN]` `[IQ]`）
- 知乎当前 API/billboard 都 403，只有第三方聚合源能跑（HANDOVER §7.6）→ 可考虑更稳定的兜底
- e2e-test.ts 补 3 个新源 + engagementScore 计算测试

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

## 15. 本次（v2）对话做的主要事

> 这一节是给下一个 AI 看本次"v1 → v2"的差异。如果你接手时看到 commit `b0f77d5..4d42cd6`，下面是这段历程的浓缩。

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

## 16. 入口参考

- 详细需求 → `docs/REQUIREMENTS.md`
- 详细技术方案 + ADR → `docs/DESIGN.md`
- 用户验收过的测试套件 → `scripts/e2e-test.ts`（**注意 v2 后未更新**）
- 本地诊断 → `scripts/debug-stats.ts` / `scripts/debug-scan.ts`（不在 git，但你可以执行）
- Git 规则 → `.cursor/rules/git-auto-push.mdc`

**祝下一个 AI 玩得愉快**
