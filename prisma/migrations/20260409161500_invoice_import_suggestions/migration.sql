CREATE TYPE "InvoiceImportAssignmentSource" AS ENUM ('SUGGESTED', 'MANUAL');

ALTER TABLE "InvoiceImportRowStaging"
ADD COLUMN "suggestedJobOrderId" TEXT,
ADD COLUMN "suggestedJobOrderReason" TEXT,
ADD COLUMN "assignmentSource" "InvoiceImportAssignmentSource";

CREATE INDEX "InvoiceImportRowStaging_suggestedJobOrderId_idx" ON "InvoiceImportRowStaging"("suggestedJobOrderId");

ALTER TABLE "InvoiceImportRowStaging"
ADD CONSTRAINT "InvoiceImportRowStaging_suggestedJobOrderId_fkey"
FOREIGN KEY ("suggestedJobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
