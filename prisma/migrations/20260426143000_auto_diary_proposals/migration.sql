CREATE TYPE "AutoDiaryProposalStatus" AS ENUM ('PENDING', 'APPLIED', 'SKIPPED');

ALTER TABLE "Person"
ADD COLUMN "isPartTime" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "partTimeHours" DECIMAL(4,1),
ADD COLUMN "diaryAutoFillEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "diaryAutoFillJobOrderId" TEXT;

CREATE TABLE "AutoDiaryEntryProposal" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "referenceDate" DATE NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "hours" DECIMAL(4,1) NOT NULL,
    "status" "AutoDiaryProposalStatus" NOT NULL DEFAULT 'PENDING',
    "appliedActivityId" TEXT,
    "skippedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutoDiaryEntryProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutoDiaryEntryProposal_personId_referenceDate_key" ON "AutoDiaryEntryProposal"("personId", "referenceDate");
CREATE INDEX "AutoDiaryEntryProposal_status_referenceDate_idx" ON "AutoDiaryEntryProposal"("status", "referenceDate");
CREATE INDEX "AutoDiaryEntryProposal_jobOrderId_idx" ON "AutoDiaryEntryProposal"("jobOrderId");
CREATE INDEX "Person_diaryAutoFillEnabled_idx" ON "Person"("diaryAutoFillEnabled");
CREATE INDEX "Person_diaryAutoFillJobOrderId_idx" ON "Person"("diaryAutoFillJobOrderId");

ALTER TABLE "Person" ADD CONSTRAINT "Person_diaryAutoFillJobOrderId_fkey" FOREIGN KEY ("diaryAutoFillJobOrderId") REFERENCES "JobOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AutoDiaryEntryProposal" ADD CONSTRAINT "AutoDiaryEntryProposal_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutoDiaryEntryProposal" ADD CONSTRAINT "AutoDiaryEntryProposal_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
