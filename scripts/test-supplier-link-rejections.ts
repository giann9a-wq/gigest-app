import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findSupplierLinkSuggestions, rejectSupplierLinkSuggestion } from '../lib/admin-supplier-links';

function fixture() {
  const resources = [
    { id:'alfa', name:'Alfa Edil', _count:{diaryActivities:22} },
    { id:'yuri', name:'Yuri', _count:{diaryActivities:0} },
  ];
  const suppliers = [
    {supplierName:'Alfa Edil Nord SRL'}, {supplierName:'Alfa Edil Sud SRL'}, {supplierName:'Yuri Rossi SRL'},
  ];
  const settings = new Map<string,unknown>();
  const database: any = {
    externalResource:{findMany:async()=>resources,findUnique:async({where}:any)=>resources.find(r=>r.id===where.id)??null},
    costActualEntry:{findMany:async()=>suppliers},
    costImportRowStaging:{findMany:async()=>[]},
    costImportCorrectionRule:{findMany:async()=>[]},
    appSetting:{
      findMany:async()=>[...settings.keys()].map(key=>({key})),
      upsert:async({where,create,update}:any)=>{settings.set(where.key,settings.has(where.key)?update.value:create.value);},
    },
  };
  return {resources,suppliers,settings,database};
}

test('rejecting a candidate persists across queries without hiding other candidates or changing history',async()=>{
  const f=fixture();const original=structuredClone(f.resources);
  assert.equal((await findSupplierLinkSuggestions(20,f.database))[0].candidates.length,2);
  await rejectSupplierLinkSuggestion({externalResourceId:'alfa',supplierName:'Alfa Edil Nord SRL',rejectedByUserId:'admin'},f.database);
  for(let i=0;i<2;i++){
    const rows=await findSupplierLinkSuggestions(20,f.database);
    assert.deepEqual(rows.find(r=>r.externalResourceId==='alfa')?.candidates.map(c=>c.supplierName),['Alfa Edil Sud SRL']);
    assert.equal(rows.find(r=>r.externalResourceId==='yuri')?.candidates.length,1);
  }
  assert.deepEqual(f.resources,original);assert.equal(f.settings.size,1);
});

test('rejected candidates stay hidden when an import changes case, punctuation or legal suffix formatting',async()=>{
  const f=fixture();
  await rejectSupplierLinkSuggestion({externalResourceId:'alfa',supplierName:'Alfa Edil Nord SRL',rejectedByUserId:'admin'},f.database);
  f.suppliers[0].supplierName='ALFA EDIL NORD S.R.L.';
  const rows=await findSupplierLinkSuggestions(20,f.database);
  assert.deepEqual(rows[0].candidates.map(c=>c.supplierName),['Alfa Edil Sud SRL']);
});

test('reject all hides the entire voice, including future matches, before applying the result limit',async()=>{
  const f=fixture();
  await rejectSupplierLinkSuggestion({externalResourceId:'alfa',rejectedByUserId:'admin'},f.database);
  f.suppliers.push({supplierName:'Alfa Edil Centro SRL'});
  const rows=await findSupplierLinkSuggestions(1,f.database);
  assert.equal(rows.length,1);assert.equal(rows[0].externalResourceId,'yuri');
});

test('rejecting an already rejected candidate is idempotent',async()=>{
  const f=fixture();
  const input={externalResourceId:'alfa',supplierName:'Alfa Edil Nord SRL',rejectedByUserId:'admin'};
  await Promise.all([rejectSupplierLinkSuggestion(input,f.database),rejectSupplierLinkSuggestion(input,f.database)]);
  assert.equal(f.settings.size,1);
});

test('invalid source or blank supplier does not store a rejection',async()=>{
  const f=fixture();
  await assert.rejects(rejectSupplierLinkSuggestion({externalResourceId:'missing',rejectedByUserId:'admin'},f.database));
  await assert.rejects(rejectSupplierLinkSuggestion({externalResourceId:'alfa',supplierName:' ',rejectedByUserId:'admin'},f.database));
  assert.equal(f.settings.size,0);
});
