"use client";

/**
 * CardSpotlight - 鼠标跟随径向光晕
 * 基于 Aceternity UI 「Card Spotlight」的思路：onMouseMove + CSS 变量
 * https://ui.aceternity.com/components/card-spotlight
 *
 * 设计：包裹任何子元素，hover 时鼠标位置生成径向渐变光晕。
 * 性能：mouseenter 才绑定 mousemove，mouseleave 解绑。
 */

import { useRef, type ReactNode, type CSSProperties } from "react";

interface CardSpotlightProps {
  children: ReactNode;
  className?: string;
  /** 光晕颜色（CSS color） */
  color?: string;
  /** 光晕半径 px */
  radius?: number;
  /** 容器是否需要 overflow-hidden + relative（默认 true） */
  withBorder?: boolean;
}

export function CardSpotlight({
  children,
  className,
  color = "rgba(0, 229, 255, 0.18)",
  radius = 360,
  withBorder = true,
}: CardSpotlightProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
    el.style.setProperty("--spot-opacity", "1");
  };

  const handleMouseLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--spot-opacity", "0");
  };

  const style: CSSProperties & Record<string, string | number> = {
    "--spot-x": "50%",
    "--spot-y": "50%",
    "--spot-radius": `${radius}px`,
    "--spot-color": color,
    "--spot-opacity": "0",
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={style}
      className={`card-spotlight relative ${withBorder ? "" : ""} ${className ?? ""}`}
    >
      {children}
    </div>
  );
}
