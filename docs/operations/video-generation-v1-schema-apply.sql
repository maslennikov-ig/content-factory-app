-- AlterTable
ALTER TABLE "InstanceAiDefaults" ADD COLUMN     "videoApiKeys" JSONB,
ADD COLUMN     "videoSpendPolicy" JSONB;

-- AlterTable
ALTER TABLE "AiProviderSetting" ADD COLUMN     "videoApiKeys" JSONB,
ADD COLUMN     "videoSpendPolicy" JSONB;

-- CreateTable
CREATE TABLE "VideoPromptDraft" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceRevision" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "brief" JSONB NOT NULL,
    "settings" JSONB NOT NULL,
    "preflight" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoPromptDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoGenerationJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceRevision" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "preflightId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "payer" "AiUsageMode" NOT NULL,
    "credentialReference" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'accepted',
    "idempotencyKey" TEXT NOT NULL,
    "receipt" JSONB,
    "providerResult" JSONB,
    "estimate" JSONB NOT NULL,
    "reservedUsd" DECIMAL(14,8) NOT NULL,
    "costUsd" DECIMAL(14,8),
    "usageRecordId" TEXT,
    "resultMediaId" TEXT,
    "storedFile" JSONB,
    "errorCode" TEXT,
    "submitAttempts" INTEGER NOT NULL DEFAULT 0,
    "pollAttempts" INTEGER NOT NULL DEFAULT 0,
    "saveAttempts" INTEGER NOT NULL DEFAULT 0,
    "runCycle" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoGenerationJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoPromptDraft_organizationId_pieceId_updatedAt_idx" ON "VideoPromptDraft"("organizationId", "pieceId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoGenerationJob_idempotencyKey_key" ON "VideoGenerationJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "VideoGenerationJob_organizationId_pieceId_createdAt_idx" ON "VideoGenerationJob"("organizationId", "pieceId", "createdAt");

-- CreateIndex
CREATE INDEX "VideoGenerationJob_organizationId_provider_payer_createdAt_idx" ON "VideoGenerationJob"("organizationId", "provider", "payer", "createdAt");

-- CreateIndex
CREATE INDEX "VideoGenerationJob_state_leaseUntil_idx" ON "VideoGenerationJob"("state", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "VideoGenerationJob_organizationId_intentId_key" ON "VideoGenerationJob"("organizationId", "intentId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoGenerationJob_organizationId_preflightId_key" ON "VideoGenerationJob"("organizationId", "preflightId");

-- AddForeignKey
ALTER TABLE "VideoPromptDraft" ADD CONSTRAINT "VideoPromptDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoGenerationJob" ADD CONSTRAINT "VideoGenerationJob_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
