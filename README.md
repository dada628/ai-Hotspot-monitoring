# HotPulse · AI 热点雷达

> 多源聚合 · AI 智能分析 · 实时热点雷达

[![Next.js](https://img.shields.io/badge/Next.js-16.2.6-black?logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4-38B2AC?logo=tailwindcss)](https://tailwindcss.com/)
[![Prisma](https://img.shields.io/badge/Prisma-6.19-2D3748?logo=prisma)](https://www.prisma.io/)

> 🧭 **新开对话的 AI 请先读** [`docs/HANDOVER.md`](./docs/HANDOVER.md) —— 项目完整上下文都在那。

---

## ✨ 特性

- 🌐 **多源聚合（6 个源）**：微博 · 知乎 · B 站 · GitHub Trending · Twitter (TwitterAPI.io) · HackerNews
- 🤖 **AI 智能 Pipeline**：分类 / 去重 / 评分 / 摘要 / 预警，通过 OpenRouter 调用国产模型（DeepSeek / Qwen / GLM / Kimi）
- 🎨 **HotPulse UI**：深蓝太空 + 玻璃拟态 + 圆角现代，自研组件库
- 🔄 **运行时模型切换**：用户可在设置页换任意模型，默认 `deepseek/deepseek-v3.2`
- 👥 **多用户系统**：邮箱密码（Auth.js v5 Credentials）+ 可选 GitHub OAuth
- ⏰ **手动 + 定时抓取**：管理面板手动触发，定时任务待 Phase 5
- 🔔 **个人订阅**：关键词 + 平台 + 分类 + 阈值 → 站内预警（Phase 5）

---

## 🚀 快速开始

### 前置要求

- Node.js **20+**（推荐 22）
- npm **10+**

### 1) 安装依赖

```bash
npm install
```

### 2) 配置环境变量

```bash
cp .env.example .env
```

至少需要：

- `AUTH_SECRET` —— `openssl rand -base64 32` 生成
- `OPENROUTER_API_KEY` —— [openrouter.ai](https://openrouter.ai) 注册获取
- `TWITTERAPI_IO_KEY` —— [twitterapi.io](https://twitterapi.io) 注册获取（可选，不填则 Twitter 源抓取失败但其他 5 源照常）

### 3) 初始化数据库

```bash
npm run db:push
npm run db:seed
```

种子脚本会创建管理员账户：

- 邮箱：`admin@nexus.local`
- 密码：`admin12345`

### 4) 启动开发服务器

```bash
npm run dev
```

打开 <http://localhost:3000>，点击右上角 **"立即扫描"** 触发首次抓取。

### 5) 端到端测试

```bash
npx tsx scripts/e2e-test.ts
```

预期输出：`Passed: 31 / Failed: 0`

---

## 📁 项目结构

```text
ai-Hotspot monitoring/
├── docs/
│   ├── HANDOVER.md           ← AI 接力的项目上下文（新对话先读）
│   ├── REQUIREMENTS.md       ← 需求文档
│   └── DESIGN.md             ← 技术方案 + ADR
├── scripts/
│   └── e2e-test.ts           ← 端到端测试（31 用例）
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── dev.db                ← SQLite (运行时生成)
├── src/
│   ├── app/
│   │   ├── page.tsx          ← 主页：热点雷达仪表盘
│   │   ├── admin/ingest/     ← 数据采集面板
│   │   ├── dashboard/        ← Phase 4 占位
│   │   ├── login/            ← Phase 4 占位
│   │   ├── globals.css       ← HotPulse 设计系统
│   │   └── api/
│   │       ├── auth/[...nextauth]/
│   │       ├── ingest/       ← POST 触发抓取
│   │       ├── hotspots/     ← GET 信息流
│   │       └── admin/stats/
│   ├── components/           ← Brand · StatCard · Tabs · HotItemCard · Badge · PillSelect
│   └── lib/
│       ├── auth.ts
│       ├── db.ts
│       ├── platforms.ts      ← 6 平台元数据
│       ├── ingest.ts
│       ├── scrapers/         ← 6 个数据源抓取器
│       └── ai/
│           └── models.ts     ← 7 个国产模型目录（DeepSeek/Qwen/GLM/Kimi）
└── package.json
```

---

## 🛠 NPM Scripts

| 命令 | 说明 |
|---|---|
| `npm run dev` | Next.js 开发服务器 |
| `npm run build` | 生产构建 |
| `npm start` | 生产服务器 |
| `npm run type-check` | TypeScript 类型检查（应 0 错误） |
| `npm run db:push` | 同步 schema 到数据库 |
| `npm run db:seed` | 创建管理员账户 |
| `npm run db:studio` | Prisma Studio GUI |
| `npx tsx scripts/e2e-test.ts` | 端到端测试套件 |

---

## 🗺 开发路线图

| Phase | 状态 | 内容 |
|---|---|---|
| 1 · 骨架 | ✅ | Next 16 + Prisma 6 + Auth.js v5 |
| 2 · 多源抓取 | ✅ | 6 个数据源全部 SUCCESS |
| 2.5 · 设计切换 | ✅ | CP2077 → HotPulse 风格 |
| 2.6 · 国产模型默认 | ✅ | `deepseek/deepseek-v3.2` |
| 2.7 · E2E 测试 | ✅ | 31/31 PASS |
| **3 · AI Pipeline** | ⏳ | 分类 / 去重 / 评分 / 摘要 / 预警 |
| 4 · 认证 UI + Dashboard | ⏳ | |
| 5 · 定时任务 + 预警 + 设置 | ⏳ | 模型动态切换 |
| 6 · 集成测试 + 验收 | ⏳ | 网页版正式 release |
| 7 · Agent Skills | ⏳ | |

详细方案见 [docs/DESIGN.md](./docs/DESIGN.md)。

---

## 🎨 设计风格

**HotPulse**：深蓝太空背景（`#070b16` + 蓝/紫/青径向光晕）+ 玻璃拟态卡片（`backdrop-blur`）+ 圆角现代。

主色：

- 主：`#3b82f6` (Brand Blue) → `#22d3ee` (Cyan) 渐变
- 紫：`#8b5cf6`
- 平台色：微博粉、知乎蓝、B站粉、GitHub 紫、Twitter 蓝、HN 橘

字体：Inter（标题）+ JetBrains Mono（终端/数据）

---

## 📜 License

私有项目，仅供学习与个人使用。
