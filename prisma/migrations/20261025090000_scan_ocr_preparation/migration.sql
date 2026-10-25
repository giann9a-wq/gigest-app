ALTER TABLE "ScannedDeliveryNote"
  ADD COLUMN "ocrStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "ocrData" JSONB,
  ADD COLUMN "ocrAttemptedAt" TIMESTAMP(3),
  ADD COLUMN "ocrError" TEXT;

UPDATE "ScannedDeliveryNote" SET "ocrStatus" = 'STOPPED' WHERE "status" <> 'NEW';

CREATE INDEX "ScannedDeliveryNote_status_ocrStatus_receivedAt_idx"
  ON "ScannedDeliveryNote"("status", "ocrStatus", "receivedAt");
