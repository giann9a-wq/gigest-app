ALTER TABLE "DiscountSimulation" ADD COLUMN "guaranteeFee" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "DiscountSimulation" ADD CONSTRAINT "DiscountSimulation_guaranteeFee_check" CHECK ("guaranteeFee" >= 0);
