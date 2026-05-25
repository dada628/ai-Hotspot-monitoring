# AI 热点监控系统 · 技术方案

> 文档版本：v1.0
> 日期：2026-05-25
> 配套文档：[REQUIREMENTS.md](./REQUIREMENTS.md)
> 状态：📋 待用户确认后开始开发
>
> **本文档所有 API 与依赖版本均经过 2026-05 最新版本核对**

---

## 1. 技术栈（含 2026-05 最新版本号）

| 层 | 技术 | 版本 | 选型理由 |
|---|---|---|---|
| 框架 | **Next.js** | `16.2.6`（最新稳定）| App Router、RSC 默认、`params` 异步、Node.js runtime proxy |
| UI 库 | **React** | `19.1.7` | 配套 Next 16 |
| 类型 | **TypeScript** | `5.x` | 工程标配 |
| 样式 | **Tailwind CSS** | `4.x` | CSS Variables 灵活，原生支持深色主题 |
| 动效 | **Framer Motion** | `^12` | 卡片动效、信号瀑布 |
| 3D 背景 | **Three.js** + `@react-three/fiber` | `^0.170` | 数据流粒子背景 |
| 字体 | **Orbitron** + **JetBrains Mono** | Google Fonts | 赛博/数据感 |
| 数据库 | **SQLite** + **Prisma** | Prisma `7.8.0`（最新）| 本地零配置，可平滑切 PG |
| 认证 | **Auth.js v5** (`next-auth@beta`) + `@auth/prisma-adapter` | beta | App Router 一等公民 |
| 密码 | **bcryptjs** | `^2` | 哈希存储 |
| AI 调用 | **`@openrouter/ai-sdk-provider`** + **`ai`** (Vercel AI SDK) | `2.9.0`（最新） | 一个 Key 接 300+ 模型 |
| 校验 | **Zod** | `^3` | AI 结构化输出 Schema |
| HTTP | 原生 `fetch` + `undici` | Node 20+ | 简单可靠 |
| HTML 解析 | **cheerio** | `^1.0` | GitHub Trending 用 |
| 浏览器兜底 | **Firecrawl MCP** | `latest` | 反爬严格站兜底 |
| 调度 | **node-cron** | `^3` | 本地定时；生产换 Vercel Cron |
| 状态管理 | **Zustand** | `^5` | 轻量 |
| 数据请求 | **TanStack Query** | `^5` | 列表缓存、自动重试 |
| 表单 | **React Hook Form** + **Zod** | 最新 | 类型安全表单 |
| 测试 | **Vitest** + **Playwright** | 最新 | 单测 + E2E |
| 代码质量 | **ESLint** + **Prettier** + **TypeScript-strict** | 最新 | 标配 |

### ❌ 不用什么 & 理由

- ❌ **ShadCN UI** — 风格大众化，无法做到"独特" → 自研赛博朋克组件库
- ❌ **Redux / Pinia** — 过重 → Zustand
- ❌ **Express 独立后端** — 增加部署复杂度 → Next.js API Routes
- ❌ **Drizzle ORM** — 生态稍弱，Prisma 7 + 驱动适配器已解决冷启问题
- ❌ **Pages Router** — Next.js 16 已稳定推荐 App Router

---

## 2. 信息源策略（多源、去单点）

### 2.1 数据源清单（含 2026-05 验证可用的接口）

| # | 平台 | 接入方式 | 端点 / 路径 | 备注 |
|---|---|---|---|---|
| 1 | **微博** | 主：聚合 API<br>备：移动端反代 | 主：`GET https://60s.viki.moe/v2/weibo`<br>备：`GET https://m.weibo.cn/api/container/getIndex?containerid=231648_-_4` | 无需鉴权，返回 JSON |
| 2 | **知乎** | 官方 v3 接口 | `GET https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=50&desktop=true` | 需 User-Agent，返回 JSON |
| 3 | **B 站热门视频** | 官方接口 | `GET https://api.bilibili.com/x/web-interface/popular?ps=50&pn=1` | 不带 Cookie 也能用 |
| 4 | **B 站热搜词** | 官方接口（备选） | `GET https://s.search.bilibili.com/main/hotword`<br>or `GET https://api.bilibili.com/x/web-interface/wbi/search/square?limit=50` (后者需 WBI 签名) | 简化版优先 |
| 5 | **GitHub Trending** | 爬取 HTML | `GET https://github.com/trending?since=daily` | 用 cheerio 解析 |
| 6 | **兜底** | Firecrawl MCP | 任何源失败 → 调 firecrawl scrape | 已配置 |
| 7 | ~~X / Twitter~~ | twitterapi.io | （第一阶段不接入，留接口） | 后续启用 |

### 2.2 抓取层架构

```
┌─────────────────────────────────────────────┐
│ POST /api/cron/ingest (Bearer CRON_SECRET) │
└────────────────┬────────────────────────────┘
                 │
       ┌─────────┼─────────┬─────────┬─────────┐
       ▼         ▼         ▼         ▼         ▼
   WeiboSrc   ZhihuSrc  BiliSrc  GithubSrc  [X-Src]
       │         │         │         │         │
       └─────────┴─────────┴─────────┴─────────┘
                 │ (Promise.allSettled, 互不影响)
                 ▼
      ┌─────────────────────────┐
      │  归一化 → RawHotItem[]  │
      └────────────┬────────────┘
                   ▼
           [AI Pipeline]
```

### 2.3 反爬与限流

- 每个源独立 User-Agent 池（伪装现代浏览器）
- 单源失败 3 次 → 暂停该源 30 分钟
- 单源连续失败 → 自动切换 Firecrawl MCP 兜底
- 所有请求加 `AbortController` 30s 超时

---

## 3. AI Pipeline（OpenRouter + Vercel AI SDK）

### 3.1 SDK 接入方式（2026-05 最新版本）

```ts
// src/lib/ai/openrouter.ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
  // 引用：https://www.npmjs.com/package/@openrouter/ai-sdk-provider v2.9.0
});

// 获取动态模型（用户在设置页可选）
export function getModel(modelId: string) {
  return openrouter(modelId, {
    plugins: [{ id: 'response-healing' }],  // 自动修复 JSON 错误
  });
}
```

### 3.2 五步 Pipeline 详细设计

```ts
// src/lib/ai/pipeline.ts
import { generateObject } from 'ai';
import { z } from 'zod';

// === 1) 分类 ===
const ClassifySchema = z.object({
  category: z.enum(['tech', 'society', 'entertainment', 'finance', 'sports', 'culture', 'science', 'other']),
  tags: z.array(z.string()).max(5),
  confidence: z.number().min(0).max(1),
});

// === 2) 去重（语义聚类） ===
const DedupeSchema = z.object({
  groups: z.array(z.object({
    canonicalTitle: z.string(),
    memberIndices: z.array(z.number()),  // 引用原始数组的 index
  })),
});

// === 3) 评分 ===
const ScoreSchema = z.object({
  score: z.number().min(0).max(100),
  reasoning: z.string(),
  trendVelocity: z.number(),  // 爆发速度
});

// === 4) 总结 ===
const SummarySchema = z.object({
  summary: z.string().max(200),
  keyPoints: z.array(z.string()).max(5),
  entities: z.array(z.string()).max(10),  // 人物/机构/产品名
});

// 实际调用
export async function classify(model, title: string, source: string) {
  const { object } = await generateObject({
    model,
    schema: ClassifySchema,
    prompt: `分析以下热点话题并分类...\n标题：${title}\n来源：${source}`,
  });
  return object;
}
// ... 其余 step 同模式
```

### 3.3 推荐模型矩阵（2026-05 OpenRouter · 国产模型优先）

> **重要约束**：海外模型（GPT-4o / Claude / Gemini 等）对中国大陆区域有访问限制。
> 系统**默认仅推荐国产模型族**（DeepSeek / Qwen / GLM / Kimi），全部通过 OpenRouter 统一调用。
> 详见 `src/lib/ai/models.ts` 模型目录。

| 用途 | 推荐模型 | $/M-out | 中文 | 备注 |
|---|---|---|---|---|
| **默认**（系统主力） | `deepseek/deepseek-v3.2` | $1.1 | S | ⭐ 性价比之王，强中文 + 工具调用 |
| 稳定备选 | `deepseek/deepseek-v3.1-terminus` | $1.0 | A+ | 上一代稳定旗舰 |
| 高性价比通用 | `qwen/qwen3-32b` | $0.28 | A+ | 阿里通义千问，多模态 |
| 中文写作摘要 | `qwen/qwen-plus` | $1.6 | A+ | 强中文表达 |
| 中文重型场景 | `z-ai/glm-4.5` | $1.92 | S | 智谱 GLM · 实测中文胜过 GPT-4o |
| 批量分类去重 | `z-ai/glm-4.5-air` | $0.20 | A | 轻量低成本 |
| 超长上下文 | `moonshotai/kimi-k2` | $3.0 | S | Moonshot · 200K+ 上下文 |

> 来源：[LLM Benchmark Rankings 2026](https://dev.to/ianlpaterson/llm-benchmark-rankings-2026-15-models-tested-on-38-real-coding-tasks-40kn)

---

## 4. Auth.js v5 接入（2026-05 最新）

### 4.1 安装

```bash
npm install next-auth@beta @auth/prisma-adapter prisma @prisma/client bcryptjs
npm install -D @types/bcryptjs
```

### 4.2 关键配置（`src/lib/auth.ts`）

```ts
import NextAuth from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import bcryptjs from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: 'jwt' }, // ⚠️ Credentials 必须用 JWT
  pages: { signIn: '/login' },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID!,
      clientSecret: process.env.AUTH_GITHUB_SECRET!,
    }),
    Credentials({
      async authorize(credentials) {
        const parsed = LoginSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email } });
        if (!user?.passwordHash) return null;
        const ok = await bcryptjs.compare(parsed.data.password, user.passwordHash);
        return ok ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  ],
  callbacks: {
    async session({ token, session }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
```

> **关键陷阱**：使用 Credentials provider 时，**必须** 设置 `session: { strategy: 'jwt' }`，否则会报错（来源：[Auth.js v5 Credentials Setup Guide 2026](https://nextjslaunchpad.com/article/build-complete-auth-system-authjs-v5-registration-login-password-reset-nextjs)）。

---

## 5. 数据库设计（Prisma 7）

### 5.1 配置方式（Prisma 7 推荐写法）

`prisma.config.ts`（Prisma 7 新方式，URL 不再放 schema 里）：

```ts
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});
```

### 5.2 Schema（`prisma/schema.prisma`）

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  // url 配在 prisma.config.ts
}

// === Auth.js 标准表 ===
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id             String    @id @default(cuid())
  email          String    @unique
  emailVerified  DateTime?
  passwordHash   String?
  name           String?
  image          String?
  preferredModel String    @default("deepseek/deepseek-v3.2")
  createdAt      DateTime  @default(now())
  accounts       Account[]
  sessions       Session[]
  subscriptions  Subscription[]
  alerts         Alert[]
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime
  @@unique([identifier, token])
}

// === 业务表 ===
model HotSpot {
  id             String   @id @default(cuid())
  title          String
  summary        String?
  category       String?  // tech | society | entertainment | ...
  tags           String   @default("[]")  // JSON array
  score          Float    @default(0)
  trendVelocity  Float?
  status         String   @default("active")
  firstSeenAt    DateTime @default(now())
  updatedAt      DateTime @updatedAt
  sources        HotSpotSource[]
  alerts         Alert[]
  @@index([score])
  @@index([category])
  @@index([firstSeenAt])
}

model HotSpotSource {
  id        String   @id @default(cuid())
  hotSpotId String
  platform  String   // weibo | zhihu | bilibili | github
  url       String
  rawTitle  String
  metric    String   @default("{}")  // JSON
  fetchedAt DateTime @default(now())
  hotSpot   HotSpot  @relation(fields: [hotSpotId], references: [id], onDelete: Cascade)
  @@index([platform])
}

model Subscription {
  id         String  @id @default(cuid())
  userId     String
  keyword    String?
  platforms  String  @default("[]")  // JSON array
  categories String  @default("[]")  // JSON array
  minScore   Float   @default(70)
  enabled    Boolean @default(true)
  createdAt  DateTime @default(now())
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Alert {
  id        String   @id @default(cuid())
  userId    String
  hotSpotId String
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  hotSpot   HotSpot  @relation(fields: [hotSpotId], references: [id], onDelete: Cascade)
}
```

---

## 6. 项目目录结构

```
ai-hotspot-monitoring/
├── docs/
│   ├── REQUIREMENTS.md
│   └── DESIGN.md
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
├── prisma.config.ts                 ← Prisma 7 新方式
├── public/
│   └── fonts/                       ← 自托管字体
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   ├── (app)/
│   │   │   ├── dashboard/page.tsx   ← 热点流主页
│   │   │   ├── hotspot/[id]/page.tsx
│   │   │   ├── subscriptions/page.tsx
│   │   │   ├── alerts/page.tsx
│   │   │   └── settings/
│   │   │       ├── ai/page.tsx      ← 模型切换
│   │   │       └── profile/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── hotspots/route.ts
│   │   │   ├── hotspots/[id]/route.ts
│   │   │   ├── cron/ingest/route.ts
│   │   │   ├── subscriptions/route.ts
│   │   │   ├── alerts/route.ts
│   │   │   └── ai/models/route.ts
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                 ← 落地页
│   ├── components/
│   │   ├── cyber/                   ← 自研赛博朋克组件
│   │   │   ├── ScanlineBorder.tsx
│   │   │   ├── GlitchText.tsx
│   │   │   ├── NeonBadge.tsx
│   │   │   ├── DataStreamBg.tsx
│   │   │   ├── SignalWaterfall.tsx
│   │   │   ├── DigitRoll.tsx
│   │   │   └── AICoreIndicator.tsx
│   │   ├── hotspot/
│   │   │   ├── HotSpotCard.tsx
│   │   │   ├── HotSpotList.tsx
│   │   │   └── HotSpotDetail.tsx
│   │   └── three/
│   │       └── ParticleField.tsx    ← 3D 数据粒子背景
│   ├── lib/
│   │   ├── auth.ts                  ← Auth.js 配置
│   │   ├── db.ts                    ← Prisma client
│   │   ├── scrapers/
│   │   │   ├── index.ts             ← 注册中心
│   │   │   ├── weibo.ts
│   │   │   ├── zhihu.ts
│   │   │   ├── bilibili.ts
│   │   │   ├── github.ts
│   │   │   └── firecrawl-fallback.ts
│   │   ├── ai/
│   │   │   ├── openrouter.ts
│   │   │   ├── schemas.ts           ← Zod schemas
│   │   │   ├── classify.ts
│   │   │   ├── dedupe.ts
│   │   │   ├── score.ts
│   │   │   ├── summarize.ts
│   │   │   └── pipeline.ts          ← 五步串联
│   │   ├── alerts.ts                ← 预警匹配引擎
│   │   ├── models.ts                ← 推荐模型列表
│   │   └── utils.ts
│   ├── stores/
│   │   └── ui-store.ts              ← Zustand: 主题、动画开关
│   └── styles/
│       └── cyber.css                ← 主题变量
├── tests/
│   ├── unit/
│   │   ├── scrapers.test.ts
│   │   └── ai-pipeline.test.ts
│   └── e2e/
│       └── full-flow.spec.ts
├── .env.example
├── .gitignore
├── package.json
├── next.config.ts
├── tsconfig.json
└── README.md
```

---

## 7. 赛博朋克 UI 设计规范

### 7.1 设计令牌（Design Tokens）

```css
/* src/styles/cyber.css */
:root {
  /* 颜色 */
  --c-bg: #0A0014;             /* 深紫黑底 */
  --c-bg-elevated: #110024;
  --c-primary: #B026FF;        /* 霓虹紫 */
  --c-accent: #00F0FF;         /* 霓虹青 */
  --c-warning: #FFD600;        /* 警示黄 */
  --c-danger: #FF003C;         /* 警示红 */
  --c-text: #E0E0FF;
  --c-text-dim: #8888AA;

  /* 字体 */
  --font-display: 'Orbitron', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;

  /* 动画 */
  --t-fast: 150ms;
  --t-normal: 300ms;
  --ease-cyber: cubic-bezier(0.16, 1, 0.3, 1);
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; }
}
```

### 7.2 标志性元素清单

| 元素 | 实现 |
|---|---|
| 3D 数据流背景 | Three.js 点阵网格 + 闪烁线条 |
| 卡片边框 | SVG stroke-dasharray 动画扫描线 |
| 标题 hover | CSS clip-path 实现 glitch 撕裂 |
| 热度评分 | requestAnimationFrame 数字跳动 |
| 新热点入场 | Framer Motion `layoutId` + 顶部脉冲 |
| 信号瀑布 | 容器顶部 SVG line + framer 重复 transform |
| 状态指示器 | 右下角"AI Core Active"附呼吸光晕动画 |
| 预警提示音 | Web Audio API 合成"哔"声（可关闭） |

---

## 8. 开发分阶段（Phase）

| Phase | 目标 | 交付物 | 验收方式 |
|---|---|---|---|
| **Phase 1** | 项目骨架 | Next.js 初始化、Prisma 接入、DB 跑通 migrate、Auth.js 框架就位、Tailwind 配色 | `npm run dev` 启动首页可见 |
| **Phase 2** | 多源抓取 | 4 个 scraper 单测通过、`/api/cron/ingest` 能写入 DB | `npm run ingest` 输出 ≥ 200 条原始数据 |
| **Phase 3** | AI Pipeline | 五步 pipeline 完整、模型可切 | `npm run pipeline:demo` 输出结构化结果 |
| **Phase 4** | 赛博朋克 UI | 登录注册 / Dashboard / 详情页可视化 | 浏览器手动 walkthrough |
| **Phase 5** | 订阅 + 预警 + 设置 | 完整业务闭环 | 创建订阅 → 跑 pipeline → 收到 Alert |
| **Phase 6** | **网页版集成验收** | E2E 测试通过、README 完整 | **找您验收** |
| **Phase 7** | Agent Skills | `SKILL.md` 编写、CLI 工具 | 在 Cursor 中调用通过 |

---

## 9. 环境变量

`.env.example`：

```env
# 数据库（Prisma 7 推荐放 prisma.config.ts，但保留 env 以方便）
DATABASE_URL="file:./prisma/dev.db"

# Auth.js
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""

# OpenRouter（系统级，所有用户共享）
OPENROUTER_API_KEY=""

# 抓取相关
CRON_SECRET="<random 32 chars>"
FIRECRAWL_API_KEY=""                # Firecrawl MCP 兜底，可选

# 第二阶段
TWITTERAPI_IO_KEY=""                # X 数据源，暂不用
```

---

## 10. 测试策略

### 10.1 单元测试（Vitest）

- 每个 scraper：mock HTTP 响应，验证解析逻辑
- AI Pipeline：mock OpenRouter，验证 Schema 校验

### 10.2 端到端测试（Playwright）

```
注册 → 登录 → Dashboard 渲染 → 点开详情 → 创建订阅 → 触发 ingest → 收到 Alert
```

### 10.3 手动验收清单

见 `REQUIREMENTS.md` § 5.1。

---

## 11. 风险与缓解

| 风险 | 概率 | 影响 | 缓解 |
|---|---|---|---|
| 平台反爬升级 | 中 | 高 | Firecrawl MCP 兜底 + UA 轮换 + 多源交叉 |
| OpenRouter 成本失控 | 中 | 中 | 默认走 Flash 模型、单次抓取上限、每用户 Alert 节流 |
| Three.js 影响低端机 | 低 | 中 | prefers-reduced-motion + 设置开关 |
| SQLite 并发上限 | 低 | 中 | 仅个人/小团队使用足够，生产可切 PG |
| AI 输出 JSON 不合规 | 低 | 中 | OpenRouter `response-healing` 插件 + Zod 严格校验 |

---

## 12. 决策日志

| # | 决策 | 日期 | 理由 |
|---|---|---|---|
| D-001 | 用 Next.js 16 而非 Remix/SvelteKit | 2026-05-25 | App Router 成熟、生态最大、Vercel 部署友好 |
| D-002 | 用 Prisma 而非 Drizzle | 2026-05-25 | Prisma 7 已解决冷启慢的历史问题 |
| D-003 | 第一阶段不接 X / Twitter | 2026-05-25 | 用户选择，专注其他 4 平台先跑起来 |
| D-004 | 自研组件而非用 ShadCN | 2026-05-25 | 用户要求"独特、不千篇一律" |
| D-005 | OpenRouter Key 系统级共享 | 2026-05-25 | 用户选择，降低注册门槛 |
| D-006 | 默认模型 `gemini-2.5-flash` | 2026-05-25 | 性价比之王（$0.003/run, 1.1s, 97% 准确率） |
| D-007 | **改默认模型为 `deepseek/deepseek-v3.2`** | 2026-05-26 | 用户反馈：海外模型对中文区域有访问限制；改为国产模型族（DeepSeek/Qwen/GLM/Kimi），仍走 OpenRouter 统一接入 |
| D-008 | UI 风格切换：CP2077 → HotPulse（深蓝玻璃拟态） | 2026-05-26 | 用户提供 HotPulse 截图作为目标风格 |
| D-009 | 数据源扩到 6 个：+ Twitter（TwitterAPI.io）+ HackerNews | 2026-05-26 | 用户提供 TwitterAPI.io key；顺手补足 HN 技术热点 |

---

## 13. 参考资料（2026-05 核对）

- Next.js 16.2.6: <https://github.com/vercel/next.js/releases/tag/v16.2.6>
- Auth.js v5 + Prisma: <https://authjs.dev/getting-started/adapters/prisma>
- OpenRouter Provider v2.9.0: <https://www.npmjs.com/package/@openrouter/ai-sdk-provider>
- Prisma 7.8.0: <https://github.com/prisma/prisma/releases/tag/7.8.0>
- 微博热搜聚合 API: <https://docs.60s-api.viki.moe/254026663e0>
- 知乎热榜接口: <https://github.com/zhaoweilong007/zhihuCrawler>
- B 站热门视频接口: <https://github.com/pskdje/bilibili-API-collect/blob/main/docs/video_ranking/popular.md>
- LLM Benchmark 2026: <https://dev.to/ianlpaterson/llm-benchmark-rankings-2026-15-models-tested-on-38-real-coding-tasks-40kn>
