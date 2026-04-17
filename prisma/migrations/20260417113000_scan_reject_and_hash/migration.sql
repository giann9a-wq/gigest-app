-- AlterEnum
ALTER TYPE "ScannedDeliveryNoteStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "ScannedDeliveryNote" ADD COLUMN "fileHash" TEXT;

-- CreateIndex
CREATE INDEX "ScannedDeliveryNote_fromEmail_fileHash_idx" ON "ScannedDeliveryNote"("fromEmail", "fileHash");
