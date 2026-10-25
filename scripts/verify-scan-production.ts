import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';
const db = new PrismaClient();
async function main() {
  const user = await db.user.findFirstOrThrow({ where: { role: 'ADMIN', status: 'ACTIVE' } });
  const cookieName = '__Secure-authjs.session-token';
  const token = await encode({ token: { id:user.id, sub:user.id, email:user.email }, secret:process.env.AUTH_SECRET!, salt:cookieName, maxAge:300 });
  const headers = { Cookie:`${cookieName}=${token}` };
  const base = process.env.SCAN_TEST_URL || 'https://gigest.vercel.app';
  const countBefore = await db.deliveryNoteUsage.count();
  const saved = await db.scannedDeliveryNote.findFirstOrThrow({where:{status:'INSERTED',deliveryNoteId:{not:null}},include:{deliveryNote:true}});
  const originalNote=JSON.stringify(saved.deliveryNote);
  const blocked=await fetch(`${base}/api/documentale/scansioni/${saved.id}/suggerimenti`,{headers});
  if(blocked.status!==409)throw new Error('Le bolle salvate non devono ricevere suggerimenti');
  if(JSON.stringify(await db.deliveryNoteUsage.findUnique({where:{id:saved.deliveryNoteId!}}))!==originalNote)throw new Error('Bolla salvata modificata');
  const unauthenticated=await fetch(`${base}/api/documentale/scansioni/${saved.id}/suggerimenti`);
  if(unauthenticated.status!==401)throw new Error('API accessibile senza autenticazione');

  // Listing the inbox prepares NEW scans in the response background, without
  // opening any document or inserting a delivery note.
  const list=await fetch(`${base}/api/documentale/scansioni`,{headers});
  if(!list.ok)throw new Error('Elenco scansioni non disponibile');
  const inbox=await list.json();
  for(const row of inbox.rows){
    const deadline=Date.now()+100000;
    let scan=await db.scannedDeliveryNote.findUniqueOrThrow({where:{id:row.id}});
    while(scan.status==='NEW'&&scan.ocrStatus!=='READY'&&Date.now()<deadline){
      await new Promise(resolve=>setTimeout(resolve,1500));
      scan=await db.scannedDeliveryNote.findUniqueOrThrow({where:{id:row.id}});
    }
    if(scan.status!=='NEW')continue; // The user may independently save a document.
    if(scan.ocrStatus!=='READY')throw new Error(`OCR non pronto: ${scan.ocrStatus}`);
    const attempt=scan.ocrAttemptedAt?.toISOString();
    const persisted=JSON.stringify(scan.ocrData);
    const started=Date.now();
    for(let i=0;i<2;i++){
      const response=await fetch(`${base}/api/documentale/scansioni/${scan.id}/suggerimenti`,{headers});
      const data=await response.json();
      if(!response.ok||data.ocrStatus!=='READY')throw new Error('Suggerimenti persistenti non disponibili');
    }
    const after=await db.scannedDeliveryNote.findUniqueOrThrow({where:{id:scan.id}});
    if(after.ocrAttemptedAt?.toISOString()!==attempt||JSON.stringify(after.ocrData)!==persisted)throw new Error('Apertura ha ricalcolato OCR');
    const refreshed=await (await fetch(`${base}/api/documentale/scansioni`,{headers})).json();
    if(!refreshed.rows.find((x:any)=>x.id===scan.id)?.suggestions)throw new Error('Suggerimenti assenti dall’elenco');
    const refused=await fetch(`${base}/api/documentale/scansioni/${scan.id}/inserisci`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}'});
    if(refused.status!==400)throw new Error('Conferma umana non obbligatoria');
    console.log(JSON.stringify({scan:scan.id,ocrStatus:after.ocrStatus,cachedRequests:2,totalMs:Date.now()-started,attemptUnchanged:true}));
  }
  if(countBefore!==await db.deliveryNoteUsage.count())throw new Error('Numero bolle cambiato durante verifica');
  console.log('Verificato: OCR preparato prima dell’apertura, risultati persistenti, archivio bloccato, nessun inserimento automatico.');
}
main().finally(() => db.$disconnect());
