-- Preserve existing simulations, then use 0.05% for new database records.
ALTER TABLE "DiscountSimulation" ADD COLUMN "guaranteeVariableRate" DECIMAL(9,6) NOT NULL DEFAULT 0;
ALTER TABLE "DiscountSimulation" ALTER COLUMN "guaranteeVariableRate" SET DEFAULT 0.05;
ALTER TABLE "DiscountSimulation" ADD CONSTRAINT "DiscountSimulation_guaranteeVariableRate_check" CHECK ("guaranteeVariableRate" BETWEEN 0 AND 100);
