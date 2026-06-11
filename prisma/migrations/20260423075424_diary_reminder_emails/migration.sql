-- CreateEnum
CREATE TYPE "DiaryReminderEmailStatus" AS ENUM ('SENT', 'ERROR');

-- DropIndex
DROP INDEX "InvoiceImportRowStaging_suggestedJobOrderId_idx";

-- AlterTable
ALTER TABLE "Person" ADD COLUMN     "diaryReminderRecipients" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "DiaryReminderEmailLog" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "runDate" DATE NOT NULL,
    "status" "DiaryReminderEmailStatus" NOT NULL DEFAULT 'SENT',
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missingDates" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiaryReminderEmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiaryReminderEmailLog_runDate_idx" ON "DiaryReminderEmailLog"("runDate");

-- CreateIndex
CREATE UNIQUE INDEX "DiaryReminderEmailLog_personId_runDate_key" ON "DiaryReminderEmailLog"("personId", "runDate");

-- AddForeignKey
ALTER TABLE "DiaryReminderEmailLog" ADD CONSTRAINT "DiaryReminderEmailLog_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;
