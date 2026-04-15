-- CreateTable
CREATE TABLE "DeliveryNoteUsage" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "usageDate" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryNoteUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryNoteUsage_jobOrderId_usageDate_idx" ON "DeliveryNoteUsage"("jobOrderId", "usageDate");

-- CreateIndex
CREATE INDEX "DeliveryNoteUsage_supplier_idx" ON "DeliveryNoteUsage"("supplier");

-- CreateIndex
CREATE INDEX "DeliveryNoteUsage_description_idx" ON "DeliveryNoteUsage"("description");

-- AddForeignKey
ALTER TABLE "DeliveryNoteUsage" ADD CONSTRAINT "DeliveryNoteUsage_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteUsage" ADD CONSTRAINT "DeliveryNoteUsage_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteUsage" ADD CONSTRAINT "DeliveryNoteUsage_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
