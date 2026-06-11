WITH ordered_costs AS (
  SELECT
    id,
    "hourlyCost",
    "validTo",
    LAG("hourlyCost") OVER (
      PARTITION BY "equipmentId"
      ORDER BY "validFrom", "createdAt", id
    ) AS previous_cost,
    LAG("validTo") OVER (
      PARTITION BY "equipmentId"
      ORDER BY "validFrom", "createdAt", id
    ) AS previous_valid_to
  FROM "EquipmentCost"
)
DELETE FROM "EquipmentCost"
WHERE id IN (
  SELECT id
  FROM ordered_costs
  WHERE "validTo" IS NULL
    AND previous_valid_to IS NULL
    AND previous_cost = "hourlyCost"
);
