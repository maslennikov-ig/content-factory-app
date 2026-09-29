-- MCP for external assistants (`content-factory-next-kcxz.26`): two new
-- tables, `McpOAuthClient` (clients that registered themselves, RFC 7591) and
-- `McpOAuthGrant` (one person's connection in one workspace; hashes of the
-- code and tokens only). Additive: nothing existing is altered or dropped.
-- Apply ONLY this text, verbatim.
--
-- Order, the same as the other additive waves in `production-deploy.md`
-- («Применение Prisma-схемы», steps 6-8). The guard refuses `BEGIN`/`COMMIT`,
-- so the one transaction comes from psql's own flag:
--   1. prisma migrate diff --from-url <DATABASE_URL>
--        --to-schema-datamodel schema.prisma --script   (in the new image)
--   2. node scripts/operations/validate-prisma-migration-sql.cjs --mode update
--        --allow-table McpOAuthClient --allow-table McpOAuthGrant
--        --diff <step 1> --selected this_file
--   3. psql -v ON_ERROR_STOP=1 --single-transaction --file this_file
--   4. A repeat `migrate diff` must be empty.
--
-- NEVER `prisma db push` (it drops the Mastra tables where they still live).
-- Both tables start empty; the old image does not read them, so applying
-- before the image switch is safe and a rollback is the image only.
--
-- Proven locally on 2026-09-29: `migrate diff` from the schema at 5e9865103 to
-- this commit's schema printed exactly these statements, and the guard passed
-- them with the two `--allow-table` names above.

-- CreateTable
CREATE TABLE "McpOAuthClient" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "redirectUris" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpOAuthClient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "McpOAuthGrant" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeHash" TEXT,
    "codeChallenge" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeUsedAt" TIMESTAMP(3),
    "accessTokenHash" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "refreshTokenHash" TEXT,
    "refreshExpiresAt" TIMESTAMP(3),
    "rotatedRefreshHash" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "McpOAuthGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthClient_clientId_key" ON "McpOAuthClient"("clientId");

-- CreateIndex
CREATE INDEX "McpOAuthClient_createdAt_idx" ON "McpOAuthClient"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthGrant_codeHash_key" ON "McpOAuthGrant"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthGrant_accessTokenHash_key" ON "McpOAuthGrant"("accessTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthGrant_refreshTokenHash_key" ON "McpOAuthGrant"("refreshTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "McpOAuthGrant_rotatedRefreshHash_key" ON "McpOAuthGrant"("rotatedRefreshHash");

-- CreateIndex
CREATE INDEX "McpOAuthGrant_userId_revokedAt_idx" ON "McpOAuthGrant"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "McpOAuthGrant_organizationId_idx" ON "McpOAuthGrant"("organizationId");

-- CreateIndex
CREATE INDEX "McpOAuthGrant_clientId_idx" ON "McpOAuthGrant"("clientId");

-- CreateIndex
CREATE INDEX "McpOAuthGrant_createdAt_idx" ON "McpOAuthGrant"("createdAt");

-- AddForeignKey
ALTER TABLE "McpOAuthGrant" ADD CONSTRAINT "McpOAuthGrant_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "McpOAuthClient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthGrant" ADD CONSTRAINT "McpOAuthGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpOAuthGrant" ADD CONSTRAINT "McpOAuthGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
