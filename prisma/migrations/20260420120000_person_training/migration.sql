-- AlterEnum
ALTER TYPE "DeadlineOrigin" ADD VALUE 'TRAINING';

-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN "trainingId" TEXT;

-- CreateTable
CREATE TABLE "Training" (
    "id" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "description" TEXT,
    "trainingDate" TIMESTAMP(3) NOT NULL,
    "mandatory" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Training_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingDocument" (
    "id" TEXT NOT NULL,
    "trainingId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Training_personId_trainingDate_idx" ON "Training"("personId", "trainingDate");

-- CreateIndex
CREATE INDEX "Training_expiresAt_idx" ON "Training"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingDocument_driveFileId_key" ON "TrainingDocument"("driveFileId");

-- CreateIndex
CREATE INDEX "TrainingDocument_trainingId_idx" ON "TrainingDocument"("trainingId");

-- CreateIndex
CREATE UNIQUE INDEX "Deadline_trainingId_key" ON "Deadline"("trainingId");

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Training" ADD CONSTRAINT "Training_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDocument" ADD CONSTRAINT "TrainingDocument_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingDocument" ADD CONSTRAINT "TrainingDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_trainingId_fkey" FOREIGN KEY ("trainingId") REFERENCES "Training"("id") ON DELETE CASCADE ON UPDATE CASCADE;
