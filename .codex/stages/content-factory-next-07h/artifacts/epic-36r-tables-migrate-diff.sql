-- AlterTable
ALTER TABLE "ContentSource" ADD COLUMN     "usagePurpose" TEXT NOT NULL DEFAULT 'EVIDENCE';

-- CreateTable
CREATE TABLE "ContentPiece" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "tags" JSONB,
    "brandProfileVersionId" TEXT,
    "contentContextSnapshotId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPiece_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentDerivation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentPieceId" TEXT NOT NULL,
    "postId" TEXT,
    "integrationId" TEXT,
    "platform" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "brandProfileVersionId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDerivation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandVoiceSample" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "usagePurpose" TEXT NOT NULL DEFAULT 'OWN_VOICE',
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "charCount" INTEGER NOT NULL,
    "wordCount" INTEGER NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "rightsState" TEXT NOT NULL DEFAULT 'OWN_CONTENT',
    "retentionUntil" TIMESTAMP(3),
    "sourceId" TEXT,
    "postId" TEXT,
    "externalRef" TEXT,
    "redactions" JSONB,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandVoiceSample_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentPiece_organizationId_archivedAt_idx" ON "ContentPiece"("organizationId", "archivedAt");

-- CreateIndex
CREATE INDEX "ContentPiece_organizationId_brandProfileVersionId_idx" ON "ContentPiece"("organizationId", "brandProfileVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentPiece_organizationId_id_key" ON "ContentPiece"("organizationId", "id");

-- CreateIndex
CREATE INDEX "ContentDerivation_organizationId_contentPieceId_idx" ON "ContentDerivation"("organizationId", "contentPieceId");

-- CreateIndex
CREATE INDEX "ContentDerivation_organizationId_platform_state_idx" ON "ContentDerivation"("organizationId", "platform", "state");

-- CreateIndex
CREATE UNIQUE INDEX "ContentDerivation_organizationId_id_key" ON "ContentDerivation"("organizationId", "id");

-- CreateIndex
CREATE INDEX "BrandVoiceSample_organizationId_usagePurpose_deletedAt_idx" ON "BrandVoiceSample"("organizationId", "usagePurpose", "deletedAt");

-- CreateIndex
CREATE INDEX "BrandVoiceSample_organizationId_origin_idx" ON "BrandVoiceSample"("organizationId", "origin");

-- CreateIndex
CREATE INDEX "BrandVoiceSample_organizationId_retentionUntil_idx" ON "BrandVoiceSample"("organizationId", "retentionUntil");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVoiceSample_organizationId_id_key" ON "BrandVoiceSample"("organizationId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVoiceSample_organizationId_contentHash_key" ON "BrandVoiceSample"("organizationId", "contentHash");

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_organizationId_brandProfileVersionId_fkey" FOREIGN KEY ("organizationId", "brandProfileVersionId") REFERENCES "ProjectBrandProfileVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentPiece" ADD CONSTRAINT "ContentPiece_organizationId_contentContextSnapshotId_fkey" FOREIGN KEY ("organizationId", "contentContextSnapshotId") REFERENCES "ContentContextSnapshot"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDerivation" ADD CONSTRAINT "ContentDerivation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDerivation" ADD CONSTRAINT "ContentDerivation_organizationId_contentPieceId_fkey" FOREIGN KEY ("organizationId", "contentPieceId") REFERENCES "ContentPiece"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDerivation" ADD CONSTRAINT "ContentDerivation_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "Post"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentDerivation" ADD CONSTRAINT "ContentDerivation_organizationId_brandProfileVersionId_fkey" FOREIGN KEY ("organizationId", "brandProfileVersionId") REFERENCES "ProjectBrandProfileVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVoiceSample" ADD CONSTRAINT "BrandVoiceSample_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVoiceSample" ADD CONSTRAINT "BrandVoiceSample_organizationId_sourceId_fkey" FOREIGN KEY ("organizationId", "sourceId") REFERENCES "ContentSource"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVoiceSample" ADD CONSTRAINT "BrandVoiceSample_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "Post"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
