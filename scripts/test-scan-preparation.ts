import { test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { prepareScanSuggestions as prepare, preparedScanData } from '../lib/scan-suggestions-service';

let scan: any;
let database: any;
const prepareScanSuggestions = (id:string,read: (id:string)=>Promise<string>) => prepare(id,read,database);
function matches(where: any): boolean {
  if (where.id && where.id !== scan.id) return false;
  if (where.status && where.status !== scan.status) return false;
  if (typeof where.ocrStatus === 'string' && where.ocrStatus !== scan.ocrStatus) return false;
  if (where.ocrStatus?.in && !where.ocrStatus.in.includes(scan.ocrStatus)) return false;
  if (where.ocrAttemptedAt instanceof Date && scan.ocrAttemptedAt?.getTime() !== where.ocrAttemptedAt.getTime()) return false;
  if (where.ocrAttemptedAt?.lt && !(scan.ocrAttemptedAt < where.ocrAttemptedAt.lt)) return false;
  return !where.OR || where.OR.some(matches);
}
beforeEach(() => {
  scan={id:'scan',driveFileId:'file',fromEmail:'scanner@example.it',status:'NEW',ocrStatus:'PENDING',ocrData:null,ocrAttemptedAt:null};
  database={
    scannedDeliveryNote:{
      updateMany:async (args:any)=> {
        if (!matches(args.where)) return {count:0};
        scan={...scan,...args.data}; return {count:1};
      },
      findUnique:async ()=>({...scan}),
    },
    deliveryNoteUsage:{findMany:async()=>[]},
    costActualEntry:{findMany:async()=>[]},
    jobOrder:{findMany:async()=>[]},
  };
  mock.method(console,'error',()=>{});
});
afterEach(()=>mock.restoreAll());

test('prepares a new scan once and persists values across repeated opens',async()=>{
  let calls=0;const read=async()=>{calls++;return 'Data documento: 25/10/2026';};
  await prepareScanSuggestions('scan',read);
  assert.equal(scan.ocrStatus,'READY');
  assert.equal(preparedScanData(scan.ocrData)?.suggestions.usageDate?.value,'2026-10-25');
  await prepareScanSuggestions('scan',read);
  assert.equal(calls,1);
});
test('saved scans never run OCR or change stored data',async()=>{
  scan.status='INSERTED';scan.ocrStatus='STOPPED';
  const before={...scan};let called=false;
  await prepareScanSuggestions('scan',async()=>{called=true;return 'text';});
  assert.equal(called,false);assert.deepEqual(scan,before);
});
test('rejected scans never run OCR',async()=>{
  scan.status='REJECTED';let called=false;
  await prepareScanSuggestions('scan',async()=>{called=true;return 'text';});
  assert.equal(called,false);
});
test('saving during OCR prevents late suggestions from being stored',async()=>{
  await prepareScanSuggestions('scan',async()=>{
    scan.status='INSERTED';scan.ocrStatus='STOPPED';scan.ocrData=null;
    return 'Data documento: 25/10/2026';
  });
  assert.equal(scan.status,'INSERTED');assert.equal(scan.ocrStatus,'STOPPED');assert.equal(scan.ocrData,null);
});
test('concurrent background and popup requests acquire only one lease',async()=>{
  let calls=0;
  await Promise.all(Array.from({length:3},()=>prepareScanSuggestions('scan',async()=>{calls++;return 'text';})));
  assert.equal(calls,1);assert.equal(scan.ocrStatus,'READY');
});
test('failed OCR permits a later retry without repeated immediate calls',async()=>{
  let calls=0;
  const read=async()=>{if(++calls===1)throw new Error('OCR unavailable');return 'text';};
  await prepareScanSuggestions('scan',read);
  assert.equal(scan.ocrStatus,'ERROR');
  await prepareScanSuggestions('scan',read);assert.equal(calls,1);
  scan.ocrAttemptedAt=new Date(Date.now()-6*60*1000);
  await prepareScanSuggestions('scan',read);assert.equal(calls,2);assert.equal(scan.ocrStatus,'READY');
});
test('a lost serverless worker is recovered after its lease expires',async()=>{
  scan.ocrStatus='PROCESSING';scan.ocrAttemptedAt=new Date(Date.now()-6*60*1000);
  await prepareScanSuggestions('scan',async()=>'text');
  assert.equal(scan.ocrStatus,'READY');
});
