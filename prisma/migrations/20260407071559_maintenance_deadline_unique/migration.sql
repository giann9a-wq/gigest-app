/*
  Warnings:

  - A unique constraint covering the columns `[maintenanceId]` on the table `Deadline` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "Deadline" DROP CONSTRAINT "Deadline_maintenanceId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "Deadline_maintenanceId_key" ON "Deadline"("maintenanceId");

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_maintenanceId_fkey" FOREIGN KEY ("maintenanceId") REFERENCES "Maintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
