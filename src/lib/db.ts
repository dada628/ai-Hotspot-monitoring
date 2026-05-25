import { PrismaClient } from "@prisma/client";

declare global {
  // 防止在 Next.js 热重载时创建过多 PrismaClient 实例
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const db =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
