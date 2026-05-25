/**
 * Prisma 数据种子脚本
 * 运行：npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcryptjs from "bcryptjs";
import { DEFAULT_MODEL_ID } from "../src/lib/ai/models";

const db = new PrismaClient();

async function main() {
  console.log("[seed] 开始初始化种子数据...");

  // 默认管理员账户（开发用）
  const adminEmail = "admin@nexus.local";
  const adminPassword = "admin12345";
  const passwordHash = await bcryptjs.hash(adminPassword, 10);

  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: "Nexus Admin",
      preferredModel: DEFAULT_MODEL_ID,
    },
  });

  console.log(`[seed] 默认账户已创建：${adminEmail} / ${adminPassword}`);
  console.log("[seed] 完成。");
}

main()
  .catch((e) => {
    console.error("[seed] 错误：", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
