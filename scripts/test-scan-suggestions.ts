import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suggestScan, type ScanHistory, type ScanJob } from '../lib/scan-suggestions';
const jobs: ScanJob[] = [ { id: 'a', name: 'Cantiere Milano', siteAddress: 'Via Roma 123 Milano', status: 'ACTIVE', type: 'SITE' }, { id: 'b', name: 'Cantiere Monza', siteAddress: null, status: 'ACTIVE', type: 'SITE' } ];
const history: ScanHistory[] = Array.from({length: 4}, (_,i) => ({ supplier: 'EDILMELZI SRL', description: 'sabbia lavata', jobOrderId: i%2 ? 'a' : 'b', fromEmail: 'scanner@example.it' }));
const base = { history, jobs, suppliers: ['EDILMELZI SRL', 'EDILMELZI GORGONZOLA srl'], fromEmail: 'scanner@example.it' };
test('document date, supplier and material recognized; multi-job supplier does not assign a job', () => {
  const s = suggestScan({...base, text: 'EDILMELZI SRL\nData documento: 25/10/2026\nsabbia lavata'});
  assert.equal(s.supplier?.value, 'EDILMELZI SRL'); assert.equal(s.usageDate?.value, '2026-10-25'); assert.equal(s.description?.value, 'sabbia lavata'); assert.equal(s.jobOrderId, undefined);
});
test('specific supplier branch wins', () => {
  assert.equal(suggestScan({...base, text: 'EDILMELZI GORGONZOLA SRL'}).supplier?.value, 'EDILMELZI GORGONZOLA srl');
});
test('ambiguous dates remain empty', () => {
  assert.equal(suggestScan({...base, text: '01/10/2026 02/10/2026'}).usageDate, undefined);
});
test('document date takes precedence over due date', () => {
  assert.equal(suggestScan({...base, text: 'Data documento: 12/10/2026\nScadenza 12/11/2026'}).usageDate?.value, '2026-10-12');
});
test('invalid date and payment date not suggested', () => {
  assert.equal(suggestScan({...base, text: 'Data 31/02/2026\nScadenza 01/11/2026'}).usageDate, undefined);
});
test('job recognized by explicit address, but conflicting jobs remain empty', () => {
  assert.equal(suggestScan({...base, text: 'Destinazione: Via Roma 123 Milano'}).jobOrderId?.value, 'a');
  assert.equal(suggestScan({...base, text: 'Cantiere Milano Cantiere Monza EDILMELZI'}).jobOrderId, undefined);
});
test('consistent history suggests active job with medium confidence', () => {
  const s = suggestScan({...base, history: history.map(h => ({...h, jobOrderId:'a'})), text:'EDILMELZI'});
  assert.equal(s.jobOrderId?.value, 'a'); assert.equal(s.jobOrderId?.confidence, 'media');
});
test('scanner shared by suppliers cannot identify supplier', () => {
  const mixed = [...history, ...history.map(h => ({...h, supplier:'UNICAL SPA'}))];
  assert.equal(suggestScan({...base, history:mixed, text:''}).supplier, undefined);
});
test('historical annotation absent from PDF is never copied', () => {
  assert.equal(suggestScan({...base, text:'EDILMELZI SRL\ngetto solaio P3'}).description, undefined);
});
test('new materials extracted from document table', () => {
  assert.equal(suggestScan({...base, text:'Descrizione articoli Quantità\nCemento Portland kg 25\nTotale 40'}).description?.value, 'Cemento Portland kg 25');
});
test('completed jobs are not proposed from history', () => {
  assert.equal(suggestScan({...base, history:history.map(h => ({...h,jobOrderId:'a'})), jobs: jobs.map(j => ({...j,status:'COMPLETED'})), text:'EDILMELZI Cantiere Milano'}).jobOrderId, undefined);
});
test('legal reference dates do not compete with delivery date', () => {
  const text = 'DATA\nPAGINA\nCOD.CLIENTE\n01/10/2026\nSono stati eseguiti i controlli previsti al § 11.3.2.10.3 delle Norme Tecniche per le Costruzioni (ex D.M. 17/01/18)\nDATA INIZIO TRASPORTO: 01/10/2026';
  assert.equal(suggestScan({...base,text}).usageDate?.value, '2026-10-01');
});
test('order dates never outrank document dates even when introduced by del', () => {
  assert.equal(suggestScan({...base,text:'Data documento 01/10/2026\nOrdine del 30/09/2026'}).usageDate?.value,'2026-10-01');
});
test('address words match a job name only inside delivery destination', () => {
  const specificJobs: ScanJob[] = [{id:'c',name:'2026 Concorezzo Via S. Rainaldo',siteAddress:null,status:'ACTIVE',type:'SITE'}];
  assert.equal(suggestScan({...base,jobs:specificJobs,text:'Indirizzo di destinazione\nVia San Rainaldo 12\nConcorezzo\nDOCUMENTO DI TRASPORTO'}).jobOrderId?.value,'c');
  assert.equal(suggestScan({...base,jobs:specificJobs,text:'Sede legale: Via San Rainaldo Concorezzo'}).jobOrderId,undefined);
});
test('standalone description column excludes legal footer', () => {
  assert.equal(suggestScan({...base,text:'DESCRIZIONE\nAcciaio lavorato e posato\nU.M.\nQUANTITA\nKG\nATTESTATO DI DENUNCIA'}).description?.value,'Acciaio lavorato e posato');
});
test('technical concrete sheets provide product instead of generic table headers', () => {
  assert.equal(suggestScan({...base,text:'Nome\nDescrizione\nCLASSE DI RESISTENZA\nC28/35\nCls BASIC Durabile U35D a/c 0,60 C28/35 S4 D20'}).description?.value,'Cls BASIC Durabile U35D a/c 0,60 C28/35 S4 D20');
});
