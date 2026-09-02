-- «Откуда идеи» (`content-factory-next-odb8.3`): two new tables. Applying
-- ONLY this text, dословно.
--
-- `prisma migrate diff` against the boевая database prints these statements
-- together with `DROP TABLE` on the two dozen `mastra_*` tables that are not
-- in `schema.prisma` — expected, per `runtime-roles-mastra-split-plan.md`, and
-- skipped by `scripts/operations/validate-prisma-migration-sql.cjs` (a
-- Mastra-owned target), but checked every time all the same: `db push` and the
-- full `migrate diff` output drop them silently.
--
-- Order, matching the checked precedent in `production-deploy.md`'s bootstrap
-- walkthrough (steps 6-8): the guard rejects `BEGIN`/`COMMIT` as unrecognised
-- statements — proven against `user-language-schema-apply.sql` itself, whose
-- own header describes the same two-command order below — so this file holds
-- only the statements `migrate diff` printed, and the one transaction comes
-- from psql's own flag rather than from text inside the file.
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script
--   2. scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --allow-table ContentLeadSubscription --allow-table ContentLead
--        --diff <step 1> --selected this_file
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. A repeat `migrate diff` must return only the `mastra_*` DROP TABLE.
--
-- Both new tables are empty everywhere — the feature does not exist yet
-- anywhere it is applied — so there is no data to migrate or lose.
--
-- Applied locally on cf-dev-postgres (port 5433) with this exact text on
-- 2026-09-01. Production application is a separate decision, not this task's.

-- CreateTable
CREATE TABLE "ContentLeadSubscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'ACTIVE',
    "checkIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "lastCheckedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "linkedAutoPostId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ContentLeadSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentLead" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reasonRu" TEXT NOT NULL,
    "reasonEn" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "dismissedAt" TIMESTAMP(3),
    "dismissedByUserId" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "acceptedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentLeadSubscription_organizationId_state_idx" ON "ContentLeadSubscription"("organizationId", "state");

-- CreateIndex
CREATE INDEX "ContentLeadSubscription_organizationId_deletedAt_idx" ON "ContentLeadSubscription"("organizationId", "deletedAt");

-- CreateIndex
CREATE INDEX "ContentLeadSubscription_organizationId_linkedAutoPostId_idx" ON "ContentLeadSubscription"("organizationId", "linkedAutoPostId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLeadSubscription_organizationId_id_key" ON "ContentLeadSubscription"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLeadSubscription_organizationId_kind_canonicalUrl_key" ON "ContentLeadSubscription"("organizationId", "kind", "canonicalUrl");

-- CreateIndex
CREATE INDEX "ContentLead_organizationId_status_observedAt_idx" ON "ContentLead"("organizationId", "status", "observedAt");

-- CreateIndex
CREATE INDEX "ContentLead_organizationId_subscriptionId_status_idx" ON "ContentLead"("organizationId", "subscriptionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLead_organizationId_id_key" ON "ContentLead"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ContentLead_organizationId_subscriptionId_externalId_key" ON "ContentLead"("organizationId", "subscriptionId", "externalId");

-- AddForeignKey
ALTER TABLE "ContentLeadSubscription" ADD CONSTRAINT "ContentLeadSubscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLeadSubscription" ADD CONSTRAINT "ContentLeadSubscription_organizationId_linkedAutoPostId_fkey" FOREIGN KEY ("organizationId", "linkedAutoPostId") REFERENCES "AutoPost"("organizationId", "id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "ContentLead" ADD CONSTRAINT "ContentLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentLead" ADD CONSTRAINT "ContentLead_organizationId_subscriptionId_fkey" FOREIGN KEY ("organizationId", "subscriptionId") REFERENCES "ContentLeadSubscription"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
