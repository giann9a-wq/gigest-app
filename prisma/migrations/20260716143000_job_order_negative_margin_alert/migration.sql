ALTER TABLE "JobOrder"
ADD COLUMN "isOwnAccountSite" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "negativeMarginAlertSnoozedUntil" TIMESTAMP(3);
