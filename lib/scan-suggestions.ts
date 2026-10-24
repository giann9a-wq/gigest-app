export type ScanField = "supplier" | "jobOrderId" | "usageDate" | "description";
export type ScanSuggestion = { value: string; reason: string; confidence: "alta" | "media" };
export type ScanSuggestions = Partial<Record<ScanField, ScanSuggestion>>;
export type ScanHistory = { supplier: string; description: string; jobOrderId: string; fromEmail?: string | null };
export type ScanJob = { id: string; name: string; siteAddress: string | null; status: string; type: string };

export function normalizeScanText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function supplierKey(value: string) {
  return normalizeScanText(value).replace(/\b(s r l|s p a|srl|spa|srls)\b/g, "").trim();
}
function contains(text: string, value: string) {
  return (` ${normalizeScanText(text)} `).includes(` ${normalizeScanText(value)} `);
}
export function suggestScan(input: { text: string; fromEmail: string; history: ScanHistory[]; suppliers: string[]; jobs: ScanJob[] }): ScanSuggestions {
  const { text, history } = input;
  const result: ScanSuggestions = {};
  const candidates = input.suppliers.filter(s => supplierKey(s).length >= 4 && contains(text, supplierKey(s)));
  // A branch name (e.g. Edilmelzi Gorgonzola) takes precedence over its parent name.
  const specific = candidates.filter(s => !candidates.some(other => supplierKey(other) !== supplierKey(s) && contains(supplierKey(other), supplierKey(s))));
  const keys = [...new Set(specific.map(supplierKey))];
  if (keys.length === 1) {
    const value = specific.sort((a,b) => history.filter(h => h.supplier === b).length - history.filter(h => h.supplier === a).length)[0];
    result.supplier = { value, reason: "Nome del fornitore riconosciuto nel documento e confrontato con lo storico", confidence: "alta" };
  } else if (!keys.length) {
    const rows = history.filter(h => h.fromEmail && h.fromEmail.toLowerCase() === input.fromEmail.toLowerCase());
    const counts = new Map<string, number>();
    for (const row of rows) counts.set(row.supplier, (counts.get(row.supplier) ?? 0) + 1);
    const best = [...counts].sort((a,b) => b[1]-a[1])[0];
    if (best && best[1] >= 3 && best[1] / rows.length >= 0.9) result.supplier = { value: best[0], reason: `Mittente associato a questo fornitore in ${best[1]} di ${rows.length} inserimenti confermati`, confidence: "media" };
  }

  const dates: { value: string; score: number }[] = [];
  for (const match of text.matchAll(/(?<![\d/.\-])\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4}|\d{2})\b(?![\d/.\-])/g)) {
    const year = Number(match[3]) + (match[3].length === 2 ? 2000 : 0);
    const month = Number(match[2]), day = Number(match[1]);
    const date = new Date(Date.UTC(year, month-1, day));
    if (year < 2000 || year > new Date().getUTCFullYear()+1 || date.getUTCMonth() !== month-1 || date.getUTCDate() !== day) continue;
    const before = text.slice(Math.max(0, match.index! - 65), match.index).toLowerCase();
    const unrelatedDate = /(?:scadenz\w*|pagament\w*|ordine|offerta|rif\.|d\.?\s*m\.?|d\.?\s*p\.?\s*r\.?|legge|decreto|norm[ae])[^\n]{0,45}$/.test(before);
    const score = unrelatedDate ? -1 : /(?:data|del)\s*(?:documento|ddt|bolla|fattura|trasporto|consegna)?\s*[:.]?\s*$/.test(before) ? 3 : 0;
    dates.push({ value: date.toISOString().slice(0,10), score });
  }
  const ranked = dates.filter(d => d.score >= 0).sort((a,b) => b.score-a.score);
  const top = ranked[0];
  if (top && new Set(ranked.filter(d => d.score === top.score).map(d => d.value)).size === 1) result.usageDate = { value: top.value, reason: top.score ? "Data del documento letta tramite OCR" : "Unica data riconosciuta nel documento: verificare sul PDF", confidence: top.score ? "alta" : "media" };

  const eligibleJobs = input.jobs.filter(j => j.status === "ACTIVE" && j.type === "SITE");
  const destination = text.match(/(?:luogo\s+di\s+(?:destinazione|consegna)|indirizzo\s+di\s+destinazione|destinazione\s+merce)\s*:?([\s\S]{0,450})/i)?.[1]
    ?.split(/trasportatore|documento\s+di\s+trasporto|causale|codice\s+articolo/i)[0] ?? "";
  const matchedJobs = eligibleJobs.filter(j => {
    if ((normalizeScanText(j.name).length >= 6 && contains(text, j.name)) || (j.siteAddress && normalizeScanText(j.siteAddress).length >= 10 && contains(text, j.siteAddress))) return true;
    // Job names often include the year and abbreviated streets. Match at least two
    // distinctive words, in any order, exclusively inside the delivery destination.
    const tokens = [...new Set(normalizeScanText(j.name).split(" ").filter(t => t.length >= 4 && !/^\d+$/.test(t) && !["cantiere", "commessa", "della", "delle", "viale", "piazza"].includes(t)))];
    return tokens.length >= 2 && tokens.every(t => contains(destination, t));
  });
  if (matchedJobs.length === 1) result.jobOrderId = { value: matchedJobs[0].id, reason: "Nome o indirizzo di una sola commessa attiva presente nel documento", confidence: "alta" };
  else if (!matchedJobs.length && result.supplier) {
    const rows = history.filter(h => supplierKey(h.supplier) === supplierKey(result.supplier!.value));
    const ids = [...new Set(rows.map(h => h.jobOrderId))];
    if (rows.length >= 3 && ids.length === 1 && eligibleJobs.some(j => j.id === ids[0])) result.jobOrderId = { value: ids[0], reason: `Tutte le ${rows.length} bolle storiche del fornitore sono sulla stessa commessa: verificare`, confidence: "media" };
  }

  // Reuse only historical descriptions actually present in this document, never past site annotations.
  const descriptions = [...new Set(history.filter(h => result.supplier && supplierKey(h.supplier) === supplierKey(result.supplier.value)).map(h => h.description.trim()))]
    .filter(d => normalizeScanText(d).length >= 5 && contains(text, d)).sort((a,b) => b.length-a.length);
  const distinct = descriptions.filter(d => !descriptions.some(other => other !== d && contains(other, d)));
  if (distinct.length) result.description = { value: distinct.slice(0,6).join("; ").slice(0,1000), reason: "Descrizioni già usate per il fornitore e ritrovate nel testo di questa scansione", confidence: "media" };
  else {
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const concrete = lines.find(l => /^(?:cls|calcestruzzo)\s+.{5,}/i.test(l));
    if (concrete) {
      result.description = { value: concrete.slice(0,1000), reason: "Tipo di calcestruzzo letto nella scheda prodotto del documento", confidence: "media" };
      return result;
    }
    const start = lines.findIndex(l => /^descrizione\s*$/i.test(l) || /descrizione\s*(?:dei\s+beni|merce|articol|material|prodott)|descrizione.*(?:quantit|u\.?m\.?)|denominazione.*beni/i.test(l));
    if (start >= 0) {
      const material: string[] = [];
      for (const line of lines.slice(start+1, start+16)) {
        if (/totale|imponibile|pagamento|firma|trasport|vettore|annotazioni|aspetto.*beni|attestato|norme tecniche|sono stati|la fornitura|contributo/i.test(line)) break;
        if (/[a-zàèéìòù]{3}/i.test(line) && !/^(codice|descrizione|quantit|prezzo|importo|iva\b|u\.?m\.?)/i.test(line)) material.push(line);
        if (material.length === 6) break;
      }
      if (material.length) result.description = { value: material.join("; ").slice(0,1000), reason: "Righe materiali lette dalla tabella del documento: verificare il riepilogo", confidence: "media" };
    }
  }
  return result;
}
