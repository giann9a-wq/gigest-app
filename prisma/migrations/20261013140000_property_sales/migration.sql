-- AlterEnum
ALTER TYPE "DeadlineOrigin" ADD VALUE 'SALE_INSTALLMENT';

-- AlterTable
ALTER TABLE "JobOrder" ADD COLUMN     "salesPriceListEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SalesUnit" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "listPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertySale" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "agreedPrice" DECIMAL(12,2) NOT NULL,
    "saleDate" DATE NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PropertySale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesInstallment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "deadlineId" TEXT NOT NULL,
    "advanceId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesInstallment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesUnit_jobOrderId_code_key" ON "SalesUnit"("jobOrderId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PropertySale_unitId_key" ON "PropertySale"("unitId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInstallment_deadlineId_key" ON "SalesInstallment"("deadlineId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesInstallment_advanceId_key" ON "SalesInstallment"("advanceId");

-- CreateIndex
CREATE INDEX "SalesInstallment_advanceId_dueDate_idx" ON "SalesInstallment"("advanceId", "dueDate");

-- CreateIndex
CREATE INDEX "SalesInstallment_saleId_idx" ON "SalesInstallment"("saleId");

-- AddForeignKey
ALTER TABLE "SalesUnit" ADD CONSTRAINT "SalesUnit_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertySale" ADD CONSTRAINT "PropertySale_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SalesUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInstallment" ADD CONSTRAINT "SalesInstallment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "PropertySale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInstallment" ADD CONSTRAINT "SalesInstallment_deadlineId_fkey" FOREIGN KEY ("deadlineId") REFERENCES "Deadline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesInstallment" ADD CONSTRAINT "SalesInstallment_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "JobOrderAdvance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
