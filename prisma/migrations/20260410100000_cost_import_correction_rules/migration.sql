ALTER TYPE "CostImportMatchStatus" ADD VALUE 'UPDATED_DUPLICATE';

ALTER TABLE "CostImportRowStaging"
ADD COLUMN "sourceRowFingerprint" TEXT,
ADD COLUMN "sourceRowFingerprintSource" TEXT;

CREATE TABLE "CostImportCorrectionRule" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "sourceRowFingerprint" TEXT NOT NULL,
  "sourceRowFingerprintSource" TEXT,
  "sourceAccountCode" TEXT,
  "sourceAccountDescription" TEXT,
  "supplierCode" TEXT,
  "supplierName" TEXT,
  "documentDate" TIMESTAMP(3),
  "registrationDate" TIMESTAMP(3),
  "documentNumber" TEXT,
  "amount" DECIMAL(12,2),
  "finalCategory" "CostActualCategory",
  "finalDescription" TEXT,
  "finalFingerprint" TEXT,
  "finalFingerprintSource" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CostImportCorrectionRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CostImportRowStaging_jobOrderId_sourceRowFingerprint_idx" ON "CostImportRowStaging"("jobOrderId", "sourceRowFingerprint");
CREATE INDEX "CostImportCorrectionRule_jobOrderId_updatedAt_idx" ON "CostImportCorrectionRule"("jobOrderId", "updatedAt");

CREATE UNIQUE INDEX "CostImportCorrectionRule_jobOrderId_sourceRowFingerprint_key" ON "CostImportCorrectionRule"("jobOrderId", "sourceRowFingerprint");

ALTER TABLE "CostImportCorrectionRule"
ADD CONSTRAINT "CostImportCorrectionRule_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
