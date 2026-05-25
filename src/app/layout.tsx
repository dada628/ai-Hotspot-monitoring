import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "HotPulse · AI 热点雷达",
    template: "%s · HotPulse",
  },
  description: "多源聚合 · AI 智能分析 · 实时热点雷达",
  keywords: ["AI", "热点监控", "舆情", "趋势分析", "Trending", "Hotspot"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased starfield">{children}</body>
    </html>
  );
}
