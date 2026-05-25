"use client";

/**
 * Sparkles - 粒子背景
 * 基于 Aceternity UI 「Sparkles」的轻量化实现：纯 Canvas，无 tsparticles 依赖
 * https://ui.aceternity.com/components/sparkles
 */

import { useEffect, useRef } from "react";

interface SparklesProps {
  id?: string;
  className?: string;
  background?: string;
  particleSize?: number;
  minSize?: number;
  maxSize?: number;
  particleColor?: string;
  /** 每万平方像素的粒子数（默认 8 = 较稀疏） */
  particleDensity?: number;
  /** 速度倍率 */
  speed?: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  alpha: number;
  alphaDir: 1 | -1;
  alphaSpeed: number;
  vx: number;
  vy: number;
}

export function Sparkles({
  id = "sparkles",
  className,
  background = "transparent",
  minSize = 0.6,
  maxSize = 1.4,
  particleColor = "#a5e7ff",
  particleDensity = 8,
  speed = 0.4,
}: SparklesProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const reducedMotion = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    reducedMotion.current = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let particles: Particle[] = [];
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;

    const setup = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const rect = parent.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);

      const area = (width * height) / 10000;
      const count = Math.max(8, Math.min(160, Math.round(area * particleDensity)));
      particles = Array.from({ length: count }, () => mkParticle());
    };

    const mkParticle = (): Particle => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: minSize + Math.random() * (maxSize - minSize),
      alpha: Math.random() * 0.7 + 0.1,
      alphaDir: Math.random() > 0.5 ? 1 : -1,
      alphaSpeed: 0.003 + Math.random() * 0.007,
      vx: (Math.random() - 0.5) * speed,
      vy: (Math.random() - 0.5) * speed,
    });

    const tick = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
        p.alpha += p.alphaDir * p.alphaSpeed;
        if (p.alpha > 0.85) p.alphaDir = -1;
        else if (p.alpha < 0.1) p.alphaDir = 1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = withAlpha(particleColor, p.alpha);
        ctx.shadowBlur = 6;
        ctx.shadowColor = withAlpha(particleColor, p.alpha * 0.8);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      if (!reducedMotion.current) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    setup();
    if (!reducedMotion.current) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // 静态绘制一次
      tick();
    }

    const ro = new ResizeObserver(() => {
      setup();
    });
    if (canvas.parentElement) ro.observe(canvas.parentElement);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [minSize, maxSize, particleColor, particleDensity, speed]);

  return (
    <canvas
      ref={canvasRef}
      id={id}
      className={`absolute inset-0 w-full h-full ${className ?? ""}`}
      style={{ background }}
    />
  );
}

function withAlpha(hex: string, alpha: number): string {
  if (hex.startsWith("rgb")) return hex;
  const cleaned = hex.replace("#", "");
  const bigint = parseInt(
    cleaned.length === 3
      ? cleaned.split("").map((c) => c + c).join("")
      : cleaned,
    16,
  );
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
