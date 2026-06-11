CREATE TYPE "DiaryActivitySource" AS ENUM ('MANUAL', 'AUTO');

ALTER TABLE "DiaryActivity"
ADD COLUMN "source" "DiaryActivitySource" NOT NULL DEFAULT 'MANUAL';

UPDATE "DiaryActivity"
SET "source" = 'AUTO'
WHERE "activityDescription" = 'Autocompilazione Diario';

CREATE INDEX "DiaryActivity_source_referenceDate_idx" ON "DiaryActivity"("source", "referenceDate");
