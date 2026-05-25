/**
 * HTTP 工具：带超时、UA 轮换、错误规范化
 */

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
];

function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export interface FetchOptions extends RequestInit {
  /** 超时毫秒，默认 15000 */
  timeoutMs?: number;
  /** 额外 headers */
  extraHeaders?: Record<string, string>;
}

/**
 * 带超时的 fetch 包装
 */
export async function fetchWithTimeout(
  url: string,
  options: FetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 15000, extraHeaders, ...init } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "User-Agent": pickUserAgent(),
        Accept: "application/json, text/html, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        ...extraHeaders,
      },
    });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 抓取 JSON 数据
 */
export async function fetchJSON<T = unknown>(
  url: string,
  options: FetchOptions = {},
): Promise<T> {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

/**
 * 抓取 HTML 文本
 */
export async function fetchHTML(
  url: string,
  options: FetchOptions = {},
): Promise<string> {
  const res = await fetchWithTimeout(url, options);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return await res.text();
}
