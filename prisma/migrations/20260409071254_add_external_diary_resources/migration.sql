-- CreateTable
CREATE TABLE "ExternalResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalDiaryActivity" (
    "id" TEXT NOT NULL,
    "referenceDate" TIMESTAMP(3) NOT NULL,
    "externalResourceId" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "days" DECIMAL(4,1) NOT NULL,
    "activityDescription" TEXT,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalDiaryActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalResource_name_key" ON "ExternalResource"("name");

-- CreateIndex
CREATE INDEX "ExternalDiaryActivity_referenceDate_idx" ON "ExternalDiaryActivity"("referenceDate");

-- CreateIndex
CREATE INDEX "ExternalDiaryActivity_jobOrderId_idx" ON "ExternalDiaryActivity"("jobOrderId");

-- CreateIndex
CREATE INDEX "ExternalDiaryActivity_externalResourceId_idx" ON "ExternalDiaryActivity"("externalResourceId");

-- AddForeignKey
ALTER TABLE "ExternalDiaryActivity" ADD CONSTRAINT "ExternalDiaryActivity_externalResourceId_fkey" FOREIGN KEY ("externalResourceId") REFERENCES "ExternalResource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDiaryActivity" ADD CONSTRAINT "ExternalDiaryActivity_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDiaryActivity" ADD CONSTRAINT "ExternalDiaryActivity_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalDiaryActivity" ADD CONSTRAINT "ExternalDiaryActivity_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
