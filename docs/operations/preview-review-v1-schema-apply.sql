-- Additive preview discussions and scoped guest grants; legacy Comments are unchanged.
-- Integration.displayName is the optional channel alias adopted in the same wave.
-- Apply with the guarded Prisma procedure in production-deploy.md and psql
-- --single-transaction. This file does not authorize applying it to a live database.
-- Guard allow-list: Integration PreviewReviewGrantV1 PreviewReviewThreadV1 PreviewReviewCommentV1.

-- AlterTable
ALTER TABLE "Integration" ADD COLUMN     "displayName" TEXT;

-- CreateTable
CREATE TABLE "PreviewReviewGrantV1" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "PreviewReviewGrantV1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewReviewThreadV1" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "anchorPostId" TEXT,
    "anchorQuote" VARCHAR(2000),
    "anchorStart" INTEGER,
    "anchorEnd" INTEGER,
    "anchorRevision" VARCHAR(64),
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreviewReviewThreadV1_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewReviewCommentV1" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "content" VARCHAR(4000) NOT NULL,
    "authorUserId" TEXT,
    "guestGrantId" TEXT,
    "guestName" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewReviewCommentV1_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreviewReviewGrantV1_tokenHash_key" ON "PreviewReviewGrantV1"("tokenHash");

-- CreateIndex
CREATE INDEX "PreviewReviewGrantV1_organizationId_postId_createdAt_idx" ON "PreviewReviewGrantV1"("organizationId", "postId", "createdAt");

-- CreateIndex
CREATE INDEX "PreviewReviewGrantV1_createdByUserId_idx" ON "PreviewReviewGrantV1"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewReviewGrantV1_organizationId_postId_id_key" ON "PreviewReviewGrantV1"("organizationId", "postId", "id");

-- CreateIndex
CREATE INDEX "PreviewReviewThreadV1_organizationId_postId_createdAt_idx" ON "PreviewReviewThreadV1"("organizationId", "postId", "createdAt");

-- CreateIndex
CREATE INDEX "PreviewReviewThreadV1_resolvedByUserId_idx" ON "PreviewReviewThreadV1"("resolvedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PreviewReviewThreadV1_organizationId_postId_id_key" ON "PreviewReviewThreadV1"("organizationId", "postId", "id");

-- CreateIndex
CREATE INDEX "PreviewReviewCommentV1_organizationId_postId_threadId_creat_idx" ON "PreviewReviewCommentV1"("organizationId", "postId", "threadId", "createdAt");

-- CreateIndex
CREATE INDEX "PreviewReviewCommentV1_authorUserId_idx" ON "PreviewReviewCommentV1"("authorUserId");

-- CreateIndex
CREATE INDEX "PreviewReviewCommentV1_organizationId_postId_guestGrantId_idx" ON "PreviewReviewCommentV1"("organizationId", "postId", "guestGrantId");

-- AddForeignKey
ALTER TABLE "PreviewReviewGrantV1" ADD CONSTRAINT "PreviewReviewGrantV1_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewGrantV1" ADD CONSTRAINT "PreviewReviewGrantV1_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "Post"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewGrantV1" ADD CONSTRAINT "PreviewReviewGrantV1_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewThreadV1" ADD CONSTRAINT "PreviewReviewThreadV1_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewThreadV1" ADD CONSTRAINT "PreviewReviewThreadV1_organizationId_postId_fkey" FOREIGN KEY ("organizationId", "postId") REFERENCES "Post"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewThreadV1" ADD CONSTRAINT "PreviewReviewThreadV1_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewCommentV1" ADD CONSTRAINT "PreviewReviewCommentV1_organizationId_postId_threadId_fkey" FOREIGN KEY ("organizationId", "postId", "threadId") REFERENCES "PreviewReviewThreadV1"("organizationId", "postId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewCommentV1" ADD CONSTRAINT "PreviewReviewCommentV1_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewReviewCommentV1" ADD CONSTRAINT "PreviewReviewCommentV1_organizationId_postId_guestGrantId_fkey" FOREIGN KEY ("organizationId", "postId", "guestGrantId") REFERENCES "PreviewReviewGrantV1"("organizationId", "postId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
