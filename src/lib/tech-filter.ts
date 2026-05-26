/**
 * 科技相关性过滤器（源头白名单）
 *
 * 设计目标：
 *   - 在抓取层把"通用平台"（weibo / zhihu / bilibili / hackernews topstories）的非科技噪音挡在入库之外
 *   - 维护一份中英双语的"科技专业词"白名单（~110 词，用户选定 tech_broad 范围）
 *   - 标题/摘要命中任一关键词 → 视为科技相关 → 允许入库
 *
 * 用户决策（2026-05-26）：
 *   - 范围 tech_broad：含 AI/芯片/机器人/量子/软件/互联网公司 等专业词
 *   - 不含娱乐圈"明星名+科技产品"边缘词（如"周杰伦发布新专辑"不该被科技词带过）
 *   - 不含纯财经/政经词
 *
 * 性能：
 *   - 单次调用 O(N)（N = 关键词数），N ≈ 110 → 每条标题判定 < 0.05ms
 *   - 中文走 includes（中文无词边界问题）
 *   - 英文短词（≤4 字母）走 \b...\b 正则避免误匹配（如 "AI" 不该匹配 "said"）
 *   - 英文长词走 lowercase includes
 */

/** 中文关键词：直接 includes 即可命中（中文无词边界） */
const CN_KEYWORDS = [
  // AI 与大模型
  "人工智能",
  "大模型",
  "大语言模型",
  "机器学习",
  "深度学习",
  "神经网络",
  "强化学习",
  "联邦学习",
  "生成式",
  "扩散模型",
  "多模态",
  "智能体",
  "具身智能",
  "通用人工智能",
  "推理模型",
  "对齐",
  "幻觉",
  // 公司（中文名）
  "苹果",
  "谷歌",
  "微软",
  "亚马逊",
  "脸书",
  "字节",
  "字节跳动",
  "阿里",
  "阿里巴巴",
  "腾讯",
  "百度",
  "华为",
  "小米",
  "英伟达",
  "高通",
  "联发科",
  "台积电",
  "中芯",
  "比亚迪",
  "特斯拉",
  "蔚来",
  "理想",
  "小鹏",
  "智己",
  "极氪",
  "宇树",
  "商汤",
  "旷视",
  "美团",
  "京东",
  "拼多多",
  // 人物
  "马斯克",
  "奥特曼",
  "黄仁勋",
  "库克",
  "雷军",
  "马化腾",
  "张一鸣",
  "梁文锋",
  "扎克伯格",
  // 技术领域
  "芯片",
  "半导体",
  "光刻",
  "晶圆",
  "量子",
  "量子计算",
  "机器人",
  "人形机器人",
  "自动驾驶",
  "智能驾驶",
  "电池",
  "新能源",
  "光伏",
  "区块链",
  "加密货币",
  "比特币",
  "以太坊",
  "云计算",
  "边缘计算",
  "数据中心",
  "操作系统",
  "鸿蒙",
  "麒麟",
  // 软件 / 编程
  "编程",
  "代码",
  "开源",
  "开发者",
  "工程师",
  "算法",
  "数据库",
  "框架",
  "前端",
  "后端",
  "全栈",
  "运维",
  "嵌入式",
  "黑客",
  "网络安全",
  "漏洞",
  "加密",
  // 产品
  "鸿蒙",
  "麒麟",
  "汽车软件",
  "智能驾驶舱",
  // 通用
  "科技",
  "数码",
  "互联网",
  "元宇宙",
  "虚拟现实",
  "增强现实",
  "智能手机",
];

/** 英文短词：必须用 \b 边界（4 字母及以下，避免误匹配如 "AI" 命中 "said"） */
const EN_SHORT_KEYWORDS = [
  "AI",
  "ML",
  "LLM",
  "AGI",
  "GPT",
  "GPU",
  "CPU",
  "NPU",
  "TPU",
  "SDK",
  "API",
  "IDE",
  "OS",
  "iOS",
  "Mac",
  "PC",
  "AR",
  "VR",
  "XR",
  "5G",
  "6G",
  "RAG",
  "MCP",
  "LoRA",
  "TTS",
  "ASR",
  "RL",
  "OCR",
  "RAM",
  "ROM",
  "EUV",
  "App",
  "iOS",
  "iPad",
  "Web3",
];

/** 英文长词：lowercase includes（≥5 字母不易误命中） */
const EN_LONG_KEYWORDS = [
  // 模型与产品
  "openai",
  "anthropic",
  "deepmind",
  "deepseek",
  "claude",
  "gemini",
  "qwen",
  "llama",
  "mistral",
  "midjourney",
  "stable diffusion",
  "sora",
  "chatgpt",
  "copilot",
  "cursor",
  "transformer",
  "diffusion",
  "embedding",
  "agent",
  // 公司
  "google",
  "microsoft",
  "apple",
  "amazon",
  "facebook",
  "meta ",
  "nvidia",
  "intel ",
  "amd ",
  "qualcomm",
  "tesla",
  "spacex",
  "huawei",
  "xiaomi",
  "samsung",
  "bytedance",
  "alibaba",
  "tencent",
  "baidu",
  "tsmc",
  "arm ",
  // 技术 / 产品
  "semiconductor",
  "quantum",
  "robotic",
  "robot",
  "autonomous",
  "blockchain",
  "bitcoin",
  "ethereum",
  "crypto",
  "metaverse",
  "iphone",
  "macbook",
  "android",
  "windows",
  "linux",
  "ubuntu",
  "chrome",
  "firefox",
  "safari",
  "github",
  "gitlab",
  "vscode",
  "nodejs",
  "python",
  "javascript",
  "typescript",
  "react",
  "vue.js",
  "next.js",
  "rust ",
  "golang",
  "docker",
  "kubernetes",
  "pytorch",
  "tensorflow",
  "hugging face",
  "huggingface",
  "kaggle",
  "arxiv",
  // 人物
  "elon musk",
  "sam altman",
  "tim cook",
  "satya nadella",
  "sundar pichai",
  "jensen huang",
  "mark zuckerberg",
  "dario amodei",
  // 通用
  "startup",
  "venture",
  "tech industry",
  "software",
  "hardware",
  "developer",
  "engineer",
  "algorithm",
  "research",
  "neural",
  "machine learning",
  "deep learning",
];

/**
 * 判断一段文本是否与科技相关
 *
 * @param text 标题、摘要、片段任意
 * @returns true 表示命中至少一个科技关键词
 */
export function isTechRelated(text: string | null | undefined): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1) 中文 includes（中文无词边界问题）
  for (const k of CN_KEYWORDS) {
    if (trimmed.includes(k)) return true;
  }

  const lower = trimmed.toLowerCase();

  // 2) 英文长词 lowercase includes
  for (const k of EN_LONG_KEYWORDS) {
    if (lower.includes(k)) return true;
  }

  // 3) 英文短词：必须 \b 边界
  for (const k of EN_SHORT_KEYWORDS) {
    // 注意：转义可能存在的正则元字符（这份列表没有，但留个保险）
    const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`\\b${escaped}\\b`, "i");
    if (re.test(trimmed)) return true;
  }

  return false;
}

/**
 * B 站分区白名单（按 tname 字段过滤）
 *
 * 用户决策：科技 + 知识两个分区
 *   - "科技"：手机/数码/电脑/AI 产品评测
 *   - "知识"：科普讲座、AI/编程/数学教程（如 3blue1brown 译制、李沐讲机器学习）
 */
const BILIBILI_TECH_PARTITIONS = new Set<string>(["科技", "知识"]);

export function isBilibiliTechPartition(tname: string | null | undefined): boolean {
  if (!tname) return false;
  return BILIBILI_TECH_PARTITIONS.has(tname.trim());
}

/**
 * 提供给外部（debug 脚本 / e2e 测试）做枚举校验
 */
export const TECH_FILTER_META = {
  cnCount: CN_KEYWORDS.length,
  enShortCount: EN_SHORT_KEYWORDS.length,
  enLongCount: EN_LONG_KEYWORDS.length,
  total: CN_KEYWORDS.length + EN_SHORT_KEYWORDS.length + EN_LONG_KEYWORDS.length,
  bilibiliPartitions: Array.from(BILIBILI_TECH_PARTITIONS),
};
