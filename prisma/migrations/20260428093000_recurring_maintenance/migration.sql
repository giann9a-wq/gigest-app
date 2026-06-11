ALTER TABLE "Maintenance" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Maintenance" ADD COLUMN "recurrenceMonths" INTEGER;
