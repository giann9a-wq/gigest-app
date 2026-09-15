CREATE TYPE "ResourcePriceListKind" AS ENUM ('PERSON_ROLE', 'EQUIPMENT');

CREATE TABLE "ResourcePriceListItem" (
    "id" TEXT NOT NULL,
    "kind" "ResourcePriceListKind" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "equipmentId" TEXT,
    "hourlyPrice" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourcePriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResourcePriceListItem_equipmentId_key" ON "ResourcePriceListItem"("equipmentId");
CREATE UNIQUE INDEX "ResourcePriceListItem_kind_normalizedName_key" ON "ResourcePriceListItem"("kind", "normalizedName");
CREATE INDEX "ResourcePriceListItem_kind_active_name_idx" ON "ResourcePriceListItem"("kind", "active", "name");

ALTER TABLE "ResourcePriceListItem" ADD CONSTRAINT "ResourcePriceListItem_equipmentId_fkey"
FOREIGN KEY ("equipmentId") REFERENCES "Equipment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
