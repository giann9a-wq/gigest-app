-- CreateEnum
CREATE TYPE "DashboardTaskStatus" AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "DashboardTask" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "DashboardTaskStatus" NOT NULL DEFAULT 'TODO',
    "dueDate" DATE,
    "ownerId" TEXT NOT NULL,
    "assigneeId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardTask_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardTask_ownerId_status_dueDate_idx" ON "DashboardTask"("ownerId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "DashboardTask_assigneeId_status_dueDate_idx" ON "DashboardTask"("assigneeId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "DashboardTask_createdAt_idx" ON "DashboardTask"("createdAt");

-- AddForeignKey
ALTER TABLE "DashboardTask" ADD CONSTRAINT "DashboardTask_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardTask" ADD CONSTRAINT "DashboardTask_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardTask" ADD CONSTRAINT "DashboardTask_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
