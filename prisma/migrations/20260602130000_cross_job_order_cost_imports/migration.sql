-- Allow a single cost import session to contain rows assigned to different
-- job orders. The job order is selected on each row during validation.

ALTER TABLE "CostImportSession"
DROP CONSTRAINT "CostImportSession_jobOrderId_fkey";

ALTER TABLE "CostImportRowStaging"
DROP CONSTRAINT "CostImportRowStaging_jobOrderId_fkey";

ALTER TABLE "CostImportSession"
ALTER COLUMN "jobOrderId" DROP NOT NULL;

ALTER TABLE "CostImportRowStaging"
ALTER COLUMN "jobOrderId" DROP NOT NULL;

ALTER TABLE "CostImportSession"
ADD CONSTRAINT "CostImportSession_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CostImportRowStaging"
ADD CONSTRAINT "CostImportRowStaging_jobOrderId_fkey"
FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
