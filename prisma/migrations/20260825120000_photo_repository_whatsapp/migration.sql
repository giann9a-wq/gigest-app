CREATE TYPE "PhotoUploadSource" AS ENUM ('MANUAL', 'WHATSAPP');

CREATE TYPE "WhatsAppSessionStatus" AS ENUM (
  'WAITING_FOR_MEDIA',
  'WAITING_FOR_COMMESSA',
  'WAITING_FOR_PHASE',
  'WAITING_FOR_NEW_PHASE_NAME',
  'WAITING_FOR_NOTE_CHOICE',
  'WAITING_FOR_NOTE',
  'WAITING_FOR_CONFIRMATION',
  'COMPLETED',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "WhatsAppInboundEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

CREATE TYPE "PhotoAuditAction" AS ENUM (
  'UPLOAD_CREATED',
  'PHOTO_DELETED',
  'UPLOAD_DELETED',
  'SESSION_CANCELLED',
  'SESSION_EXPIRED'
);

ALTER TABLE "User"
ADD COLUMN "phone" TEXT,
ADD COLUMN "internationalPrefix" TEXT,
ADD COLUMN "whatsappPhone" TEXT,
ADD COLUMN "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "whatsappId" TEXT;

CREATE TABLE "PhotoPhase" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhotoPhase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhotoUpload" (
  "id" TEXT NOT NULL,
  "jobOrderId" TEXT NOT NULL,
  "phaseId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "note" TEXT,
  "source" "PhotoUploadSource" NOT NULL DEFAULT 'MANUAL',
  "whatsappSessionId" TEXT,
  "mediaCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PhotoUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Photo" (
  "id" TEXT NOT NULL,
  "uploadId" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "driveFileId" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "whatsappMediaId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  "deletedByUserId" TEXT,
  CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppUploadSession" (
  "id" TEXT NOT NULL,
  "activeKey" TEXT,
  "userId" TEXT NOT NULL,
  "whatsappPhone" TEXT NOT NULL,
  "status" "WhatsAppSessionStatus" NOT NULL DEFAULT 'WAITING_FOR_MEDIA',
  "media" JSONB NOT NULL,
  "jobOrderId" TEXT,
  "phaseId" TEXT,
  "note" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppUploadSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PhotoAuditEvent" (
  "id" TEXT NOT NULL,
  "action" "PhotoAuditAction" NOT NULL,
  "actorUserId" TEXT,
  "whatsappPhone" TEXT,
  "jobOrderId" TEXT,
  "phaseId" TEXT,
  "uploadId" TEXT,
  "photoId" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PhotoAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppInboundEvent" (
  "id" TEXT NOT NULL,
  "providerMessageId" TEXT NOT NULL,
  "whatsappPhone" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" "WhatsAppInboundEventStatus" NOT NULL DEFAULT 'PENDING',
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processingStartedAt" TIMESTAMP(3),
  "processedAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppInboundEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_whatsappPhone_key" ON "User"("whatsappPhone");
CREATE UNIQUE INDEX "User_whatsappId_key" ON "User"("whatsappId");
CREATE UNIQUE INDEX "PhotoPhase_jobOrderId_normalizedName_key" ON "PhotoPhase"("jobOrderId", "normalizedName");
CREATE INDEX "PhotoPhase_jobOrderId_name_idx" ON "PhotoPhase"("jobOrderId", "name");
CREATE UNIQUE INDEX "PhotoUpload_whatsappSessionId_key" ON "PhotoUpload"("whatsappSessionId");
CREATE INDEX "PhotoUpload_jobOrderId_createdAt_idx" ON "PhotoUpload"("jobOrderId", "createdAt");
CREATE INDEX "PhotoUpload_phaseId_createdAt_idx" ON "PhotoUpload"("phaseId", "createdAt");
CREATE INDEX "PhotoUpload_userId_createdAt_idx" ON "PhotoUpload"("userId", "createdAt");
CREATE INDEX "PhotoUpload_source_createdAt_idx" ON "PhotoUpload"("source", "createdAt");
CREATE UNIQUE INDEX "Photo_driveFileId_key" ON "Photo"("driveFileId");
CREATE UNIQUE INDEX "Photo_whatsappMediaId_key" ON "Photo"("whatsappMediaId");
CREATE INDEX "Photo_uploadId_createdAt_idx" ON "Photo"("uploadId", "createdAt");
CREATE INDEX "Photo_deletedAt_idx" ON "Photo"("deletedAt");
CREATE UNIQUE INDEX "WhatsAppUploadSession_activeKey_key" ON "WhatsAppUploadSession"("activeKey");
CREATE INDEX "WhatsAppUploadSession_whatsappPhone_status_lastInteractionAt_idx" ON "WhatsAppUploadSession"("whatsappPhone", "status", "lastInteractionAt");
CREATE INDEX "WhatsAppUploadSession_expiresAt_status_idx" ON "WhatsAppUploadSession"("expiresAt", "status");
CREATE INDEX "WhatsAppUploadSession_userId_createdAt_idx" ON "WhatsAppUploadSession"("userId", "createdAt");
CREATE INDEX "PhotoAuditEvent_jobOrderId_createdAt_idx" ON "PhotoAuditEvent"("jobOrderId", "createdAt");
CREATE INDEX "PhotoAuditEvent_uploadId_createdAt_idx" ON "PhotoAuditEvent"("uploadId", "createdAt");
CREATE INDEX "PhotoAuditEvent_actorUserId_createdAt_idx" ON "PhotoAuditEvent"("actorUserId", "createdAt");
CREATE UNIQUE INDEX "WhatsAppInboundEvent_providerMessageId_key" ON "WhatsAppInboundEvent"("providerMessageId");
CREATE INDEX "WhatsAppInboundEvent_status_nextAttemptAt_createdAt_idx" ON "WhatsAppInboundEvent"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "WhatsAppInboundEvent_whatsappPhone_createdAt_idx" ON "WhatsAppInboundEvent"("whatsappPhone", "createdAt");

ALTER TABLE "PhotoPhase" ADD CONSTRAINT "PhotoPhase_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotoPhase" ADD CONSTRAINT "PhotoPhase_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhotoUpload" ADD CONSTRAINT "PhotoUpload_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotoUpload" ADD CONSTRAINT "PhotoUpload_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PhotoPhase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoUpload" ADD CONSTRAINT "PhotoUpload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PhotoUpload" ADD CONSTRAINT "PhotoUpload_whatsappSessionId_fkey" FOREIGN KEY ("whatsappSessionId") REFERENCES "WhatsAppUploadSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "PhotoUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_deletedByUserId_fkey" FOREIGN KEY ("deletedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WhatsAppUploadSession" ADD CONSTRAINT "WhatsAppUploadSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppUploadSession" ADD CONSTRAINT "WhatsAppUploadSession_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WhatsAppUploadSession" ADD CONSTRAINT "WhatsAppUploadSession_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PhotoPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhotoAuditEvent" ADD CONSTRAINT "PhotoAuditEvent_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhotoAuditEvent" ADD CONSTRAINT "PhotoAuditEvent_jobOrderId_fkey" FOREIGN KEY ("jobOrderId") REFERENCES "JobOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PhotoAuditEvent" ADD CONSTRAINT "PhotoAuditEvent_phaseId_fkey" FOREIGN KEY ("phaseId") REFERENCES "PhotoPhase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhotoAuditEvent" ADD CONSTRAINT "PhotoAuditEvent_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "PhotoUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PhotoAuditEvent" ADD CONSTRAINT "PhotoAuditEvent_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
