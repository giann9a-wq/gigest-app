-- CreateEnum
CREATE TYPE "ScannedDeliveryNoteStatus" AS ENUM ('NEW', 'INSERTED', 'ERROR');

-- CreateTable
CREATE TABLE "ScannedDeliveryNote" (
    "id" TEXT NOT NULL,
    "gmailMessageId" TEXT NOT NULL,
    "gmailAttachmentId" TEXT NOT NULL,
    "gmailInternalDate" TIMESTAMP(3),
    "fromEmail" TEXT NOT NULL,
    "subject" TEXT,
    "fileName" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "status" "ScannedDeliveryNoteStatus" NOT NULL DEFAULT 'NEW',
    "errorMessage" TEXT,
    "deliveryNoteId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "insertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScannedDeliveryNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ScannedDeliveryNote_driveFileId_key" ON "ScannedDeliveryNote"("driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "ScannedDeliveryNote_deliveryNoteId_key" ON "ScannedDeliveryNote"("deliveryNoteId");

-- CreateIndex
CREATE UNIQUE INDEX "ScannedDeliveryNote_gmailMessageId_gmailAttachmentId_key" ON "ScannedDeliveryNote"("gmailMessageId", "gmailAttachmentId");

-- CreateIndex
CREATE INDEX "ScannedDeliveryNote_status_receivedAt_idx" ON "ScannedDeliveryNote"("status", "receivedAt");

-- CreateIndex
CREATE INDEX "ScannedDeliveryNote_fromEmail_idx" ON "ScannedDeliveryNote"("fromEmail");

-- AddForeignKey
ALTER TABLE "ScannedDeliveryNote" ADD CONSTRAINT "ScannedDeliveryNote_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryNoteUsage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
