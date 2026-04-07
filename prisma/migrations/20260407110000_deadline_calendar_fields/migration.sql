-- Add calendar-oriented fields while keeping the existing eventDate-based model.
ALTER TABLE "Deadline"
ADD COLUMN "title" TEXT,
ADD COLUMN "isAllDay" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "startTime" TEXT,
ADD COLUMN "endTime" TEXT;

UPDATE "Deadline"
SET "title" = COALESCE(NULLIF(BTRIM("description"), ''), 'Scadenza')
WHERE "title" IS NULL;

ALTER TABLE "Deadline"
ALTER COLUMN "title" SET NOT NULL,
ALTER COLUMN "description" DROP NOT NULL;

CREATE INDEX "Deadline_eventDate_startTime_idx" ON "Deadline"("eventDate", "startTime");
