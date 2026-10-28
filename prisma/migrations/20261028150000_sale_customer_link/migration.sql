-- AlterTable
ALTER TABLE "PropertySale" ADD COLUMN     "customerRecordId" TEXT;

-- CreateIndex
CREATE INDEX "PropertySale_customerRecordId_idx" ON "PropertySale"("customerRecordId");

-- AddForeignKey
ALTER TABLE "PropertySale" ADD CONSTRAINT "PropertySale_customerRecordId_fkey" FOREIGN KEY ("customerRecordId") REFERENCES "JobOrderRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
