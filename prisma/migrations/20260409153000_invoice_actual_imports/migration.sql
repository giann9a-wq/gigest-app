CREATE TYPE "InvoiceImportSourceType" AS ENUM ('PARTITARIO_XLS');
CREATE TYPE "InvoiceImportSessionStatus" AS ENUM ('PARSED', 'VALIDATED', 'APPLIED', 'FAILED');
CREATE TYPE "InvoiceImportMatchStatus" AS ENUM ('NEW', 'ALREADY_IMPORTED', 'POSSIBLE_DUPLICATE', 'INVALID');
CREATE TYPE "InvoiceImportValidationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "InvoiceImportSession" (
  "id" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileHash" TEXT,
  "fileSizeBytes" INTEGER,
  "storagePath" TEXT,
  "sourceType" "InvoiceImportSourceType" NOT NULL,
  "uploadedById" TEXT,
  "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" "InvoiceImportSessionStatus" NOT NULL DEFAULT 'PARSED',
  "parseSummary" JSONB,
  "appliedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvoiceImportSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceImportRowStaging" (
  "id" TEXT NOT NULL,
  "importSessionId" TEXT NOT NULL,
  "rowIndexStart" INTEGER NOT NULL,
  "rowIndexEnd" INTEGER NOT NULL,
  "sourceAccountCode" TEXT,
  "sourceAccountDescription" TEXT,
  "registrationDate" TIMESTAMP(3),
  "registrationProtocol" TEXT,
  "causale" TEXT,
  "documentDate" TIMESTAMP(3),
  "invoiceNumber" TEXT,
  "customerCode" TEXT,
  "customerName" TEXT,
  "netAmount" DECIMAL(12,2),
  "vatAmount" DECIMAL(12,2),
  "grossAmount" DECIMAL(12,2),
  "extraLinesJson" JSONB,
  "rawDataJson" JSONB NOT NULL,
  "fingerprint" TEXT,
  "fingerprintSource" TEXT,
  "matchStatus" "InvoiceImportMatchStatus" NOT NULL DEFAULT 'NEW',
  "validationStatus" "InvoiceImportValidationStatus" NOT NULL DEFAULT 'PENDING',
  "jobOrderId" TEXT,
  "validationNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "InvoiceImportRowStaging_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IssuedInvoiceActual" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "sourceImportSessionId" TEXT,
  "sourceImportRowId" TEXT,
  "sourceAccountCode" TEXT,
  "sourceAccountDescription" TEXT,
  "registrationDate" TIMESTAMP(3),
  "registrationProtocol" TEXT,
  "documentDate" TIMESTAMP(3),
  "invoiceNumber" TEXT,
  "customerCode" TEXT,
  "customerName" TEXT,
  "netAmount" DECIMAL(12,2) NOT NULL,
  "vatAmount" DECIMAL(12,2),
  "grossAmount" DECIMAL(12,2),
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "IssuedInvoiceActual_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceImportSession_fileHash_idx" ON "InvoiceImportSession"("fileHash");
CREATE INDEX "InvoiceImportSession_status_uploadedAt_idx" ON "InvoiceImportSession"("status", "uploadedAt");
CREATE INDEX "InvoiceImportRowStaging_importSessionId_validationStatus_idx" ON "InvoiceImportRowStaging"("importSessionId", "validationStatus");
CREATE INDEX "InvoiceImportRowStaging_jobOrderId_matchStatus_idx" ON "InvoiceImportRowStaging"("jobOrderId", "matchStatus");
CREATE INDEX "InvoiceImportRowStaging_fingerprint_idx" ON "InvoiceImportRowStaging"("fingerprint");
CREATE INDEX "IssuedInvoiceActual_jobOrderId_documentDate_idx" ON "IssuedInvoiceActual"("jobOrderId", "documentDate");
CREATE INDEX "IssuedInvoiceActual_jobOrderId_customerName_idx" ON "IssuedInvoiceActual"("jobOrderId", "customerName");

CREATE UNIQUE INDEX "IssuedInvoiceActual_fingerprint_key" ON "IssuedInvoiceActual"("fingerprint");

ALTER TABLE "InvoiceImportSession"
ADD CONSTRAINT "InvoiceImportSession_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceImportRowStaging"
ADD CONSTRAINT "InvoiceImportRowStaging_importSessionId_fkey"
FOREIGN KEY ("importSessionId") REFERENCES "InvoiceImportSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InvoiceImportRowStaging"
ADD CONSTRAINT "InvoiceImportRowStaging_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IssuedInvoiceActual"
ADD CONSTRAINT "IssuedInvoiceActual_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IssuedInvoiceActual"
ADD CONSTRAINT "IssuedInvoiceActual_sourceImportSessionId_fkey"
FOREIGN KEY ("sourceImportSessionId") REFERENCES "InvoiceImportSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "IssuedInvoiceActual"
ADD CONSTRAINT "IssuedInvoiceActual_sourceImportRowId_fkey"
FOREIGN KEY ("sourceImportRowId") REFERENCES "InvoiceImportRowStaging"("id") ON DELETE SET NULL ON UPDATE CASCADE;
