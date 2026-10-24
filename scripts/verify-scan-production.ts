import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';
import { mkdir, writeFile } from 'node:fs/promises';
const db = new PrismaClient();
async function main() {
  const user = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  const cookieName = '__Secure-authjs.session-token';
  const token = await encode({ token: { id:user.id, sub:user.id, email:user.email }, secret:process.env.AUTH_SECRET!, salt:cookieName, maxAge:300 });
  const headers = { Cookie:`${cookieName}=${token}` };
  const base = process.env.SCAN_TEST_URL || 'https://gigest.vercel.app';
  const countBefore = await db.deliveryNoteUsage.count();
  for (const supplier of ['EDILMELZI SRL', 'UNICAL S.p.A.', 'CAL FER S R L', 'EDILMELZI GORGONZOLA srl']) {
    const scan = await db.scannedDeliveryNote.findFirst({ where: { deliveryNote: { supplier } }, orderBy: { insertedAt:'desc' }, include: { deliveryNote:true } });
    if (!scan) continue;
    const response = await fetch(`${base}/api/documentale/scansioni/${scan.id}/suggerimenti`, { headers });
    const result = await response.json();
    await mkdir('tmp/scan-ocr', { recursive:true });
    if (result.recognizedText) await writeFile(`tmp/scan-ocr/${scan.id}.txt`, result.recognizedText);
    delete result.recognizedText;
    console.log(JSON.stringify({ supplier, status:response.status, expected:{ supplier, usageDate:scan.deliveryNote!.usageDate.toISOString().slice(0,10), description:scan.deliveryNote!.description, jobOrderId:scan.deliveryNote!.jobOrderId }, result }));
    if (!response.ok || result.warning) throw new Error('Verifica OCR produzione fallita');
    for (const field of ['supplier', 'usageDate', 'description', 'jobOrderId']) {
      if (!result.suggestions?.[field]?.value) throw new Error(`Suggerimento ${field} mancante nel campione ${supplier}`);
    }
    if (result.suggestions.usageDate.value !== scan.deliveryNote!.usageDate.toISOString().slice(0,10)) throw new Error('Data riconosciuta diversa dal campione verificato');
    if (result.suggestions.jobOrderId.value !== scan.deliveryNote!.jobOrderId) throw new Error('Commessa riconosciuta diversa dal campione verificato');
    const unauthenticated = await fetch(`${base}/api/documentale/scansioni/${scan.id}/suggerimenti`);
    if (unauthenticated.status !== 401) throw new Error('Suggerimenti accessibili senza autenticazione');
    const refused = await fetch(`${base}/api/documentale/scansioni/${scan.id}/inserisci`, { method:'POST', headers:{...headers, 'Content-Type':'application/json'}, body:JSON.stringify({}) });
    if (refused.status !== 400) throw new Error('Conferma umana non obbligatoria');
  }
  if (countBefore !== await db.deliveryNoteUsage.count()) throw new Error('Numero bolle modificato durante verifica');
  console.log('Verificato: OCR autenticato, conferma umana obbligatoria, nessuna bolla inserita.');
}
main().finally(() => db.$disconnect());
