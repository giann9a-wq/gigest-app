import { PrismaClient } from '@prisma/client';
import { readScanText } from '../lib/scan-ocr';
const db = new PrismaClient();
async function main() {
  for (const supplier of ['EDILMELZI SRL', 'UNICAL S.p.A.', 'CAL FER S R L', 'EDILMELZI GORGONZOLA srl']) {
    const scan = await db.scannedDeliveryNote.findFirst({ where: { deliveryNote: { supplier } }, orderBy: { insertedAt: 'desc' }, include: { deliveryNote: { include: { jobOrder: { select: { name: true, siteAddress: true } } } } } });
    if (scan) console.log(JSON.stringify({ supplier, expected: scan.deliveryNote, text: await readScanText(scan.driveFileId) }));
  }
}
main().finally(() => db.$disconnect());
