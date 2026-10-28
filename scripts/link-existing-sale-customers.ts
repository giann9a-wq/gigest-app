import { linkExistingSaleCustomers } from "../lib/property-sales";
import { prisma } from "../lib/prisma";
import assert from "node:assert/strict";

async function main() {
  const before = await prisma.propertySale.findMany({ orderBy: { id: "asc" }, select: { id: true, unitId: true, customerName: true, agreedPrice: true, saleDate: true } });
  const count = await linkExistingSaleCustomers();
  const after = await prisma.propertySale.findMany({ where: { id: { in: before.map(s => s.id) } }, orderBy: { id: "asc" }, select: { id: true, unitId: true, customerName: true, agreedPrice: true, saleDate: true } });
  assert.deepEqual(after, before, "Il collegamento non deve modificare importi, date o nominativi delle vendite esistenti");
  console.log(`Vendite esistenti collegate al cliente: ${count}; importi e date preservati.`);
}
main()
  .catch(e => { console.error(e instanceof Error ? e.message : "Collegamento non riuscito"); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
