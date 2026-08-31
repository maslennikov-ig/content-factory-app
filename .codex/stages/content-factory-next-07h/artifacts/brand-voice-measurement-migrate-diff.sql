-- CreateTable
CREATE TABLE "BrandVoiceMeasurement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "profileVersionId" TEXT,
    "analyzerVersion" TEXT NOT NULL,
    "localePackVersion" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'ru',
    "sampleCount" INTEGER NOT NULL,
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "sentenceCount" INTEGER NOT NULL DEFAULT 0,
    "metrics" JSONB NOT NULL,
    "lexicon" JSONB,
    "punctuation" JSONB,
    "corpusSplit" JSONB,
    "holdoutResult" JSONB,
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandVoiceMeasurement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandVoiceMeasurement_organizationId_profileVersionId_idx" ON "BrandVoiceMeasurement"("organizationId", "profileVersionId");

-- CreateIndex
CREATE INDEX "BrandVoiceMeasurement_organizationId_stale_idx" ON "BrandVoiceMeasurement"("organizationId", "stale");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVoiceMeasurement_organizationId_id_key" ON "BrandVoiceMeasurement"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "BrandVoiceMeasurement" ADD CONSTRAINT "BrandVoiceMeasurement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVoiceMeasurement" ADD CONSTRAINT "BrandVoiceMeasurement_organizationId_profileVersionId_fkey" FOREIGN KEY ("organizationId", "profileVersionId") REFERENCES "ProjectBrandProfileVersion"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

