"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Tabs } from "@/components/Tabs";
import { StatCard } from "@/components/StatCard";
import { PillSelect } from "@/components/PillSelect";
import { HotItemCard } from "@/components/HotItemCard";
import { Spotlight } from "@/components/aceternity/Spotlight";
import { Sparkles } from "@/components/aceternity/Sparkles";
import { BorderBeam } from "@/components/aceternity/BorderBeam";
import { ALL_PLATFORMS, PLATFORM_META } from "@/lib/platforms";

interface HotspotSource {
  platform: string;
  url: string;
  metric: string;
  rawTitle: string;
}
interface Hotspot {
  id: string;
  title: string;
  summary: string | null;
  score: number;
  engagementScore: number;
  category: string | null;
  tags: string;
  firstSeenAt: string;
  updatedAt: string;
  sources: HotspotSource[];
}

interface Stats {
  totalHotSpots: number;
  todayNew: number;
  urgentCount: number;
  keywordsCount: number;
}

interface IngestSummary {
  totalDurationMs: number;
  results: Array<{
    platform: string;
    status: string;
    inserted: number;
    updated: number;
    itemsFetched: number;
  }>;
}

interface AiProcessResponse {
  ai: {
    scanned: number;
    succeeded: number;
    failed: number;
    totalDurationMs: number;
  };
  alerts: {
    alertsCreated: number;
    alertsSkipped: number;
  };
}

const SORT_OPTIONS = [
  { id: "hotness", label: "热度综合", icon: <TrendingUpIcon /> },
  { id: "newest_seen", label: "最新发现", icon: <ClockMiniIcon /> },
  { id: "newest_updated", label: "最新更新", icon: <RefreshMiniIcon /> },
  { id: "importance", label: "重要程度", icon: <BoltIcon /> },
  { id: "relevance", label: "相关性", icon: <TargetIcon /> },
];

const PLATFORM_OPTIONS = [
  { id: "all", label: "全部来源" },
  ...ALL_PLATFORMS.map((p) => ({ id: p, label: PLATFORM_META[p].label })),
];

const SEVERITY_OPTIONS = [
  { id: "all", label: "全部等级" },
  { id: "critical", label: "紧急" },
  { id: "high", label: "重要" },
  { id: "medium", label: "中等" },
  { id: "low", label: "一般" },
];

const TIME_OPTIONS = [
  { id: "all", label: "全部时间" },
  { id: "1h", label: "1 小时内" },
  { id: "6h", label: "6 小时内" },
  { id: "24h", label: "今日" },
  { id: "7d", label: "近 7 天" },
];

const CRED_OPTIONS = [
  { id: "all", label: "全部可信度" },
  { id: "trusted", label: "可信" },
  { id: "neutral", label: "中性" },
];

const TABS = [
  { id: "radar", label: "热点雷达", icon: <RadarIcon /> },
  { id: "watchlist", label: "监控词", icon: <EyeIcon /> },
  { id: "search", label: "搜索", icon: <SearchIcon /> },
];

export default function HomePage() {
  const [tab, setTab] = useState("radar");
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Hotspot[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanReport, setScanReport] = useState<string | null>(null);
  const [lastScanAt, setLastScanAt] = useState<number | null>(null);
  const [processing, setProcessing] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);

  const [sort, setSort] = useState("hotness");
  const [platform, setPlatform] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [cred, setCred] = useState("all");
  const [time, setTime] = useState("all");
  const [keyword, setKeyword] = useState("");

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        platform,
        severity,
        sort,
        time,
        cred,
        limit: "50",
      });
      if (keyword) params.set("q", keyword);
      const [statsRes, listRes] = await Promise.all([
        fetch("/api/admin/stats", { cache: "no-store" }),
        fetch(`/api/hotspots?${params.toString()}`, { cache: "no-store" }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (listRes.ok) {
        const data = await listRes.json();
        setItems(data.items);
      }
    } finally {
      setLoading(false);
    }
  }, [platform, severity, sort, time, cred, keyword]);

  // 当关键词被清空且当前是「相关性」排序时，自动回退到「热度综合」
  useEffect(() => {
    if (sort === "relevance" && !keyword.trim()) {
      setSort("hotness");
    }
  }, [sort, keyword]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const triggerScan = async () => {
    if (scanning) return;
    setScanning(true);
    setScanReport(null);
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-cron-secret-please-replace-1234567890",
        },
      });
      const data: IngestSummary = await res.json();
      const totalNew = data.results.reduce((s, r) => s + (r.inserted ?? 0), 0);
      setScanReport(
        `扫描完成 · 新增 ${totalNew} 条 · 用时 ${data.totalDurationMs}ms`,
      );
      setLastScanAt(Date.now());
      await loadAll();
    } catch (err) {
      setScanReport(
        `扫描失败：${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setScanning(false);
    }
  };

  const triggerAiProcess = async () => {
    if (processing) return;
    setProcessing(true);
    setAiReport(null);
    try {
      const res = await fetch("/api/process?limit=20&scope=unprocessed", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-cron-secret-please-replace-1234567890",
        },
      });
      const data: AiProcessResponse = await res.json();
      if (!res.ok) {
        const errAny = data as unknown as { error?: string };
        throw new Error(errAny?.error || `HTTP ${res.status}`);
      }
      const secs = (data.ai.totalDurationMs / 1000).toFixed(1);
      setAiReport(
        `AI 处理完成 · 成功 ${data.ai.succeeded}/${data.ai.scanned} 条` +
          ` · 用时 ${secs}s` +
          (data.alerts.alertsCreated > 0
            ? ` · 触发预警 ${data.alerts.alertsCreated} 条`
            : ""),
      );
      await loadAll();
    } catch (err) {
      setAiReport(
        `AI 处理失败：${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setProcessing(false);
    }
  };

  const resetFilters = () => {
    setSort("hotness");
    setPlatform("all");
    setSeverity("all");
    setCred("all");
    setTime("all");
    setKeyword("");
  };

  const filterCount = useMemo(() => {
    let n = 0;
    if (platform !== "all") n++;
    if (severity !== "all") n++;
    if (cred !== "all") n++;
    if (time !== "all") n++;
    if (keyword) n++;
    return n;
  }, [platform, severity, cred, time, keyword]);

  const scanIsOk =
    scanReport && !scanReport.startsWith("扫描失败");
  const aiIsOk = aiReport && !aiReport.startsWith("AI 处理失败");

  return (
    <main className="relative min-h-screen">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[rgba(7,11,22,0.7)] border-b border-[var(--color-line)]">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Brand />
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                type="button"
                onClick={triggerScan}
                disabled={scanning}
                className="relative btn btn-primary"
              >
                <RefreshIcon spinning={scanning} />
                {scanning ? "扫描中..." : "立即扫描"}
              </button>
              {scanning && (
                <BorderBeam
                  duration={2.2}
                  size={55}
                  colorFrom="#00e5ff"
                  colorTo="#a5e7ff"
                  borderRadius={10}
                />
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={triggerAiProcess}
                disabled={processing}
                className="relative btn btn-secondary"
                title="对未 AI 处理的热点跑分类/摘要/评分"
              >
                <SparklesIcon spinning={processing} />
                {processing ? "AI 处理中..." : "AI 处理"}
              </button>
              {processing && (
                <BorderBeam
                  duration={2.6}
                  size={55}
                  colorFrom="#a78bfa"
                  colorTo="#67e8f9"
                  borderRadius={10}
                />
              )}
            </div>
            <Link
              href="/admin/ingest"
              className="btn btn-secondary"
              aria-label="管理面板"
            >
              <SettingsIcon />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero · Spotlight + Sparkles */}
      <section className="relative overflow-hidden border-b border-[var(--color-line)]">
        <Spotlight />
        <div className="absolute inset-0 pointer-events-none">
          <Sparkles
            particleColor="#a5e7ff"
            particleDensity={6}
            minSize={0.4}
            maxSize={1.2}
            speed={0.3}
          />
        </div>
        <div className="relative max-w-7xl mx-auto px-6 py-12 lg:py-16">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <div className="inline-flex items-center gap-2 mb-4 px-2.5 py-1 rounded-full border border-[rgba(0,229,255,0.25)] bg-[rgba(0,229,255,0.06)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00e5ff] live-dot" />
                <span className="text-[11px] font-medium tracking-wide text-[#a5e7ff]">
                  LIVE · 6 SOURCES
                </span>
              </div>
              <h1 className="hero-title-gradient text-4xl md:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight">
                实时捕捉 AI 热点
              </h1>
              <p className="mt-4 text-sm md:text-base text-[var(--color-text-dim)] max-w-xl leading-relaxed">
                扫描微博 · 知乎 · B站 · GitHub · Twitter · HackerNews 6 个平台 ·{" "}
                <span className="text-[#67e8f9]">AI 智能分类去重</span> ·{" "}
                <span className="text-[#60a5fa]">第一时间预警</span>
              </p>
            </div>

            {/* 右侧：上次扫描信息 + 紧急计数 */}
            <div className="flex flex-col gap-2 items-end shrink-0">
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                <ClockMiniIcon />
                <span>
                  上次扫描：
                  {lastScanAt
                    ? `${Math.round((Date.now() - lastScanAt) / 1000)}s 前`
                    : "尚未扫描"}
                </span>
              </div>
              {stats && stats.urgentCount > 0 && (
                <div className="flex items-center gap-2 text-xs text-[var(--color-danger-bright)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger-bright)] live-dot" />
                  <span>
                    {stats.urgentCount} 条紧急热点等待处理
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-6 space-y-6">
        <Tabs items={TABS} value={tab} onChange={setTab} />

        {/* 扫描结果 toast */}
        {scanReport && (
          <div
            className={`glass-strong flex items-center gap-2 px-4 py-3 text-sm fade-in ${
              scanIsOk
                ? "text-[var(--color-success-bright)]"
                : "text-[var(--color-danger-bright)]"
            }`}
          >
            {scanIsOk ? <CheckCircleIcon /> : <XCircleIcon />}
            <span>{scanReport}</span>
          </div>
        )}

        {/* AI 处理结果 toast */}
        {aiReport && (
          <div
            className={`glass-strong flex items-center gap-2 px-4 py-3 text-sm fade-in ${
              aiIsOk
                ? "text-[#67e8f9]"
                : "text-[var(--color-danger-bright)]"
            }`}
          >
            {aiIsOk ? <SparklesIcon /> : <XCircleIcon />}
            <span>{aiReport}</span>
          </div>
        )}

        {/* 4 个统计卡 */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={<FlameIcon />}
            label="总热点"
            value={stats?.totalHotSpots ?? 0}
            hint="所有平台汇总"
            tone="cyan"
            loading={loading && !stats}
          />
          <StatCard
            icon={<ClockIcon />}
            label="今日新增"
            value={stats?.todayNew ?? 0}
            hint="过去 24 小时"
            tone="blue"
            loading={loading && !stats}
          />
          <StatCard
            icon={<AlertIcon />}
            label="紧急热点"
            value={stats?.urgentCount ?? 0}
            hint="评分 ≥ 85"
            tone="red"
            loading={loading && !stats}
          />
          <StatCard
            icon={<EyeIcon />}
            label="监控词"
            value={stats?.keywordsCount ?? 0}
            hint="启用的订阅"
            tone="green"
            loading={loading && !stats}
          />
        </section>

        {/* 热点流面板 */}
        <section className="glass p-5 lg:p-6">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <h2 className="flex items-center gap-2 text-base font-semibold text-white">
              <span className="text-[#00e5ff]">
                <FlameIcon />
              </span>
              实时热点流
            </h2>
            <div className="text-xs text-[var(--color-text-muted)]">
              每 30 分钟自动更新
            </div>
          </div>

          {/* 排序条 */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="text-xs text-[var(--color-text-muted)] mr-1 inline-flex items-center">
              <SortIcon /> 排序
            </span>
            {SORT_OPTIONS.map((s) => {
              const needsKeyword = s.id === "relevance";
              const disabled = needsKeyword && !keyword.trim();
              return (
                <button
                  key={s.id}
                  type="button"
                  className="pill disabled:opacity-40 disabled:cursor-not-allowed"
                  data-active={sort === s.id}
                  onClick={() => {
                    if (disabled) return;
                    setSort(s.id);
                  }}
                  disabled={disabled}
                  title={
                    disabled
                      ? "请先在右侧输入关键词后再使用相关性排序"
                      : undefined
                  }
                >
                  <span className="inline-flex items-center">{s.icon}</span>
                  {s.label}
                </button>
              );
            })}
            <div className="flex-1" />
            <button type="button" className="pill" data-active={filterCount > 0}>
              <FilterIcon />
              筛选
              {filterCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-bold text-white bg-[var(--color-brand)] rounded-full">
                  {filterCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className="pill"
              onClick={resetFilters}
              data-active={false}
            >
              <ResetIcon /> 重置
            </button>
          </div>

          {/* 筛选条 */}
          <div className="flex items-center gap-2 flex-wrap mb-5 pb-5 border-b border-[var(--color-line)]">
            <PillSelect
              label="来源"
              value={platform}
              onChange={setPlatform}
              options={PLATFORM_OPTIONS}
            />
            <PillSelect
              label="重要程度"
              value={severity}
              onChange={setSeverity}
              options={SEVERITY_OPTIONS}
            />
            <PillSelect
              label="可信度"
              value={cred}
              onChange={setCred}
              options={CRED_OPTIONS}
            />
            <PillSelect
              label="时间"
              value={time}
              onChange={setTime}
              options={TIME_OPTIONS}
            />
            <div className="relative inline-block">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="关键词"
                className="pill pl-8 pr-3 outline-none text-sm w-44 placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-brand)]"
                style={{ background: "rgba(148,163,184,0.06)" }}
              />
            </div>
          </div>

          {/* 内容流 */}
          {loading && items.length === 0 ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="glass p-5 h-32 shimmer" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-16 text-[var(--color-text-muted)]">
              <div className="text-[#67e8f9] mb-3 inline-block opacity-60">
                <RadarLargeIcon />
              </div>
              <div className="text-sm">
                还没有热点 · 点击右上角{" "}
                <span className="text-[#00e5ff]">立即扫描</span>{" "}
                开始第一轮抓取
              </div>
            </div>
          ) : (
            <div className="grid gap-3">
              {items.map((item) => {
                const tags = parseTags(item.tags);
                const effectiveScore = item.score > 0 ? item.score : item.engagementScore;
                const sev = scoreToSeverity(effectiveScore);
                const hotness = computeHotness(item.sources, effectiveScore);
                return (
                  <HotItemCard
                    key={item.id}
                    id={item.id}
                    title={item.title}
                    summary={item.summary}
                    score={effectiveScore}
                    category={item.category}
                    tags={tags}
                    updatedAt={item.updatedAt}
                    sources={item.sources.map((s) => ({
                      ...s,
                      metric: formatMetric(s.platform, parseMetric(s.metric)),
                    }))}
                    severity={sev}
                    credibility="trusted"
                    reference="direct"
                    hotness={hotness}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>

      <footer className="max-w-7xl mx-auto px-6 py-10 text-center text-xs text-[var(--color-text-muted)]">
        HotPulse · AI 热点雷达 ·{" "}
        <span className="text-[#00e5ff]">Phase 2 完成</span> · AI Pipeline 即将上线
      </footer>
    </main>
  );
}

// ============== 工具函数 ==============

function parseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function parseMetric(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function scoreToSeverity(
  score: number,
): "critical" | "high" | "medium" | "low" {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function formatMetric(platform: string, m: Record<string, unknown>): string {
  const fmt = (n: number) => {
    if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
    return n.toLocaleString();
  };
  if (platform === "weibo" && typeof m.heat === "number") return fmt(m.heat);
  if (platform === "zhihu" && typeof m.heat === "number") return fmt(m.heat);
  if (platform === "bilibili" && typeof m.views === "number") return fmt(m.views);
  if (platform === "github" && typeof m.stars === "number")
    return `★ ${m.stars}`;
  if (platform === "twitter" && typeof m.likes === "number")
    return `♥ ${fmt(m.likes)}`;
  if (platform === "hackernews" && typeof m.score === "number")
    return `▲ ${m.score}`;
  return "";
}

function computeHotness(sources: HotspotSource[], score: number): number {
  if (score > 0) return Math.min(100, Math.round(score));
  const first = sources[0];
  if (!first) return 0;
  const m = parseMetric(first.metric);
  const raw =
    Number(m.heat) ||
    Number(m.views) ||
    Number(m.stars) ||
    Number(m.likes) ||
    Number(m.score) ||
    0;
  if (raw <= 0) return 0;
  return Math.min(100, Math.round(Math.log10(raw + 1) * 18));
}

// ============== Inline Icons ==============

function FlameIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C12 2 9 6 9 10C9 12.5 10.5 14 12 14C13.5 14 15 12.5 15 10C15 8.5 14 7 14 7C14 7 15.5 8 16.5 10C17.5 12 17.5 14 17.5 14C17.5 18 14.5 22 12 22C9.5 22 6.5 18 6.5 14C6.5 8 12 2 12 2Z"
        fill="currentColor"
      />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 7V12L15 14"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ClockMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path
        d="M12 7V12L15 14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function RefreshMiniIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12C3 7.03 7.03 3 12 3C16 3 19.4 5.66 20.6 9.3M21 4V9H16M21 12C21 16.97 16.97 21 12 21C8 21 4.6 18.34 3.4 14.7M3 20V15H8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TrendingUpIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 17L9 11L13 15L21 7M21 7H15M21 7V13"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <path
        d="M13 2L4 14H12L11 22L20 10H12L13 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function TargetIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  );
}
function SortIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="mr-1">
      <path
        d="M3 6H21M6 12H18M10 18H14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M8 12L11 15L16 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function XCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M9 9L15 15M15 9L9 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 3L22 20H2L12 3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12 10V14M12 17V17.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function EyeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M2 12C2 12 5 5 12 5C19 5 22 12 22 12C22 12 19 19 12 19C5 19 2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
function RadarIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 13C3 7.5 7.5 3 13 3C17.5 3 21 6.5 21 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M7 13C7 9.5 10 7 13 7C15.5 7 17 9 17 11"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="13" cy="13" r="2" fill="currentColor" />
      <path
        d="M13 13L21 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function RadarLargeIcon() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 13C3 7.5 7.5 3 13 3C17.5 3 21 6.5 21 11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M7 13C7 9.5 10 7 13 7C15.5 7 17 9 17 11"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="13" cy="13" r="2" fill="currentColor" />
      <path
        d="M13 13L21 5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function SearchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M16.5 16.5L21 21"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 5H21L14 13V19L10 21V13L3 5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ResetIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M3 12C3 7.03 7.03 3 12 3C16 3 19.4 5.66 20.6 9.3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M21 4V9H16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12C21 16.97 16.97 21 12 21C8 21 4.6 18.34 3.4 14.7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={spinning ? "animate-spin" : ""}
    >
      <path
        d="M3 12C3 7.03 7.03 3 12 3C16 3 19.4 5.66 20.6 9.3"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M21 4V9H16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21 12C21 16.97 16.97 21 12 21C8 21 4.6 18.34 3.4 14.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M3 20V15H8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function SparklesIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={spinning ? "animate-pulse" : ""}
    >
      <path
        d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
        fill="currentColor"
      />
      <path
        d="M19 14L19.7 16.3L22 17L19.7 17.7L19 20L18.3 17.7L16 17L18.3 16.3L19 14Z"
        fill="currentColor"
      />
      <path
        d="M5 15L5.5 16.5L7 17L5.5 17.5L5 19L4.5 17.5L3 17L4.5 16.5L5 15Z"
        fill="currentColor"
      />
    </svg>
  );
}
function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M19.4 15A1.65 1.65 0 0 0 21 13.4V10.6A1.65 1.65 0 0 0 19.4 9C18.7 9 18 8.4 18 7.6C18 6.8 18.6 6.2 18.6 5.4C18.6 4.6 18 4 17.2 4H14.4C13.6 4 13 4.6 13 5.4C13 6.2 12.4 6.8 11.6 6.8C10.8 6.8 10.2 6.2 10.2 5.4C10.2 4.6 9.6 4 8.8 4H6C5.2 4 4.6 4.6 4.6 5.4C4.6 6.2 5.2 6.8 5.2 7.6C5.2 8.4 4.6 9 3.8 9A1.65 1.65 0 0 0 3 10.6V13.4A1.65 1.65 0 0 0 4.6 15C5.4 15 6 15.6 6 16.4C6 17.2 5.4 17.8 5.4 18.6C5.4 19.4 6 20 6.8 20H9.6C10.4 20 11 19.4 11 18.6C11 17.8 11.6 17.2 12.4 17.2C13.2 17.2 13.8 17.8 13.8 18.6C13.8 19.4 14.4 20 15.2 20H18C18.8 20 19.4 19.4 19.4 18.6C19.4 17.8 18.8 17.2 18.8 16.4C18.8 15.6 19.4 15 19.4 15Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
    </svg>
  );
}
