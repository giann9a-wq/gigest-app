CREATE TABLE "DiscountSimulation" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "reference" TEXT,
  "price" DECIMAL(12,2) NOT NULL, "closingDate" DATE NOT NULL,
  "euribor" DECIMAL(9,6) NOT NULL, "spread" DECIMAL(9,6) NOT NULL,
  "guaranteeRate" DECIMAL(9,6) NOT NULL, "customerShare" DECIMAL(9,6) NOT NULL,
  "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DiscountSimulation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountSimulation_price_check" CHECK ("price" > 0),
  CONSTRAINT "DiscountSimulation_share_check" CHECK ("customerShare" BETWEEN 0 AND 100),
  CONSTRAINT "DiscountSimulation_rates_check" CHECK ("euribor" BETWEEN -100 AND 100 AND "spread" BETWEEN 0 AND 100 AND "guaranteeRate" BETWEEN 0 AND 100)
);
CREATE TABLE "DiscountAdvance" (
  "id" TEXT NOT NULL, "simulationId" TEXT NOT NULL, "date" DATE NOT NULL, "amount" DECIMAL(12,2) NOT NULL,
  CONSTRAINT "DiscountAdvance_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountAdvance_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "DiscountAdvance_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "DiscountSimulation"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "DiscountSimulation_updatedAt_idx" ON "DiscountSimulation"("updatedAt");
CREATE INDEX "DiscountAdvance_simulationId_date_idx" ON "DiscountAdvance"("simulationId", "date");
