import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function DashboardPage() {
  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(7,11,22,0.7)] border-b border-[var(--color-line)]">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Brand />
          <Link href="/" className="btn btn-secondary">
            ← 返回主页
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-20">
        <div className="glass-strong p-10 text-center">
          <div className="text-5xl mb-4">🚧</div>
          <h1 className="text-2xl font-semibold text-white mb-2">
            个人仪表盘建造中
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mb-6 leading-relaxed">
            个人仪表盘将在 <span className="text-[var(--color-brand-bright)]">Phase 4</span>{" "}
            上线，包含：
            <br />
            订阅设置 · AI 模型偏好 · 个性化热点流 · 历史预警
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/" className="btn btn-primary">
              查看热点雷达
            </Link>
            <Link href="/admin/ingest" className="btn btn-secondary">
              数据采集面板
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
