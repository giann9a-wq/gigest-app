ALTER TABLE "CostImportSession"
ADD COLUMN "fileHash" TEXT,
ADD COLUMN "fileSizeBytes" INTEGER,
ADD COLUMN "storagePath" TEXT;

CREATE INDEX "CostImportSession_fileHash_idx" ON "CostImportSession"("fileHash");
