ALTER TABLE "CalendarIntegration"
ADD COLUMN "connectedEmail" TEXT,
ADD COLUMN "refreshToken" TEXT,
ADD COLUMN "accessToken" TEXT,
ADD COLUMN "accessTokenExpiresAt" TIMESTAMP(3),
ADD COLUMN "connectedByUserId" TEXT,
ADD COLUMN "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN "syncError" TEXT;

CREATE UNIQUE INDEX "CalendarIntegration_provider_key" ON "CalendarIntegration"("provider");

ALTER TABLE "CalendarIntegration"
ADD CONSTRAINT "CalendarIntegration_connectedByUserId_fkey"
FOREIGN KEY ("connectedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
