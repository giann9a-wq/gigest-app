CREATE TYPE "CostImportSourceType" AS ENUM ('PARTITARIO_XLS');
CREATE TYPE "CostImportSessionStatus" AS ENUM ('PARSED', 'VALIDATED', 'APPLIED', 'FAILED');
CREATE TYPE "CostImportMatchStatus" AS ENUM ('NEW', 'ALREADY_IMPORTED', 'POSSIBLE_DUPLICATE', 'INVALID');
CREATE TYPE "CostImportValidationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "CostActualCategory" AS ENUM (
  'MATERIE_PRIME',
  'PRESTAZIONI_PROFESSIONALI',
  'PRESTAZIONI_TERZI',
  'SPESE_VARIE'
);

CREATE TABLE "CostImportSession" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "sourceType" "CostImportSourceType" NOT NULL,
  "uploadedById" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "CostImportSessionStatus" NOT NULL DEFAULT 'PARSED',
  "parseSummary" JSONB,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CostImportSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostImportRowStaging" (
  "id" TEXT NOT NULL,
  "importSessionId" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "rowIndex" INTEGER NOT NULL,
  "rawData" JSONB NOT NULL,
  "sourceAccountCode" TEXT,
  "sourceAccountDescription" TEXT,
  "supplierCode" TEXT,
  "supplierName" TEXT,
  "documentDate" TIMESTAMP(3),
  "registrationDate" TIMESTAMP(3),
  "documentNumber" TEXT,
  "descriptionOriginal" TEXT,
  "descriptionNormalized" TEXT,
  "amount" DECIMAL(12,2),
  "quantity" DECIMAL(12,2),
  "suggestedCategory" "CostActualCategory",
  "fingerprint" TEXT,
  "fingerprintSource" TEXT,
  "matchStatus" "CostImportMatchStatus" NOT NULL DEFAULT 'NEW',
  "validationStatus" "CostImportValidationStatus" NOT NULL DEFAULT 'PENDING',
  "validationNote" TEXT,
  "finalCategory" "CostActualCategory",
  "finalDescription" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CostImportRowStaging_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CostActualEntry" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "category" "CostActualCategory" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "sourceAccountCode" TEXT,
  "sourceAccountDescription" TEXT,
  "supplierCode" TEXT,
  "supplierName" TEXT,
  "documentDate" TIMESTAMP(3),
  "documentNumber" TEXT,
  "descriptionOriginal" TEXT,
  "descriptionCustom" TEXT,
  "fingerprint" TEXT NOT NULL,
  "sourceImportSessionId" TEXT,
  "sourceImportRowId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CostActualEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CostImportSession_jobOrderId_uploadedAt_idx" ON "CostImportSession"("jobOrderId", "uploadedAt");
CREATE INDEX "CostImportSession_status_uploadedAt_idx" ON "CostImportSession"("status", "uploadedAt");
CREATE INDEX "CostImportRowStaging_importSessionId_validationStatus_idx" ON "CostImportRowStaging"("importSessionId", "validationStatus");
CREATE INDEX "CostImportRowStaging_jobOrderId_fingerprint_idx" ON "CostImportRowStaging"("jobOrderId", "fingerprint");
CREATE INDEX "CostImportRowStaging_jobOrderId_matchStatus_idx" ON "CostImportRowStaging"("jobOrderId", "matchStatus");
CREATE INDEX "CostActualEntry_jobOrderId_category_idx" ON "CostActualEntry"("jobOrderId", "category");

CREATE UNIQUE INDEX "CostActualEntry_jobOrderId_fingerprint_key" ON "CostActualEntry"("jobOrderId", "fingerprint");

ALTER TABLE "CostImportSession"
ADD CONSTRAINT "CostImportSession_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CostImportSession"
ADD CONSTRAINT "CostImportSession_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CostImportRowStaging"
ADD CONSTRAINT "CostImportRowStaging_importSessionId_fkey"
FOREIGN KEY ("importSessionId") REFERENCES "CostImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CostImportRowStaging"
ADD CONSTRAINT "CostImportRowStaging_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CostActualEntry"
ADD CONSTRAINT "CostActualEntry_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CostActualEntry"
ADD CONSTRAINT "CostActualEntry_sourceImportSessionId_fkey"
FOREIGN KEY ("sourceImportSessionId") REFERENCES "CostImportSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CostActualEntry"
ADD CONSTRAINT "CostActualEntry_sourceImportRowId_fkey"
FOREIGN KEY ("sourceImportRowId") REFERENCES "CostImportRowStaging"("id") ON DELETE SET NULL ON UPDATE CASCADE;
