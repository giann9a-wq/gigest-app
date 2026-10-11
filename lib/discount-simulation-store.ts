import { Prisma } from "@prisma/client";
import { simulationSchema, type Simulation } from "./discount-calculator";

export const simulationInclude = { advances: { orderBy: { date: "asc" as const } } } satisfies Prisma.DiscountSimulationInclude;
type Stored = Prisma.DiscountSimulationGetPayload<{ include: typeof simulationInclude }>;
export function serializeSimulation(row: Stored) {
  return { id: row.id, name: row.name, reference: row.reference ?? "", price: Number(row.price), closingDate: row.closingDate.toISOString().slice(0, 10), euribor: Number(row.euribor), spread: Number(row.spread), guaranteeRate: Number(row.guaranteeRate), customerShare: Number(row.customerShare), createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), advances: row.advances.map(item => ({ date: item.date.toISOString().slice(0, 10), amount: Number(item.amount) })) };
}
export function simulationData(input: Simulation) {
  const value = simulationSchema.parse(input);
  return { name: value.name, reference: value.reference || null, price: new Prisma.Decimal(value.price), closingDate: new Date(`${value.closingDate}T00:00:00.000Z`), euribor: new Prisma.Decimal(value.euribor), spread: new Prisma.Decimal(value.spread), guaranteeRate: new Prisma.Decimal(value.guaranteeRate), customerShare: new Prisma.Decimal(value.customerShare), advances: { create: value.advances.map(row => ({ date: new Date(`${row.date}T00:00:00.000Z`), amount: new Prisma.Decimal(row.amount) })) } };
}
