"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Brand } from "@/components/Brand";
import { Badge } from "@/components/Badge";
import { ALL_PLATFORMS, PLATFORM_META, type PlatformKey } from "@/lib/platforms";

interface PlatformCount {
  platform: string;
  count: number;
}
interface IngestLog {
  id: string;
  platform: string;
  status: string;
  itemsCount: number;
  durationMs: number | null;
  errorMsg: string | null;
  startedAt: string;
}
interface HotSpotPreview {
  id: string;
  title: string;
  summary: string | null;
  score: number;
  category: string | null;
  tags: string;
  updatedAt: string;
  sources: Array<{
    platform: string;
    url: string;
    metric: string;
    rawTitle: string;
  }>;
}
interface Stats {
  platformCounts: PlatformCount[];
  recentLogs: IngestLog[];
  recentHotspots: HotSpotPreview[];
  totalHotSpots: number;
  todayNew: number;
  urgentCount: number;
  keywordsCount: number;
}
interface IngestSummary {
  startedAt: string;
  finishedAt: string;
  totalDurationMs: number;
  results: Array<{
    platform: string;
    status: string;
    itemsFetched: number;
    inserted: number;
    updated: number;
    durationMs: number;
    errorMsg?: string;
  }>;
}

export default function AdminIngestPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResult, setLastResult] = useState<IngestSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Set<PlatformKey>>(
    new Set(ALL_PLATFORMS),
  );

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStats(await res.json());
    } catch (err) {
      console.error("loadStats error:", err);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const triggerIngest = async () => {
    setLoading(true);
    setError(null);
    setLastResult(null);
    try {
      const platformsParam =
        selectedPlatforms.size === ALL_PLATFORMS.length
          ? ""
          : `?platforms=${Array.from(selectedPlatforms).join(",")}`;
      const res = await fetch(`/api/ingest${platformsParam}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer dev-cron-secret-please-replace-1234567890",
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setLastResult(data);
      await loadStats();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const togglePlatform = (p: PlatformKey) => {
    setSelectedPlatforms((prev) => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p);
      else next.add(p);
      if (next.size === 0) next.add(p); // 不允许全空
      return next;
    });
  };

  return (
    <main className="relative min-h-screen">
      {/* 顶部导航 */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(7,11,22,0.7)] border-b border-[var(--color-line)]">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Brand />
          <Link href="/" className="btn btn-secondary">
            ← 返回主页
          </Link>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        {/* 面包屑 + 标题 */}
        <div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] mb-2">
            <Link href="/" className="hover:text-white transition-colors">
              首页
            </Link>
            <ChevronIcon />
            <span>管理</span>
            <ChevronIcon />
            <span className="text-[var(--color-brand-bright)]">数据采集</span>
          </div>
          <h1 className="text-2xl font-semibold text-white tracking-tight">
            数据采集控制台
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            手动触发多源抓取 · 并发执行 · 失败不影响其他源 · 自动去重 (platform, url)
          </p>
        </div>

        {/* 平台选择 + 执行按钮 */}
        <section className="glass-strong p-5 lg:p-6">
          <div className="flex items-center justify-between flex-wrap gap-4 mb-4">
            <div>
              <div className="text-sm font-medium text-white mb-1">
                选择要抓取的源
              </div>
              <div className="text-xs text-[var(--color-text-muted)]">
                已选 {selectedPlatforms.size}/{ALL_PLATFORMS.length}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={triggerIngest}
              disabled={loading}
            >
              <RefreshIcon spinning={loading} />
              {loading ? "抓取中..." : "执行抓取"}
            </button>
          </div>

          {/* 平台 checkbox */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {ALL_PLATFORMS.map((p) => {
              const meta = PLATFORM_META[p];
              const checked = selectedPlatforms.has(p);
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => togglePlatform(p)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition-all ${
                    checked
                      ? "bg-[rgba(59,130,246,0.1)] border-[rgba(59,130,246,0.4)]"
                      : "bg-[rgba(148,163,184,0.04)] border-[var(--color-line)] hover:border-[var(--color-line-strong)]"
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded border flex items-center justify-center ${
                      checked
                        ? "bg-[var(--color-brand)] border-[var(--color-brand)]"
                        : "border-[var(--color-line-strong)]"
                    }`}
                  >
                    {checked && <CheckIcon />}
                  </span>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: meta.color }}
                  />
                  <span className="text-sm text-white flex-1 text-left">
                    {meta.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* 结果消息 */}
          {error && (
            <div className="mt-4 px-4 py-3 rounded-lg bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-sm text-[var(--color-danger-bright)]">
              ✗ {error}
            </div>
          )}
          {lastResult && (
            <div className="mt-5">
              <div className="text-sm text-[var(--color-success-bright)] mb-3">
                ✓ 抓取完成 · 用时 {lastResult.totalDurationMs}ms
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {lastResult.results.map((r) => {
                  const meta = PLATFORM_META[r.platform as PlatformKey];
                  const ok = r.status === "success";
                  return (
                    <div
                      key={r.platform}
                      className={`p-3 rounded-lg border ${
                        ok
                          ? "bg-[rgba(16,185,129,0.06)] border-[rgba(16,185,129,0.25)]"
                          : "bg-[rgba(239,68,68,0.06)] border-[rgba(239,68,68,0.25)]"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {meta && (
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ background: meta.color }}
                          />
                        )}
                        <span className="text-sm font-medium text-white">
                          {meta?.label ?? r.platform}
                        </span>
                        <Badge tone={ok ? "green" : "red"} className="ml-auto">
                          {ok ? "成功" : "失败"}
                        </Badge>
                      </div>
                      <div className="text-xs text-[var(--color-text-muted)]">
                        抓取 {r.itemsFetched} · 新增 {r.inserted} · 更新 {r.updated} ·{" "}
                        {r.durationMs}ms
                      </div>
                      {r.errorMsg && (
                        <div className="mt-1.5 text-xs text-[var(--color-danger-bright)] line-clamp-2">
                          {r.errorMsg}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* 平台数据量 + 日志 */}
        <section className="grid lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 glass p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">来源分布</h3>
              <span className="text-xs text-[var(--color-text-muted)]">
                总计 {stats?.totalHotSpots ?? 0}
              </span>
            </div>
            <div className="space-y-3">
              {ALL_PLATFORMS.map((p) => {
                const meta = PLATFORM_META[p];
                const count =
                  stats?.platformCounts.find((x) => x.platform === p)?.count ?? 0;
                const max = Math.max(
                  1,
                  ...(stats?.platformCounts.map((x) => x.count) ?? [1]),
                );
                const pct = (count / max) * 100;
                return (
                  <div key={p}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: meta.color }}
                        />
                        <span className="text-sm text-white">{meta.label}</span>
                      </div>
                      <span className="text-sm tabular-nums text-[var(--color-text-dim)]">
                        {count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[rgba(148,163,184,0.08)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${pct}%`,
                          background: meta.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 glass p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-white">抓取日志</h3>
              <button
                type="button"
                onClick={loadStats}
                className="btn btn-ghost text-xs"
              >
                <RefreshIcon /> 刷新
              </button>
            </div>
            <div className="space-y-1.5 max-h-72 overflow-y-auto -mx-2 px-2">
              {!stats?.recentLogs.length && (
                <div className="text-center py-10 text-sm text-[var(--color-text-muted)]">
                  暂无日志 · 点击上方执行抓取
                </div>
              )}
              {stats?.recentLogs.map((log) => {
                const meta = PLATFORM_META[log.platform as PlatformKey];
                const ok = log.status === "success";
                return (
                  <div
                    key={log.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[rgba(148,163,184,0.05)]"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ok ? "bg-emerald-400" : "bg-rose-400"
                      }`}
                    />
                    <span className="text-sm text-white min-w-[80px]">
                      {meta?.label ?? log.platform}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] flex-1">
                      {log.itemsCount} 条 · {log.durationMs}ms
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
                      {new Date(log.startedAt).toLocaleTimeString("zh-CN")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <footer className="text-center text-xs text-[var(--color-text-muted)] pt-2">
          Phase 2 · 多源抓取器（6 平台）· 已就绪
        </footer>
      </div>
    </main>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
      <path
        d="M9 6L15 12L9 18"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6.5L5 9L10 3"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function RefreshIcon({ spinning = false }: { spinning?: boolean }) {
  return (
    <svg
      width="14"
      height="14"
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
