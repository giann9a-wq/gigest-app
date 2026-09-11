CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SAVED');
CREATE TYPE "QuoteLineSourceType" AS ENUM ('PERSON_ROLE', 'EQUIPMENT', 'PRICE_LIST', 'FREE');
CREATE TYPE "OpportunityStatus" AS ENUM ('OPEN', 'CLOSED', 'SUSPENDED', 'APPROVED');
CREATE TYPE "PriceListVersionStatus" AS ENUM ('IMPORTING', 'ACTIVE', 'ARCHIVED', 'FAILED');

ALTER TABLE "JobOrder"
ADD COLUMN "customerName" TEXT,
ADD COLUMN "customerContact" TEXT,
ADD COLUMN "siteAddress" TEXT;

CREATE TABLE "PriceListVersion" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sourceLabel" TEXT,
  "status" "PriceListVersionStatus" NOT NULL DEFAULT 'IMPORTING',
  "itemCount" INTEGER NOT NULL DEFAULT 0,
  "importedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PriceListVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PriceListItem" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "unit" TEXT,
  "price" DECIMAL(14,4) NOT NULL,
  "sourceFile" TEXT NOT NULL,
  "category" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Quote" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "customerContact" TEXT,
  "siteAddress" TEXT,
  "description" TEXT,
  "plannedStartDate" TIMESTAMP(3),
  "plannedEndDate" TIMESTAMP(3),
  "isOwnAccountSite" BOOLEAN NOT NULL DEFAULT false,
  "generalDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
  "savedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteChapter" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "parentId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "QuoteChapter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteLine" (
  "id" TEXT NOT NULL,
  "chapterId" TEXT NOT NULL,
  "sourceType" "QuoteLineSourceType" NOT NULL,
  "sourceReference" TEXT,
  "priceListItemId" TEXT,
  "code" TEXT,
  "description" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuoteLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Opportunity" (
  "id" TEXT NOT NULL,
  "quoteId" TEXT NOT NULL,
  "status" "OpportunityStatus" NOT NULL DEFAULT 'OPEN',
  "jobOrderId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceListVersion_status_importedAt_idx" ON "PriceListVersion"("status", "importedAt");
CREATE UNIQUE INDEX "PriceListItem_versionId_code_sourceFile_key" ON "PriceListItem"("versionId", "code", "sourceFile");
CREATE INDEX "PriceListItem_versionId_code_idx" ON "PriceListItem"("versionId", "code");
CREATE INDEX "PriceListItem_versionId_category_idx" ON "PriceListItem"("versionId", "category");
CREATE UNIQUE INDEX "Quote_number_key" ON "Quote"("number");
CREATE INDEX "Quote_status_updatedAt_idx" ON "Quote"("status", "updatedAt");
CREATE INDEX "Quote_customerName_idx" ON "Quote"("customerName");
CREATE INDEX "QuoteChapter_quoteId_sortOrder_idx" ON "QuoteChapter"("quoteId", "sortOrder");
CREATE INDEX "QuoteChapter_parentId_sortOrder_idx" ON "QuoteChapter"("parentId", "sortOrder");
CREATE INDEX "QuoteLine_chapterId_sortOrder_idx" ON "QuoteLine"("chapterId", "sortOrder");
CREATE INDEX "QuoteLine_priceListItemId_idx" ON "QuoteLine"("priceListItemId");
CREATE UNIQUE INDEX "Opportunity_quoteId_key" ON "Opportunity"("quoteId");
CREATE INDEX "Opportunity_status_updatedAt_idx" ON "Opportunity"("status", "updatedAt");
CREATE INDEX "Opportunity_jobOrderId_idx" ON "Opportunity"("jobOrderId");

ALTER TABLE "PriceListItem" ADD CONSTRAINT "PriceListItem_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "PriceListVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteChapter" ADD CONSTRAINT "QuoteChapter_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteChapter" ADD CONSTRAINT "QuoteChapter_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "QuoteChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "QuoteChapter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "QuoteLine" ADD CONSTRAINT "QuoteLine_priceListItemId_fkey" FOREIGN KEY ("priceListItemId") REFERENCES "PriceListItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
