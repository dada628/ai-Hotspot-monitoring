"use client";

/**
 * BorderBeam - 边框流光
 * 灵感来自 Aceternity / Magic UI 的 Border Beam 效果
 * 纯 CSS conic-gradient + animation，无 motion 依赖
 *
 * 用法：把它作为绝对定位的兄弟放到 relative 容器内。
 */

import type { CSSProperties } from "react";

interface BorderBeamProps {
  /** 圈出动画一圈的时长（秒） */
  duration?: number;
  /** 流光宽度（°，conic-gradient 中的覆盖角度） */
  size?: number;
  /** 主色 */
  colorFrom?: string;
  /** 末端淡出色 */
  colorTo?: string;
  /** 边框圆角 px */
  borderRadius?: number;
  /** 边框厚度 px */
  borderWidth?: number;
  /** 透明度 */
  opacity?: number;
  className?: string;
}

export function BorderBeam({
  duration = 6,
  size = 60,
  colorFrom = "#00e5ff",
  colorTo = "#60a5fa",
  borderRadius = 16,
  borderWidth = 1.5,
  opacity = 0.9,
  className,
}: BorderBeamProps) {
  const style: CSSProperties = {
    borderRadius,
    padding: borderWidth,
    opacity,
    background: `conic-gradient(from 0deg, transparent ${100 - size}%, ${colorFrom}, ${colorTo}, transparent)`,
    WebkitMask:
      "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
    animation: `border-beam-rotate ${duration}s linear infinite`,
  };

  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
      style={style}
    />
  );
}
