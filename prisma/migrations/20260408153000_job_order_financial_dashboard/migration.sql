ALTER TABLE "JobOrder"
ADD COLUMN "budgetPersonnelCost" DECIMAL(12,2),
ADD COLUMN "budgetEquipmentCost" DECIMAL(12,2),
ADD COLUMN "budgetMaterialsCost" DECIMAL(12,2),
ADD COLUMN "budgetProfessionalServicesCost" DECIMAL(12,2),
ADD COLUMN "budgetThirdPartyServicesCost" DECIMAL(12,2),
ADD COLUMN "budgetMiscCost" DECIMAL(12,2),
ADD COLUMN "budgetExpectedRevenue" DECIMAL(12,2),
ADD COLUMN "actualMaterialsCost" DECIMAL(12,2),
ADD COLUMN "actualProfessionalServicesCost" DECIMAL(12,2),
ADD COLUMN "actualThirdPartyServicesCost" DECIMAL(12,2),
ADD COLUMN "actualMiscCost" DECIMAL(12,2),
ADD COLUMN "actualRevenue" DECIMAL(12,2);
