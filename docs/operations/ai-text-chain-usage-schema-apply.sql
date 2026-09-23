-- content-factory-next-97dq.55 — text chain and what each AI operation cost.
-- Apply ONLY this text, verbatim.
--
-- APPLIED to production 23.09.2026, release `ae55c65be5ff` (rollback `6928b1f20c47`),
-- together with the other wave file in one --single-transaction (the validator in
-- update mode needs every diff statement in one file). Backup before:
-- /var/backups/content-factory-next/postgres/20260923T154351Z-pre-textchain-planmode-product-only
--
-- Why. The owner's decision of 23.09.2026: text runs on `openai/gpt-6-luna`
-- through flex → flex → standard tier → `z-ai/glm-5.3`, and every usage row
-- says how many tokens it spent, which tier and model served it, on which
-- attempt, and what it cost. Before this change `AiUsageRecord` held no token
-- counts, and the production read of 23.09.2026 could not answer «what does
-- one draft cost».
--
-- Nine columns, all nullable, no defaults, no indexes. No table is rewritten
-- and no downtime window is needed.
--
--   1. `InstanceAiDefaults.textFlexEnabled` (Boolean) and
--      `InstanceAiDefaults.textFallbackModel` (Text) — the superadmin's two
--      chain settings. NULL reads as the defaults: flex on, fallback
--      `z-ai/glm-5.3` (`libraries/nestjs-libraries/src/openai/ai.text-chain.ts`).
--
--   2. `AiUsageRecord.promptTokens`, `completionTokens`, `reasoningTokens`,
--      `cachedTokens` (Int), `serviceTier` (Text), `attempt` (Int),
--      `costUsd` (Decimal(14,8)) — what the provider reported for the
--      operation. NULL on every row written before the columns existed, and on
--      any row whose operation made no call.
--
-- Existing rows: every column is NULL, and NULL reads as «not recorded». No
-- data step. No reverse step either: the old image ignores extra nullable
-- columns.
--
-- No indexes on purpose: the columns are read together with their row, per
-- organisation and period, and that read is served by the existing
-- `AiUsageRecord_organizationId_usageMode_createdAt_idx`.
--
-- Apply order:
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script
--   2. scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --allow-table InstanceAiDefaults --allow-table AiUsageRecord
--        --diff <step 1> --selected this_file
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. The second migrate diff must be empty.
--
-- Apply BEFORE switching to this wave's image. The new code reads the two
-- instance columns on every AI config resolution and writes the usage columns
-- at the end of every AI operation, so without them every AI operation fails,
-- not one rare screen.
--
-- Do not run twice: ADD COLUMN without IF NOT EXISTS fails on an existing
-- column.

-- AlterTable
ALTER TABLE "InstanceAiDefaults" ADD COLUMN     "textFallbackModel" TEXT,
ADD COLUMN     "textFlexEnabled" BOOLEAN;

-- AlterTable
ALTER TABLE "AiUsageRecord" ADD COLUMN     "attempt" INTEGER,
ADD COLUMN     "cachedTokens" INTEGER,
ADD COLUMN     "completionTokens" INTEGER,
ADD COLUMN     "costUsd" DECIMAL(14,8),
ADD COLUMN     "promptTokens" INTEGER,
ADD COLUMN     "reasoningTokens" INTEGER,
ADD COLUMN     "serviceTier" TEXT;
