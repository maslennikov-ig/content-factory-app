-- CreateTable
CREATE TABLE "VideoSubscriptionConnection" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "walletDigest" TEXT NOT NULL,
    "generation" INTEGER NOT NULL DEFAULT 1,
    "state" TEXT NOT NULL DEFAULT 'connected',
    "encryptedTokens" TEXT,
    "expiresAt" TIMESTAMP(3),
    "tokenVersion" INTEGER NOT NULL DEFAULT 1,
    "refreshOwner" TEXT,
    "refreshUntil" TIMESTAMP(3),
    "unit" TEXT NOT NULL,
    "perJob" DECIMAL(20,6),
    "perMonth" DECIMAL(20,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoSubscriptionConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSubscriptionGrant" (
    "id" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "VideoSubscriptionGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSubscriptionWorkspacePolicy" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "VideoSubscriptionWorkspacePolicy_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "VideoSubscriptionOAuthAttempt" (
    "id" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "sessionDigest" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "returnPath" TEXT NOT NULL,
    "encryptedVerifier" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "VideoSubscriptionOAuthAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSubscriptionRegistration" (
    "id" TEXT NOT NULL,
    "issuer" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "encryptedClient" TEXT,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),

    CONSTRAINT "VideoSubscriptionRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoSubscriptionConnection_ownerId_provider_idx" ON "VideoSubscriptionConnection"("ownerId", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSubscriptionConnection_provider_walletDigest_key" ON "VideoSubscriptionConnection"("provider", "walletDigest");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSubscriptionGrant_connectionId_organizationId_key" ON "VideoSubscriptionGrant"("connectionId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "VideoSubscriptionOAuthAttempt_stateHash_key" ON "VideoSubscriptionOAuthAttempt"("stateHash");

-- CreateIndex
CREATE INDEX "VideoSubscriptionOAuthAttempt_expiresAt_idx" ON "VideoSubscriptionOAuthAttempt"("expiresAt");

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
