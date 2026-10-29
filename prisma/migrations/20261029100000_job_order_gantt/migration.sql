-- CreateTable
CREATE TABLE "JobOrderSchedule" (
    "jobOrderId" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOrderSchedule_pkey" PRIMARY KEY ("jobOrderId")
);

-- AddForeignKey
ALTER TABLE "JobOrderSchedule" ADD CONSTRAINT "JobOrderSchedule_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
