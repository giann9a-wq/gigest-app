import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
async function main() {
  const notes = await db.deliveryNoteUsage.findMany({ select: { supplier: true, description: true, jobOrderId: true, validationStatus: true, sourceScan: { select: { fromEmail: true } } } });
  const scans = await db.scannedDeliveryNote.groupBy({ by: ['status'], _count: true });
  const groups = new Map<string, typeof notes>();
  for (const row of notes) groups.set(row.supplier, [...(groups.get(row.supplier) ?? []), row]);
  console.log(JSON.stringify({ total: notes.length, scans, suppliers: [...groups].map(([supplier, rows]) => ({ supplier, count: rows.length, jobs: new Set(rows.map(r => r.jobOrderId)).size, descriptions: [...new Set(rows.map(r => r.description))].slice(0, 8), scanned: rows.filter(r => r.sourceScan).length, validated: rows.filter(r => r.validationStatus === 'VALIDATED').length })).sort((a,b) => b.count-a.count).slice(0,30) }, null, 2));
}
main().finally(() => db.$disconnect());
