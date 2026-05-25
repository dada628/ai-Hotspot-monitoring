import Link from "next/link";
import { Brand } from "@/components/Brand";

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[rgba(7,11,22,0.7)] border-b border-[var(--color-line)]">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          <Brand />
          <Link href="/" className="btn btn-secondary">
            ← 返回主页
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md glass-strong p-8">
          <div className="text-center mb-6">
            <Brand showSubtitle={false} asLink={false} size="lg" />
            <h2 className="text-xl font-semibold text-white mt-4 mb-1">
              访问 HotPulse
            </h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              登录界面将在 Phase 4 接入
            </p>
          </div>

          <div className="space-y-4">
            <div className="px-4 py-3 rounded-lg bg-[rgba(245,158,11,0.08)] border border-[rgba(245,158,11,0.3)]">
              <div className="text-xs font-semibold text-[var(--color-warn-bright)] mb-2">
                ⚠ 开发凭据
              </div>
              <div className="font-mono text-xs space-y-1 text-[var(--color-text-dim)]">
                <div>
                  邮箱: <span className="text-white">admin@nexus.local</span>
                </div>
                <div>
                  密码: <span className="text-white">admin12345</span>
                </div>
              </div>
            </div>

            <div className="text-xs text-[var(--color-text-muted)] leading-relaxed">
              Auth.js v5 + Credentials Provider 已配置。
              <br />
              可通过 <code className="text-[var(--color-brand-bright)]">/api/auth/*</code>{" "}
              直接测试 API，UI 表单待 Phase 4 上线。
            </div>

            <div className="flex gap-3 pt-2">
              <Link href="/" className="btn btn-primary flex-1">
                热点雷达
              </Link>
              <Link href="/admin/ingest" className="btn btn-secondary flex-1">
                数据采集
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
