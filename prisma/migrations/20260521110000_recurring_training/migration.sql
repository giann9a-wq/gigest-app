ALTER TABLE "Training" ADD COLUMN "isRecurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Training" ADD COLUMN "recurrenceMonths" INTEGER;
