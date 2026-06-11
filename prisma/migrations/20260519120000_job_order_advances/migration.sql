-- CreateTable
CREATE TABLE "JobOrderAdvance" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "advanceDate" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "disabledReason" TEXT,
    "disabledAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOrderAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobOrderAdvance_jobOrderId_isActive_idx" ON "JobOrderAdvance"("jobOrderId", "isActive");

-- CreateIndex
CREATE INDEX "JobOrderAdvance_advanceDate_idx" ON "JobOrderAdvance"("advanceDate");

-- AddForeignKey
ALTER TABLE "JobOrderAdvance" ADD CONSTRAINT "JobOrderAdvance_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderAdvance" ADD CONSTRAINT "JobOrderAdvance_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderAdvance" ADD CONSTRAINT "JobOrderAdvance_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
