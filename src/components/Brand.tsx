import Link from "next/link";

interface BrandProps {
  /** 显示子标题 */
  showSubtitle?: boolean;
  /** 链接到主页 */
  asLink?: boolean;
  size?: "sm" | "md" | "lg";
}

export function Brand({ showSubtitle = true, asLink = true, size = "md" }: BrandProps) {
  const iconSize = size === "lg" ? 48 : size === "sm" ? 32 : 40;
  const titleSize =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-base" : "text-lg";
  const content = (
    <div className="flex items-center gap-3">
      <div
        className="relative flex items-center justify-center rounded-xl"
        style={{
          width: iconSize,
          height: iconSize,
          background:
            "linear-gradient(135deg, #3b82f6 0%, #22d3ee 50%, #8b5cf6 100%)",
          boxShadow: "0 4px 20px rgba(59, 130, 246, 0.4)",
        }}
      >
        <FlameIcon size={iconSize * 0.55} />
        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full ring-2 ring-[var(--color-bg-0)] pulse-ring" />
      </div>
      <div>
        <div className={`font-semibold ${titleSize} text-white tracking-tight leading-tight`}>
          HotPulse
        </div>
        {showSubtitle && (
          <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 tracking-wide">
            AI 热点雷达
          </div>
        )}
      </div>
    </div>
  );

  return asLink ? (
    <Link href="/" className="inline-block">
      {content}
    </Link>
  ) : (
    content
  );
}

function FlameIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2C12 2 8 6 8 11C8 13.5 9.5 15 12 15C14.5 15 16 13.5 16 11C16 9 14 7 14 7C14 7 16 8 17 10C18 12 18 14 18 14C18 18 15 22 12 22C9 22 6 18 6 14C6 8 12 2 12 2Z"
        fill="white"
      />
    </svg>
  );
}
