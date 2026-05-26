/**
 * 关键词中心 · v7 新增
 *
 * 用途：
 *   解决 google-news / twitter / hackernews 三个 scraper 调用 API 搜索时
 *   关键词死板的问题 —— 同一个模型经常有多种写法：
 *     例 1：Codex 5.3 / GPT-Codex-5.3 / GPT Codex 5.3
 *     例 2：Claude Sonnet 4.5 / Claude-Sonnet-4.5
 *     例 3：GLM-4.6 / GLM 4.6
 *
 * 设计原则：
 *   1. 集中目录：每个 family（厂商）维护别名列表，便于添加新模型
 *   2. 自动变体：autoVariants() 把 "-" / " " 互换，生成搜索友好的多种写法
 *   3. 双 query 智能合并：primary（活跃热门，召回精准） + secondary（细分版本 + 工具栈，召回广）
 *   4. 字符上限保护：每个 query 默认 ≤ 800 字符（URL/API 安全区）
 *   5. 公平分配：超限截断时，每个 family 至少保留 1 个最短别名
 *
 * 引用：
 *   - DESIGN.md ADR D-031 (v7)
 *   - HANDOVER.md §21 (v7)
 */

export type Tier = "primary" | "secondary";

export type Family =
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "alibaba"
  | "xai"
  | "meta"
  | "zhipu"
  | "moonshot"
  | "mistral"
  | "topic-en"
  | "topic-zh"
  | "tools";

export interface Entity {
  family: Family;
  tier: Tier;
  /** 用于按语言过滤；'both' 表示中英文 query 都纳入 */
  lang: "en" | "zh" | "both";
  /**
   * 该 entity 的所有等价别名（人工列出）。
   * autoVariants 还会从每个别名自动生成"空格 ↔ 连字符"变体。
   */
  aliases: string[];
}

/**
 * 静态目录 —— 约 60 个 entity / 总变体扩展后 ~150+ 关键词。
 *
 * 维护规则：
 *   - 新模型上线 → 在对应 family 加一行（不用改其他代码）
 *   - 模型停服 → 直接删除该行
 *   - tier=primary：核心品牌名 + 主版本（如 ChatGPT / Claude / Gemini）
 *   - tier=secondary：细分版本号变体（如 GPT-Codex-5.3 / Claude Opus 4.5）+ 工具栈
 */
export const KEYWORD_CATALOG: Entity[] = [
  // ---------- OpenAI ----------
  { family: "openai", tier: "primary", lang: "both", aliases: ["ChatGPT", "OpenAI"] },
  { family: "openai", tier: "primary", lang: "both", aliases: ["GPT-5", "GPT-5.2", "GPT-4o"] },
  { family: "openai", tier: "primary", lang: "en", aliases: ["o3"] },
  { family: "openai", tier: "secondary", lang: "en", aliases: ["o3-mini", "o4", "o4-mini"] },
  // 用户图片原例：Codex 5.3 / GPT-Codex-5.3
  { family: "openai", tier: "secondary", lang: "both", aliases: ["Codex", "GPT-Codex", "Codex 5.3", "GPT-Codex-5.3"] },
  { family: "openai", tier: "secondary", lang: "both", aliases: ["Sora", "DALL-E"] },

  // ---------- Anthropic ----------
  { family: "anthropic", tier: "primary", lang: "both", aliases: ["Claude", "Anthropic"] },
  { family: "anthropic", tier: "primary", lang: "en", aliases: ["Claude Opus", "Claude Sonnet", "Claude Haiku"] },
  { family: "anthropic", tier: "secondary", lang: "en", aliases: ["Claude 4.5", "Claude Opus 4.5", "Claude Sonnet 4.5", "Claude Haiku 4.5"] },

  // ---------- Google ----------
  { family: "google", tier: "primary", lang: "both", aliases: ["Gemini", "DeepMind"] },
  { family: "google", tier: "secondary", lang: "en", aliases: ["Gemini 3", "Gemini 2.5 Pro", "Gemini Flash", "Veo", "AlphaCode"] },

  // ---------- DeepSeek ----------
  { family: "deepseek", tier: "primary", lang: "both", aliases: ["DeepSeek", "深度求索"] },
  { family: "deepseek", tier: "secondary", lang: "both", aliases: ["DeepSeek V3", "DeepSeek V3.2", "DeepSeek R1", "DeepSeek R2"] },

  // ---------- Alibaba Qwen ----------
  { family: "alibaba", tier: "primary", lang: "both", aliases: ["Qwen", "通义千问", "通义"] },
  { family: "alibaba", tier: "secondary", lang: "both", aliases: ["Qwen3", "Qwen3-Max", "Qwen-VL"] },

  // ---------- xAI ----------
  { family: "xai", tier: "primary", lang: "both", aliases: ["Grok", "xAI"] },
  { family: "xai", tier: "secondary", lang: "en", aliases: ["Grok 4"] },

  // ---------- Meta ----------
  { family: "meta", tier: "primary", lang: "en", aliases: ["Llama", "LLaMA"] },
  { family: "meta", tier: "secondary", lang: "en", aliases: ["Llama 4", "Llama 3"] },

  // ---------- 智谱 GLM ----------
  { family: "zhipu", tier: "primary", lang: "both", aliases: ["GLM", "智谱"] },
  { family: "zhipu", tier: "secondary", lang: "both", aliases: ["GLM-4", "GLM-4.6", "GLM-Air"] },

  // ---------- 月之暗面 Kimi ----------
  { family: "moonshot", tier: "primary", lang: "both", aliases: ["Kimi", "月之暗面"] },
  { family: "moonshot", tier: "secondary", lang: "both", aliases: ["Kimi K2"] },

  // ---------- Mistral ----------
  { family: "mistral", tier: "secondary", lang: "en", aliases: ["Mistral", "Mistral Large"] },

  // ---------- 通用话题（英文） ----------
  // 注意 Q6：plain "AI" 已被降到 secondary（太广，会拖低 primary 召回精度）
  { family: "topic-en", tier: "primary", lang: "en", aliases: ["LLM", "AGI"] },
  { family: "topic-en", tier: "secondary", lang: "en", aliases: ["AI", "AI agent", "RAG", "MoE", "RLHF", "fine-tuning", "prompt engineering"] },

  // ---------- 通用话题（中文） ----------
  { family: "topic-zh", tier: "primary", lang: "zh", aliases: ["大模型", "人工智能"] },
  { family: "topic-zh", tier: "secondary", lang: "zh", aliases: ["智能体"] },

  // ---------- AI 工程工具栈 ----------
  { family: "tools", tier: "secondary", lang: "both", aliases: ["LangChain", "LlamaIndex", "vLLM"] },
  { family: "tools", tier: "secondary", lang: "both", aliases: ["Cursor", "Copilot", "Replit"] },
  { family: "tools", tier: "secondary", lang: "both", aliases: ["Hugging Face", "HuggingFace"] },
  { family: "tools", tier: "secondary", lang: "both", aliases: ["ComfyUI", "Stable Diffusion", "Midjourney"] },
];

/**
 * 给一个别名生成搜索友好的"空格 ↔ 连字符"变体。
 *
 * 示例：
 *   autoVariants("GPT-Codex-5.3") → ["GPT-Codex-5.3", "GPT Codex 5.3"]
 *   autoVariants("Codex 5.3")     → ["Codex 5.3", "Codex-5.3"]
 *   autoVariants("Claude Sonnet 4.5") → 4 种（全空格 / 全连字符 / 混合）
 *   autoVariants("Codex")         → ["Codex"]
 */
export function autoVariants(alias: string): string[] {
  const out = new Set<string>([alias]);
  const hasHyphen = alias.includes("-");
  const hasSpace = /\s/.test(alias);

  if (hasHyphen) out.add(alias.replace(/-/g, " "));
  if (hasSpace) out.add(alias.replace(/\s+/g, "-"));
  if (hasHyphen && hasSpace) {
    out.add(alias.replace(/[-\s]+/g, " "));
    out.add(alias.replace(/[-\s]+/g, "-"));
  }
  return Array.from(out);
}

/** 把一个 entity 的所有别名各自展开 autoVariants 后合并去重 */
export function entityAllVariants(entity: Entity): string[] {
  const all = new Set<string>();
  for (const a of entity.aliases) {
    for (const v of autoVariants(a)) all.add(v);
  }
  return Array.from(all);
}

/**
 * 含特殊字符（空格 / 连字符 / 点号）的 token 加双引号包裹，
 * 否则 Google News / Twitter 会把 "-" 当 NOT 运算符。
 */
function formatToken(token: string): string {
  return /[\s\-.]/.test(token) ? `"${token}"` : token;
}

/**
 * 把多个 entity 的所有变体压成 (a OR b OR c) 形式的 OR query；
 * 字符上限保护：
 *   1. 第一遍每个 entity 至少进 1 个最短 token（保公平）
 *   2. 第二遍剩余 token 按长度升序填充，直到达到上限
 */
function composeOrQuery(entities: Entity[], maxChars: number): string {
  if (entities.length === 0) return "()";

  const perEntityTokens: string[][] = entities.map((e) =>
    entityAllVariants(e).map(formatToken),
  );

  const picked = new Set<string>();
  let total = 2; // 括号

  // pass 1 —— 每个 entity 抢占一个最短 token
  for (const tokens of perEntityTokens) {
    if (tokens.length === 0) continue;
    const shortest = tokens.slice().sort((a, b) => a.length - b.length)[0];
    if (picked.has(shortest)) continue;
    const add = shortest.length + (picked.size === 0 ? 0 : 4);
    if (total + add > maxChars) continue; // 单个超限直接跳过
    picked.add(shortest);
    total += add;
  }

  // pass 2 —— 剩余 token 按长度升序灌入
  const remaining: string[] = [];
  for (const tokens of perEntityTokens) {
    for (const t of tokens) {
      if (!picked.has(t)) remaining.push(t);
    }
  }
  remaining.sort((a, b) => a.length - b.length);

  for (const t of remaining) {
    const add = t.length + 4;
    if (total + add > maxChars) break;
    picked.add(t);
    total += add;
  }

  return `(${Array.from(picked).join(" OR ")})`;
}

export interface BuildQueryResult {
  /** 主 query：核心品牌名 + 主版本，召回精准 */
  primary: string;
  /** 副 query：细分版本号 + 通用话题 + 工具栈，召回广 */
  secondary: string;
  /** 调试用：本次 query 实际包含的 token 数 */
  meta: {
    primaryTokens: number;
    secondaryTokens: number;
    primaryChars: number;
    secondaryChars: number;
  };
}

/**
 * 按语言过滤 KEYWORD_CATALOG，生成 primary + secondary 两条 OR query。
 *
 * @param opts.lang     'en' → 选 lang=='en' 或 'both' 的 entity；'zh' → 选 lang=='zh' 或 'both'
 * @param opts.maxChars 每条 query 的字符上限，默认 800（URL/API 安全区）
 */
export function buildKeywordQueries(opts: {
  lang: "en" | "zh";
  maxChars?: number;
}): BuildQueryResult {
  const max = opts.maxChars ?? 800;
  const matches = (e: Entity) => e.lang === opts.lang || e.lang === "both";

  const primaryEntities = KEYWORD_CATALOG.filter(
    (e) => e.tier === "primary" && matches(e),
  );
  const secondaryEntities = KEYWORD_CATALOG.filter(
    (e) => e.tier === "secondary" && matches(e),
  );

  const primary = composeOrQuery(primaryEntities, max);
  const secondary = composeOrQuery(secondaryEntities, max);

  return {
    primary,
    secondary,
    meta: {
      primaryTokens: (primary.match(/ OR /g)?.length ?? 0) + (primary === "()" ? 0 : 1),
      secondaryTokens: (secondary.match(/ OR /g)?.length ?? 0) + (secondary === "()" ? 0 : 1),
      primaryChars: primary.length,
      secondaryChars: secondary.length,
    },
  };
}

/**
 * 仅元信息，用于 e2e 测试断言（不影响运行时性能）。
 */
export const KEYWORD_CATALOG_META = {
  totalEntities: KEYWORD_CATALOG.length,
  primaryEntities: KEYWORD_CATALOG.filter((e) => e.tier === "primary").length,
  secondaryEntities: KEYWORD_CATALOG.filter((e) => e.tier === "secondary").length,
  families: Array.from(new Set(KEYWORD_CATALOG.map((e) => e.family))),
} as const;
