-- CreateTable
CREATE TABLE "VideoAccessPreflight" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "draftDigest" TEXT NOT NULL,
    "access" JSONB NOT NULL,
    "snapshot" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "quote" JSONB NOT NULL,
    "connectionId" TEXT,
    "generation" INTEGER,
    "schemaDigest" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoAccessPreflight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoRouteIntent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "preflightId" TEXT NOT NULL,
    "accessDigest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoRouteIntent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSubscriptionJob" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceRevision" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "preflightId" TEXT NOT NULL,
    "intentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "walletDigest" TEXT NOT NULL,
    "generation" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "request" JSONB NOT NULL,
    "quote" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'accepted',
    "reserved" DECIMAL(20,6) NOT NULL,
    "actualCost" DECIMAL(20,6),
    "costCertainty" TEXT NOT NULL DEFAULT 'unknown',
    "reconciledBy" TEXT,
    "reconciliationEvidence" TEXT,
    "period" TEXT NOT NULL,
    "receipt" JSONB,
    "providerResult" JSONB,
    "storedFile" JSONB,
    "resultMediaId" TEXT,
    "submitAttempts" INTEGER NOT NULL DEFAULT 0,
    "pollAttempts" INTEGER NOT NULL DEFAULT 0,
    "saveAttempts" INTEGER NOT NULL DEFAULT 0,
    "runCycle" INTEGER NOT NULL DEFAULT 0,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "VideoSubscriptionJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoManualAttachment" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "pieceId" TEXT NOT NULL,
    "pieceRevision" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "draftVersion" INTEGER NOT NULL,
    "mediaId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoManualAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoAccessPreflight_organizationId_actorId_idx" ON "VideoAccessPreflight"("organizationId", "actorId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoRouteIntent_organizationId_intentId_key" ON "VideoRouteIntent"("organizationId", "intentId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSubscriptionJob_preflightId_key" ON "VideoSubscriptionJob"("preflightId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSubscriptionJob_resultMediaId_key" ON "VideoSubscriptionJob"("resultMediaId");

-- CreateIndex
CREATE INDEX "VideoSubscriptionJob_connectionId_period_idx" ON "VideoSubscriptionJob"("connectionId", "period");

-- CreateIndex
CREATE INDEX "VideoSubscriptionJob_state_updatedAt_idx" ON "VideoSubscriptionJob"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSubscriptionJob_organizationId_intentId_key" ON "VideoSubscriptionJob"("organizationId", "intentId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoManualAttachment_organizationId_draftId_draftVersion_m_key" ON "VideoManualAttachment"("organizationId", "draftId", "draftVersion", "mediaId");
