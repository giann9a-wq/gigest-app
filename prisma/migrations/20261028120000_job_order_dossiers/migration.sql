-- AlterTable
ALTER TABLE "JobOrder" ADD COLUMN     "budgetRevenueSource" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "clientDossierEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "technicalBookEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "JobOrderRecord" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "contact" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "responsible" TEXT NOT NULL DEFAULT '',
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobOrderRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrderRecordUnit" (
    "recordId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,

    CONSTRAINT "JobOrderRecordUnit_pkey" PRIMARY KEY ("recordId","unitId")
);

-- CreateTable
CREATE TABLE "JobOrderRecordRevision" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actor" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOrderRecordRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrderDocument" (
    "id" TEXT NOT NULL,
    "jobOrderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOrderDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrderDocumentRevision" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobOrderDocumentRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobOrderDocumentLink" (
    "documentId" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,

    CONSTRAINT "JobOrderDocumentLink_pkey" PRIMARY KEY ("documentId","recordId")
);

-- CreateIndex
CREATE INDEX "JobOrderRecord_jobOrderId_kind_idx" ON "JobOrderRecord"("jobOrderId", "kind");

-- CreateIndex
CREATE INDEX "JobOrderRecord_parentId_idx" ON "JobOrderRecord"("parentId");

-- CreateIndex
CREATE INDEX "JobOrderRecordRevision_recordId_createdAt_idx" ON "JobOrderRecordRevision"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "JobOrderDocument_jobOrderId_idx" ON "JobOrderDocument"("jobOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOrderDocumentRevision_driveFileId_key" ON "JobOrderDocumentRevision"("driveFileId");

-- CreateIndex
CREATE UNIQUE INDEX "JobOrderDocumentRevision_documentId_revision_key" ON "JobOrderDocumentRevision"("documentId", "revision");

-- AddForeignKey
ALTER TABLE "JobOrderRecord" ADD CONSTRAINT "JobOrderRecord_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderRecord" ADD CONSTRAINT "JobOrderRecord_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "JobOrderRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderRecordUnit" ADD CONSTRAINT "JobOrderRecordUnit_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "JobOrderRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderRecordUnit" ADD CONSTRAINT "JobOrderRecordUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "SalesUnit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderRecordRevision" ADD CONSTRAINT "JobOrderRecordRevision_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "JobOrderRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderDocument" ADD CONSTRAINT "JobOrderDocument_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderDocumentRevision" ADD CONSTRAINT "JobOrderDocumentRevision_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "JobOrderDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderDocumentLink" ADD CONSTRAINT "JobOrderDocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "JobOrderDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobOrderDocumentLink" ADD CONSTRAINT "JobOrderDocumentLink_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "JobOrderRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
