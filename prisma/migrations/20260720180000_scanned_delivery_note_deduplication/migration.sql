-- Preserve one canonical key for every PDF already imported. Historical duplicate
-- rows remain untouched, but all future imports of the same sender/content pair
-- conflict with the canonical row and are skipped atomically.
ALTER TABLE "ScannedDeliveryNote"
ADD COLUMN "deduplicationKey" TEXT;

WITH ranked_scans AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY LOWER("fromEmail"), "fileHash"
      ORDER BY
        CASE "status"::text
          WHEN 'INSERTED' THEN 0
          WHEN 'NEW' THEN 1
          WHEN 'REJECTED' THEN 2
          ELSE 3
        END,
        "createdAt" ASC,
        "id" ASC
    ) AS row_number
  FROM "ScannedDeliveryNote"
  WHERE "fileHash" IS NOT NULL
    AND "status"::text IN ('NEW', 'INSERTED', 'REJECTED')
)
UPDATE "ScannedDeliveryNote" AS scan
SET "deduplicationKey" = LOWER(scan."fromEmail") || ':' || scan."fileHash"
FROM ranked_scans
WHERE scan."id" = ranked_scans."id"
  AND ranked_scans.row_number = 1;

CREATE UNIQUE INDEX "ScannedDeliveryNote_deduplicationKey_key"
ON "ScannedDeliveryNote"("deduplicationKey");
