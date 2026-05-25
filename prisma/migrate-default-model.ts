/**
 * 一次性脚本：把所有使用旧默认模型（google/gemini-2.5-flash）的用户
 * 迁移到新的国产默认模型（deepseek/deepseek-v3.2）
 *
 * 用法：npx tsx prisma/migrate-default-model.ts
 */
import { PrismaClient } from "@prisma/client";
import { DEFAULT_MODEL_ID } from "../src/lib/ai/models";

const db = new PrismaClient();

async function main() {
  const result = await db.user.updateMany({
    where: { preferredModel: "google/gemini-2.5-flash" },
    data: { preferredModel: DEFAULT_MODEL_ID },
  });
  console.log(
    `✓ Migrated ${result.count} user(s) to default model: ${DEFAULT_MODEL_ID}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
