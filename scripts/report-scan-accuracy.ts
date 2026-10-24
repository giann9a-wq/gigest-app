import { readFile, writeFile } from 'node:fs/promises';
import { normalizeScanText } from '../lib/scan-suggestions';

const dir='tmp/scan-accuracy-20261025';
async function main(){
 const r=JSON.parse(await readFile(`${dir}/results.json`,'utf8')) as any[];
 const design=JSON.parse(await readFile(`${dir}/design.json`,'utf8'));
 const summary=JSON.parse(await readFile(`${dir}/summary.json`,'utf8'));
 // Labels are from assistant review of this archived run, keyed by scan ID.
 // They must be supplied explicitly; report generation never auto-grades meaning.
 const audit=JSON.parse(await readFile(`${dir}/description-review.json`,'utf8'));
 const reviewedLabels=new Map<string,string>(audit.records.map((x:any)=>[x.id,x.label]));
 const reviews=r.map(x=>{
  const label=reviewedLabels.get(x.id);
  if(!label)throw new Error(`Unreviewed record ${x.id}`);
  return {id:x.id,supplier:x.expected.supplier,label,expected:x.expected.description,suggestion:x.suggestions.description?.value??null};
 });
 const counts=Object.fromEntries(['ready','requires_editing','wrong_or_unreliable','missing'].map(k=>[k,reviews.filter(x=>x.label===k).length]));
 const dates=r.map(x=>x.expected.usageDate).sort();
 const jobs=new Map<string,string>(design.jobs.map((x:any)=>[x.id,x.name]));
 const pct=(n:number,d:number)=>`${(100*n/d).toFixed(1).replace('.',',')}%`;
 const esc=(s:string)=>s.replace(/\|/g,'/').replace(/[\r\n]+/g,' ');
 const fields=['usageDate','supplier','jobOrderId','description'];
 const labels: Record<string,string>={usageDate:'Data',supplier:'Fornitore',jobOrderId:'Commessa',description:'Descrizione: identità testuale'};
 const baseline=Object.fromEntries(fields.map(k=>{
  const filled=r.filter(x=>x.data.suggestions?.[k]?.value);
  const same=filled.filter(x=>normalizeScanText(x.data.suggestions[k].value)===normalizeScanText(x.expected[k]));
  return[k,{filled:filled.length,exact:same.length}];
 }));
 const validated=r.filter(x=>x.validationStatus==='VALIDATED');
 const validatedStats=Object.fromEntries(fields.map(k=>{const f=validated.filter(x=>x.suggestions[k]);return[k,{filled:f.length,exact:f.filter(x=>normalizeScanText(x.suggestions[k].value)===normalizeScanText(x.expected[k])).length}]}));
 const body=[
 '# Verifica accuratezza suggerimenti bolle — 25 ottobre 2026',
 '',
 '**Esito:** data e fornitore sono utili, ma le descrizioni non raggiungono ancora una qualità sufficiente per essere considerate pronte in modo sistematico. La commessa è precisa quando proposta, con copertura limitata.',
 '',
 '## Campione e metodo',
 '',
 `- Archivio: 217 bolle; ${design.scans} scansioni inserite ancora collegate a una bolla.`,
 `- Escluse le 4 scansioni usate durante lo sviluppo: popolazione di prova ${design.eligible}.`,
 `- Campione: ${r.length} scansioni (${pct(r.length,design.eligible)} della popolazione di prova), ${design.suppliers} denominazioni fornitore e ${new Set(r.map(x=>x.expected.jobOrderId)).size} commesse; date ${dates[0]} – ${dates.at(-1)}.`,
 '- Campionamento stratificato per denominazione fornitore, almeno un documento per strato; quote residue proporzionali alla frequenza e selezione deterministica SHA-256 con seme documentato nello script. Non è un semplice campione casuale uniforme: i fornitori rari sono sovrarappresentati.',
 `- Regole congelate al commit daa5c47. Nessuna ottimizzazione sul campione durante la prova. Tutte le 80 bolle di prova escluse dallo storico usato per produrre suggerimenti; rimangono ${design.training} bolle di riferimento.`,
 '- L’anagrafica fornitori dei costi e le commesse/stati rimangono quelli correnti. Il training residuo può contenere bolle successive: è una verifica con campione separato, non una simulazione temporale del passato né un test su fornitori sconosciuti.',
 `- OCR eseguito attraverso il servizio autenticato in produzione: ${summary.ocrSuccess}/${r.length} letture riuscite. Nessuna bolla creata o modificata; conteggio finale invariato.`,
 `- ${validated.length}/${r.length} bolle del campione sono VALIDATED; le altre sono PENDING e vengono comunque confrontate con l'inserimento umano salvato.`,
 '',
 '## Concordanza oggettiva con lo storico',
 '',
 'Accuratezza = corrispondenze / suggerimenti emessi. Copertura = suggerimenti emessi / 80. I campi vuoti sono astensioni, non previsioni corrette. Il confronto ignora maiuscole, accenti e punteggiatura; non accorpa automaticamente alias aziendali. Non è una certificazione indipendente della verità del PDF.',
 '',
 '| Campo | Proposti | Coincidenti | Accuratezza sui proposti | Copertura | Corretti su 80 |',
 '|---|---:|---:|---:|---:|---:|',
 ...fields.map(k=>{const f=summary.fields[k];return `| ${labels[k]} | ${f.filled} | ${f.exactMatches} | ${pct(f.exactMatches,f.filled)} | ${pct(f.filled,80)} | ${pct(f.exactMatches,80)} |`;}),
 '',
 'Il 4,5% delle descrizioni misura solo l’identità col testo salvato: NON significa che il restante 95,5% sia errato. Le descrizioni umane contengono spesso impieghi e annotazioni di cantiere non presenti nel PDF. Per questo segue una valutazione distinta del contenuto proposto.',
 '',
 '## Descrizioni: valutazione del contenuto OCR',
 '',
 'Valutazione manuale da parte dell’assistente sul testo OCR e sui suggerimenti, senza verifica visiva indipendente di tutti gli originali. Una descrizione è «pronta» se riassume in modo coerente i materiali leggibili, senza intestazioni o testo estraneo; non si richiede di ricostruire annotazioni operative assenti dal documento. Riepiloghi materialmente incompleti, codici di intestazione e testo da ripulire sono classificati da correggere. Moduli con selezioni a casella non leggibili e scelte non dimostrate sono considerati inaffidabili.',
 '',
 `- Pronte secondo questo criterio: **${counts.ready}/67 (${pct(counts.ready,67)})**; sul totale del campione ${pct(counts.ready,80)}.`,
 `- Contengono informazioni utili ma richiedono integrazione/pulizia: **${counts.requires_editing}/67 (${pct(counts.requires_editing,67)})**.`,
 `- Errate, non pertinenti o non sufficientemente dimostrate dal testo: **${counts.wrong_or_unreliable}/67 (${pct(counts.wrong_or_unreliable,67)})**.`,
 `- Nessuna descrizione proposta: **${counts.missing}/80**.`,
 '',
 'Esempi: «DATA; VS. CODICE» non descrive la merce; «CARATTERISTICHE CHIMICO-FISICHE; Analisi/rapporto di prova» è un’intestazione di formulario. In un documento «Distanz.cemento» viene ridotto a «cemento», cambiando il significato. «Cls BASIC Durabile…» descrive invece il prodotto, ma non può ricostruire l’annotazione «Getto solaio P3».',
 '',
 '## Discrepanze da verificare',
 '',
 '| Scansione | Campo | Storico | Proposta |',
 '|---|---|---|---|',
 ...r.flatMap(x=>['usageDate','supplier','jobOrderId'].filter(k=>x.suggestions[k]&&normalizeScanText(x.suggestions[k].value)!==normalizeScanText(x.expected[k])).map(k=>`| ${x.id} | ${k} | ${esc(k==='jobOrderId'?jobs.get(x.expected[k])??x.expected[k]:x.expected[k])} | ${esc(k==='jobOrderId'?jobs.get(x.suggestions[k].value)??x.suggestions[k].value:x.suggestions[k].value)} |`)),
 '',
 'Quattro differenze fornitore riguardano denominazioni/alias (Cotto Possagno/Industrie Cotto Possagno; MARSSAL S.R.L./MARSSAL SRL; Fumagalli Marmi/Fumagalli Giovanni SRL; EDILGEMA SRL/edilgema). Il conteggio principale resta conservativo e non le riclassifica automaticamente come corrette.',
 '',
 'La discordanza di commessa riguarda una scansione UNICAL salvata su Gorgonzola, mentre il testo OCR riporta ripetutamente Via San Rainaldo, Concorezzo. Va verificata sull’originale prima di attribuire l’errore al suggerimento o correggere lo storico. Nessuna correzione automatica è stata eseguita.',
 '',
 'Le date divergenti includono riferimenti normativi/allegati (es. 22/10/2001 e 31/03/2009) e date documento diverse dal giorno salvato. Le otto divergenze sono conteggiate come mancata concordanza, senza sostenere che siano tutte errori di lettura.',
 '',
 '## Risultati pesati e controllo produzione',
 '',
 'La ponderazione usa per ciascuno strato il rapporto popolazione/campione. Offre un riferimento per la composizione dello storico, ma i piccoli strati non consentono una stima precisa della qualità futura.',
 '',
 '| Campo | Accuratezza testuale pesata | Copertura pesata | Produzione con tutto lo storico: coincidenti/proposti |',
 '|---|---:|---:|---:|',
 ...fields.map(k=>`| ${k} | ${summary.fields[k].weightedExactAccuracy.toFixed(1)}% | ${summary.fields[k].weightedCoverage.toFixed(1)}% | ${baseline[k].exact}/${baseline[k].filled} |`),
 '',
 'Il confronto produzione include anche le bolle valutate nello storico e può risultare ottimistico, in particolare sulle descrizioni: per questo il risultato principale è quello con campione escluso.',
 '',
 `Sottogruppo già validato (${validated.length} documenti): ${JSON.stringify(validatedStats)}.`,
 '',
 '## Campionamento per fornitore',
 '',
 '| Fornitore | Popolazione disponibile | Campione |',
 '|---|---:|---:|',
 ...design.strata.map((s:any)=>`| ${s.supplier} | ${s.population} | ${s.sample} |`),
 '',
 '## Revisione descrizioni per scansione',
 '',
 '| ID | Fornitore | Esito | Salvata | Proposta |',
 '|---|---|---|---|---|',
 ...reviews.map(x=>`| ${x.id} | ${esc(x.supplier)} | ${x.label} | ${esc(x.expected)} | ${esc(x.suggestion??'—')} |`),
 '',
 'I file design.json, snapshot.json, results.json, summary.json e description-review.json nella stessa cartella conservano il dettaglio riproducibile. Lo script evaluate-scan-accuracy.ts riesegue la prova riusando le risposte OCR già archiviate; report-scan-accuracy.ts produce questo documento per questa specifica esecuzione.',
 '',
 'Priorità suggerite: separare intestazioni e righe merce per modello fornitore; gestire moduli a caselle; limitare la ricerca della data alla pagina del documento principale; conservare la scelta manuale della commessa nei casi ambigui. Non è stato effettuato alcun nuovo rilascio per questa attività di misura.',
 ].join('\n');
 await writeFile(`${dir}/description-review.json`,JSON.stringify({criterion:'OCR-based assistant review; no independent visual review of every PDF',counts,records:reviews},null,2));
 await writeFile(`${dir}/report.md`,body);
 console.log(JSON.stringify({counts,readyAccuracy:pct(counts.ready,67),dates:[dates[0],dates.at(-1)],jobs:new Set(r.map(x=>x.expected.jobOrderId)).size,validated:validated.length,baseline,report:`${dir}/report.md`},null,2));
}
main();
