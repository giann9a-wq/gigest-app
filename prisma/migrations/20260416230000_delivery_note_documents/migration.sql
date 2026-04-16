-- CreateEnum
CREATE TYPE "DeliveryNoteValidationStatus" AS ENUM ('PENDING', 'VALIDATED');

-- AlterTable
ALTER TABLE "DeliveryNoteUsage"
ADD COLUMN "validationStatus" "DeliveryNoteValidationStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "validatedAt" TIMESTAMP(3),
ADD COLUMN "validatedByUserId" TEXT;

-- CreateTable
CREATE TABLE "DeliveryNoteDocument" (
    "id" TEXT NOT NULL,
    "deliveryNoteId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryNoteDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryNoteDocument_driveFileId_key" ON "DeliveryNoteDocument"("driveFileId");

-- CreateIndex
CREATE INDEX "DeliveryNoteDocument_deliveryNoteId_idx" ON "DeliveryNoteDocument"("deliveryNoteId");

-- CreateIndex
CREATE INDEX "DeliveryNoteUsage_validationStatus_usageDate_idx" ON "DeliveryNoteUsage"("validationStatus", "usageDate");

-- AddForeignKey
ALTER TABLE "DeliveryNoteUsage" ADD CONSTRAINT "DeliveryNoteUsage_validatedByUserId_fkey" FOREIGN KEY ("validatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteDocument" ADD CONSTRAINT "DeliveryNoteDocument_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNoteUsage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryNoteDocument" ADD CONSTRAINT "DeliveryNoteDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
