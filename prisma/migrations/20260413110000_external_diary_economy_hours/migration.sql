-- CreateEnum
CREATE TYPE "ExternalDiaryActivityType" AS ENUM ('SUBCONTRACT', 'ECONOMY');

-- AlterTable
ALTER TABLE "ExternalDiaryActivity"
ADD COLUMN "activityType" "ExternalDiaryActivityType" NOT NULL DEFAULT 'SUBCONTRACT',
ADD COLUMN "hours" DECIMAL(4,1);

-- CreateIndex
CREATE INDEX "ExternalDiaryActivity_activityType_idx" ON "ExternalDiaryActivity"("activityType");
