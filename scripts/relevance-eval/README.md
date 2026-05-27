# 相关性评估套件（P1）

评估「用户搜索词 `q` + 热点 title/summary」的语义相关性，与 `tech-filter`（科技宽口径）分离。

## 运行

```powershell
# 校验 golden 格式（不调 LLM）
npx tsx scripts/relevance-eval/run.ts --dry-run

# 完整评估（需 OPENROUTER_API_KEY，会消耗 token）
$env:RUN_AI_TESTS=1
npx tsx scripts/relevance-eval/run.ts

# 或
$env:FORCE_RELEVANCE_EVAL=1
npx tsx scripts/relevance-eval/run.ts

# 调试：只跑前 5 条
npx tsx scripts/relevance-eval/run.ts --limit 5
```

也可：`npm run eval:relevance`

## golden.jsonl 字段

| 字段 | 说明 |
|---|---|
| `id` | 唯一 ID |
| `query` | 用户搜索框输入 |
| `title` | 热点标题 |
| `summary` | 可选摘要 |
| `expectedTier` | `direct` / `related` / `irrelevant` |
| `notes` | 人工备注 |

## 扩展用例

1. 从线上误判复制 title/query 追加一行 JSON
2. `--dry-run` 校验格式
3. 跑完整评估，看报告「误判样例」

## 代码位置

- Judge：`src/lib/ai/relevance-judge.ts`
- Schema：`src/lib/ai/relevance-schemas.ts`
- 规则基线：`src/lib/relevance-rules.ts`（与 `GET /api/hotspots?sort=relevance` 子串逻辑一致）
