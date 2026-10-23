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
