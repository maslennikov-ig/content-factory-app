-- AlterTable
ALTER TABLE "ProjectBrandProfileVersion" ADD COLUMN     "measurementId" TEXT;

-- CreateIndex
CREATE INDEX "ProjectBrandProfileVersion_organizationId_measurementId_idx" ON "ProjectBrandProfileVersion"("organizationId", "measurementId");

-- AddForeignKey
ALTER TABLE "ProjectBrandProfileVersion" ADD CONSTRAINT "ProjectBrandProfileVersion_organizationId_measurementId_fkey" FOREIGN KEY ("organizationId", "measurementId") REFERENCES "BrandVoiceMeasurement"("organizationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

