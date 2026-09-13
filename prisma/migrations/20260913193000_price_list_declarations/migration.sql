ALTER TABLE "PriceListItem"
ADD COLUMN "regionalDescription" TEXT,
ADD COLUMN "detailDescription" TEXT;

ALTER TABLE "QuoteLine"
ADD COLUMN "regionalDescription" TEXT,
ADD COLUMN "detailDescription" TEXT,
ADD COLUMN "includeDetail" BOOLEAN NOT NULL DEFAULT true;
