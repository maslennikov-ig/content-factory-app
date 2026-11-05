-- Additive social-factory storage, immutable video manifests and existing-job linkage.
-- NOT APPLIED. Generated with Prisma 6.5.0 migrate diff from baseline 607dff65d.
-- Apply before the new image through docs/operations/production-deploy.md schema procedure.
-- Recompute the actual deployed diff; validate selected SQL with --mode update
-- --allow-table SocialFactoryRecord --allow-table VideoProductionRevision --allow-table VideoGenerationJob.
-- No migrations directory or prisma migrate deploy/db push. Preserve Mastra tables.
-- Old image ignores new nullable job linkage/tables; rollback does not delete stored campaigns.
-- AlterTable
ALTER TABLE "VideoGenerationJob" ADD COLUMN     "productionRevisionId" TEXT;

-- CreateTable
CREATE TABLE "SocialFactoryRecord" (
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "sourceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "invalidatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "SocialFactoryRecord_pkey" PRIMARY KEY ("organizationId","kind","id")
);

-- CreateTable
CREATE TABLE "VideoProductionRevision" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "parentId" TEXT,
    "intentId" TEXT NOT NULL,
    "manifest" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "approval" JSONB,
    "state" TEXT NOT NULL DEFAULT 'draft',
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoProductionRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialFactoryRecord_organizationId_kind_parentId_deletedAt_idx" ON "SocialFactoryRecord"("organizationId", "kind", "parentId", "deletedAt");

-- CreateIndex
CREATE INDEX "VideoProductionRevision_organizationId_productionId_created_idx" ON "VideoProductionRevision"("organizationId", "productionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoProductionRevision_organizationId_productionId_revisio_key" ON "VideoProductionRevision"("organizationId", "productionId", "revision");

-- CreateIndex
CREATE UNIQUE INDEX "VideoProductionRevision_organizationId_intentId_key" ON "VideoProductionRevision"("organizationId", "intentId");

-- AddForeignKey
ALTER TABLE "SocialFactoryRecord" ADD CONSTRAINT "SocialFactoryRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoProductionRevision" ADD CONSTRAINT "VideoProductionRevision_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
