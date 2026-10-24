import { PrismaClient } from '@prisma/client';
import { encode } from 'next-auth/jwt';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { suggestScan, normalizeScanText } from '../lib/scan-suggestions';

const db = new PrismaClient();
const dir = 'tmp/scan-accuracy-20261025';
const developmentIds = new Set(['cmups8fzz0000l5046o0qca4a', 'cmuxowyg30000js04lr3cpcmm', 'cmvb4gy7f0002kz06xufr8d0l', 'cmvl6gfq90000jw06nibmv8o7']);
const hash = (s: string) => createHash('sha256').update(`gigest-accuracy-20261025:${s}`).digest('hex');

async function main() {
  await mkdir(dir, {recursive:true});
  const [scans, notes, jobs, costSuppliers, user] = await Promise.all([
    db.scannedDeliveryNote.findMany({where:{status:'INSERTED', deliveryNoteId:{not:null}},include:{deliveryNote:true},orderBy:{insertedAt:'asc'}}),
    db.deliveryNoteUsage.findMany({include:{sourceScan:{select:{fromEmail:true}}}}),
    db.jobOrder.findMany({select:{id:true,name:true,siteAddress:true,status:true,type:true}}),
    db.costActualEntry.findMany({distinct:['supplierName'],where:{supplierName:{not:null}},select:{supplierName:true}}),
    db.user.findFirstOrThrow({where:{role:'ADMIN',status:'ACTIVE'}}),
  ]);
  const eligible = scans.filter(s => !developmentIds.has(s.id));
  const groups = new Map<string, typeof scans>();
  for (const scan of eligible) groups.set(scan.deliveryNote!.supplier, [...(groups.get(scan.deliveryNote!.supplier) ?? []),scan]);
  const target = Math.min(80,eligible.length);
  const quotas = new Map([...groups].map(([supplier]) => [supplier,1]));
  while ([...quotas.values()].reduce((a,b)=>a+b,0) < target) {
    const next = [...groups].filter(([s,rows]) => quotas.get(s)! < rows.length)
      .sort(([a,ra],[b,rb]) => (rb.length/eligible.length*target-quotas.get(b)!) - (ra.length/eligible.length*target-quotas.get(a)!))[0];
    quotas.set(next[0],quotas.get(next[0])!+1);
  }
  const sample = [...groups].flatMap(([supplier,rows]) => [...rows].sort((a,b)=>hash(a.id).localeCompare(hash(b.id))).slice(0,quotas.get(supplier)!));
  const excludedNoteIds = new Set(sample.map(s=>s.deliveryNoteId));
  const history = notes.filter(n=>!excludedNoteIds.has(n.id)).map(n=>({supplier:n.supplier,description:n.description,jobOrderId:n.jobOrderId,fromEmail:n.sourceScan?.fromEmail}));
  const suppliers = [...new Set([...notes.map(n=>n.supplier),...costSuppliers.flatMap(s=>s.supplierName?[s.supplierName]:[])])];
  await writeFile(`${dir}/design.json`,JSON.stringify({createdAt:new Date(),scans:scans.length,eligible:eligible.length,sample:sample.length,training:history.length,suppliers:groups.size,jobs:jobs.map(j=>({id:j.id,name:j.name})),strata:[...groups].map(([supplier,rows])=>({supplier,population:rows.length,sample:quotas.get(supplier)})),ids:sample.map(s=>s.id),excludedDevelopmentIds:[...developmentIds]},null,2));
  await writeFile(`${dir}/snapshot.json`,JSON.stringify({notes,jobs,costSuppliers}));
  let index=0, complete=0;
  const records: any[]=[];
  const runWorker=async()=>{
    while(index<sample.length){
      const scan=sample[index++];
      const path=`${dir}/${scan.id}.json`;
      let raw: any;
      try { raw=JSON.parse(await readFile(path,'utf8')); }
      catch {
        const name='__Secure-authjs.session-token';
        const token=await encode({token:{id:user.id,sub:user.id,email:user.email},secret:process.env.AUTH_SECRET!,salt:name,maxAge:300});
        const started=Date.now();
        try {
          const response=await fetch(`https://gigest.vercel.app/api/documentale/scansioni/${scan.id}/suggerimenti`,{headers:{Cookie:`${name}=${token}`},signal:AbortSignal.timeout(125000)});
          const data=await response.json();
          raw={id:scan.id,status:response.status,elapsedMs:Date.now()-started,data};
        } catch(e){raw={id:scan.id,status:0,error:String(e),data:{recognizedText:'',warning:'request failed'}};}
        await writeFile(path,JSON.stringify(raw));
      }
      const expected={supplier:scan.deliveryNote!.supplier,usageDate:scan.deliveryNote!.usageDate.toISOString().slice(0,10),description:scan.deliveryNote!.description,jobOrderId:scan.deliveryNote!.jobOrderId};
      const suggestions=suggestScan({text:raw.data.recognizedText??'',fromEmail:scan.fromEmail,history,suppliers,jobs});
      records.push({...raw,expected,suggestions,sampleWeight:groups.get(expected.supplier)!.length/quotas.get(expected.supplier)!,validationStatus:scan.deliveryNote!.validationStatus,insertedAt:scan.insertedAt,usageDate:expected.usageDate});
      console.log(JSON.stringify({progress:`${++complete}/${sample.length}`,supplier:expected.supplier,status:raw.status,warning:raw.data.warning,filled:Object.keys(suggestions).length}));
      await writeFile(`${dir}/results.json`,JSON.stringify(records,null,2));
    }
  };
  await Promise.all([runWorker(),runWorker(),runWorker()]);
  await writeFile(`${dir}/results.json`,JSON.stringify(records,null,2));
  const summary: any={sample:records.length,population:eligible.length,suppliers:groups.size,training:history.length,ocrSuccess:records.filter(r=>r.status===200&&!r.data.warning).length,fields:{}};
  for(const field of ['usageDate','supplier','jobOrderId','description']){
    const predicted=records.filter(r=>r.suggestions[field]?.value);
    const equal=predicted.filter(r=>normalizeScanText(r.suggestions[field].value)===normalizeScanText(r.expected[field]));
    summary.fields[field]={filled:predicted.length,coverage:predicted.length/records.length*100,exactMatches:equal.length,exactAccuracy:equal.length/predicted.length*100,weightedCoverage:predicted.reduce((s,r)=>s+r.sampleWeight,0)/eligible.length*100,weightedExactAccuracy:equal.reduce((s,r)=>s+r.sampleWeight,0)/predicted.reduce((s,r)=>s+r.sampleWeight,0)*100};
  }
  summary.bollaCountUnchanged=notes.length===await db.deliveryNoteUsage.count();
  await writeFile(`${dir}/summary.json`,JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
}
main().finally(()=>db.$disconnect());
