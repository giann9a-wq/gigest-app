CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "AutomationEmailLog" (
    "id" TEXT NOT NULL,
    "automationKey" TEXT NOT NULL,
    "runKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT,
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationEmailLog_automationKey_runKey_key" ON "AutomationEmailLog"("automationKey", "runKey");
CREATE INDEX "AutomationEmailLog_automationKey_runKey_idx" ON "AutomationEmailLog"("automationKey", "runKey");
