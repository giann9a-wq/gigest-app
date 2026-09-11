"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SourceType = "PERSON_ROLE" | "EQUIPMENT" | "PRICE_LIST" | "FREE";
type Line = { clientId: string; sourceType: SourceType; sourceReference: string; priceListItemId: string; code: string; description: string; unit: string; quantity: number; unitPrice: number; discountPercent: number };
type Chapter = { clientId: string; parentClientId: string | null; title: string; description: string; lines: Line[] };
type QuoteForm = { id?: string; number?: string; title: string; customerName: string; customerContact: string; siteAddress: string; description: string; plannedStartDate: string; plannedEndDate: string; isOwnAccountSite: boolean; generalDiscountPercent: number; chapters: Chapter[] };
type Options = { roles: Array<{ role: string; hourlyCost: number }>; equipment: Array<{ id: string; name: string; hourlyCost: number }>; priceListVersion: { id: string; name: string; itemCount: number } | null; priceItems: Array<{ id: string; code: string; description: string; unit: string; price: number }> };
type QuoteRow = QuoteForm & { id: string; number: string; status: string; updatedAt: string; totals: { gross: number; lineDiscounts: number; generalDiscount: number; total: number }; opportunity?: { id: string; status: string; notes?: string | null; jobOrder?: { id: string; name: string } | null } | null };

const units = ["m", "h", "m²", "m³", "kg", "cad", "a corpo"];
const uid = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (sourceType: SourceType = "FREE"): Line => ({ clientId: uid(), sourceType, sourceReference: "", priceListItemId: "", code: "", description: "", unit: sourceType === "PERSON_ROLE" || sourceType === "EQUIPMENT" ? "h" : "a corpo", quantity: 1, unitPrice: 0, discountPercent: 0 });
const emptyQuote = (): QuoteForm => ({ title: "", customerName: "", customerContact: "", siteAddress: "", description: "", plannedStartDate: "", plannedEndDate: "", isOwnAccountSite: false, generalDiscountPercent: 0, chapters: [{ clientId: uid(), parentClientId: null, title: "Lavorazioni", description: "", lines: [] }] });
const money = (value: number) => value.toLocaleString("it-IT", { style: "currency", currency: "EUR" });

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Operazione non riuscita"); return data;
}

export function PreventiviWorkspace() {
  const [tab, setTab] = useState<"quote" | "opportunities">("quote");
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [form, setForm] = useState<QuoteForm>(emptyQuote());
  const [options, setOptions] = useState<Options>({ roles: [], equipment: [], priceListVersion: null, priceItems: [] });
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadQuotes() { const data = await api("/api/preventivi"); setQuotes(data.rows); }
  async function loadOptions(q = "") { const data = await api(`/api/preventivi/options?q=${encodeURIComponent(q)}`); setOptions(data); }
  useEffect(() => { Promise.all([loadQuotes(), loadOptions()]).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (search.trim().length < 2) return; const timer = setTimeout(() => loadOptions(search).catch((e) => setError(e.message)), 300); return () => clearTimeout(timer); }, [search]);

  const totals = useMemo(() => {
    let gross = 0, afterLines = 0;
    for (const chapter of form.chapters) for (const line of chapter.lines) { const row = Number(line.quantity) * Number(line.unitPrice); gross += row; afterLines += row * (1 - Number(line.discountPercent) / 100); }
    return { gross, lineDiscount: gross - afterLines, general: afterLines * Number(form.generalDiscountPercent) / 100, total: afterLines * (1 - Number(form.generalDiscountPercent) / 100) };
  }, [form]);

  function updateChapter(id: string, patch: Partial<Chapter>) { setForm((current) => ({ ...current, chapters: current.chapters.map((item) => item.clientId === id ? { ...item, ...patch } : item) })); }
  function updateLine(chapterId: string, lineId: string, patch: Partial<Line>) { setForm((current) => ({ ...current, chapters: current.chapters.map((chapter) => chapter.clientId === chapterId ? { ...chapter, lines: chapter.lines.map((line) => line.clientId === lineId ? { ...line, ...patch } : line) } : chapter) })); }
  function addLine(chapterId: string) { updateChapter(chapterId, { lines: [...(form.chapters.find((item) => item.clientId === chapterId)?.lines ?? []), emptyLine()] }); }
  function removeChapter(id: string) { setForm((current) => ({ ...current, chapters: current.chapters.filter((item) => item.clientId !== id && item.parentClientId !== id) })); }
  function editQuote(quote: QuoteRow) { setForm({ ...quote, chapters: quote.chapters.map((chapter: any) => ({ ...chapter, clientId: chapter.id, parentClientId: chapter.parentId, lines: chapter.lines.map((line: any) => ({ ...line, clientId: line.id, sourceReference: line.sourceReference ?? "", priceListItemId: line.priceListItemId ?? "", code: line.code ?? "" })) })) }); setTab("quote"); window.scrollTo({ top: 0, behavior: "smooth" }); }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const data = await api("/api/preventivi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          chapters: form.chapters.map((chapter, sortOrder) => ({
            ...chapter,
            sortOrder,
            lines: chapter.lines.map((line, lineOrder) => ({ ...line, sortOrder: lineOrder })),
          })),
        }),
      });
      setForm(emptyQuote());
      setMessage(`Preventivo ${data.quote.number} salvato e opportunità aperta.`);
      await loadQuotes();
    }
    catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non riuscito"); } finally { setSaving(false); }
  }
  async function duplicate(id: string) { try { const data = await api(`/api/preventivi/${id}/duplicate`, { method: "POST" }); await loadQuotes(); editQuote(data.quote); setMessage("Copia creata in bozza: puoi modificarla e salvarla."); } catch (e) { setError(e instanceof Error ? e.message : "Duplicazione non riuscita"); } }
  async function changeOpportunity(id: string, status: string) { try { await api(`/api/opportunita/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); await loadQuotes(); setMessage(status === "APPROVED" ? "Opportunità approvata e commessa creata." : "Stato opportunità aggiornato."); } catch (e) { setError(e instanceof Error ? e.message : "Aggiornamento non riuscito"); } }

  return <div className="quotes-page">
    <section className="card quotes-shell">
      <div className="mobile-section-header"><div><p className="dashboard-kicker">GiGEST</p><h1 className="mobile-section-title">Preventivi</h1><p className="mobile-section-subtitle">Componi offerte per capitoli e gestisci il passaggio da opportunità a commessa.</p></div></div>
      <div className="quotes-tabs"><button className={tab === "quote" ? "active" : ""} onClick={() => setTab("quote")}>Nuovo Preventivo</button><button className={tab === "opportunities" ? "active" : ""} onClick={() => setTab("opportunities")}>Opportunità</button></div>
      {message && <div className="job-dashboard-success">{message}</div>}{error && <div className="job-dashboard-error">{error}</div>}

      {tab === "quote" ? <>
        <div className="quotes-form-grid">
          <label><span>Titolo / nome futura commessa *</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
          <label><span>Cliente *</span><input value={form.customerName} onChange={(e) => setForm({ ...form, customerName: e.target.value })} /></label>
          <label><span>Contatto cliente</span><input value={form.customerContact} onChange={(e) => setForm({ ...form, customerContact: e.target.value })} /></label>
          <label><span>Indirizzo cantiere</span><input value={form.siteAddress} onChange={(e) => setForm({ ...form, siteAddress: e.target.value })} /></label>
          <label><span>Inizio previsto</span><input type="date" value={form.plannedStartDate} onChange={(e) => setForm({ ...form, plannedStartDate: e.target.value })} /></label>
          <label><span>Fine prevista</span><input type="date" value={form.plannedEndDate} onChange={(e) => setForm({ ...form, plannedEndDate: e.target.value })} /></label>
          <label className="wide"><span>Descrizione</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="quotes-checkbox"><input type="checkbox" checked={form.isOwnAccountSite} onChange={(e) => setForm({ ...form, isOwnAccountSite: e.target.checked })} /><span>Cantiere conto proprio</span></label>
        </div>

        <div className="quotes-toolbar"><button className="mobile-button-secondary" onClick={() => setForm((current) => ({ ...current, chapters: [...current.chapters, { clientId: uid(), parentClientId: null, title: "Nuovo macro capitolo", description: "", lines: [] }] }))}>+ Macro capitolo</button><span>{options.priceListVersion ? `${options.priceListVersion.name}: ${options.priceListVersion.itemCount.toLocaleString("it-IT")} voci` : "Listino non ancora inizializzato"}</span></div>
        <div className="quote-chapters">{form.chapters.map((chapter) => <section key={chapter.clientId} className={`quote-chapter ${chapter.parentClientId ? "sub" : ""}`}>
          <div className="quote-chapter-head"><input value={chapter.title} onChange={(e) => updateChapter(chapter.clientId, { title: e.target.value })} /><div>{!chapter.parentClientId && <button onClick={() => setForm((current) => ({ ...current, chapters: [...current.chapters, { clientId: uid(), parentClientId: chapter.clientId, title: "Nuovo sottocapitolo", description: "", lines: [] }] }))}>+ Sottocapitolo</button>}<button onClick={() => addLine(chapter.clientId)}>+ Voce</button><button className="danger" onClick={() => removeChapter(chapter.clientId)}>Rimuovi</button></div></div>
          {chapter.lines.map((line) => <div className="quote-line" key={line.clientId}>
            <select value={line.sourceType} onChange={(e) => updateLine(chapter.clientId, line.clientId, { sourceType: e.target.value as SourceType, sourceReference: "", priceListItemId: "", code: "", description: "", unit: e.target.value === "PERSON_ROLE" || e.target.value === "EQUIPMENT" ? "h" : "a corpo", unitPrice: 0 })}><option value="PERSON_ROLE">Ruolo personale</option><option value="EQUIPMENT">Mezzo / attrezzatura</option><option value="PRICE_LIST">Listino edilizia</option><option value="FREE">Voce libera</option></select>
            {line.sourceType === "PERSON_ROLE" && <select value={line.sourceReference} onChange={(e) => { const role = options.roles.find((item) => item.role === e.target.value); updateLine(chapter.clientId, line.clientId, { sourceReference: e.target.value, description: e.target.value, unit: "h", unitPrice: role?.hourlyCost ?? 0 }); }}><option value="">Seleziona ruolo</option>{options.roles.map((item) => <option key={item.role}>{item.role}</option>)}</select>}
            {line.sourceType === "EQUIPMENT" && <select value={line.sourceReference} onChange={(e) => { const item = options.equipment.find((x) => x.id === e.target.value); updateLine(chapter.clientId, line.clientId, { sourceReference: e.target.value, description: item?.name ?? "", unit: "h", unitPrice: item?.hourlyCost ?? 0 }); }}><option value="">Seleziona mezzo</option>{options.equipment.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
            {line.sourceType === "PRICE_LIST" && <div className="price-search"><input placeholder="Cerca codice o descrizione..." value={search} onChange={(e) => setSearch(e.target.value)} /><select value={line.priceListItemId} onChange={(e) => { const item = options.priceItems.find((x) => x.id === e.target.value); if (item) updateLine(chapter.clientId, line.clientId, { priceListItemId: item.id, sourceReference: item.id, code: item.code, description: item.description, unit: item.unit || "a corpo", unitPrice: item.price }); }}><option value="">Seleziona tra i risultati</option>{options.priceItems.map((item) => <option key={item.id} value={item.id}>{item.code} - {item.description.slice(0, 80)}</option>)}</select></div>}
            <input className="description" placeholder="Descrizione editabile" value={line.description} onChange={(e) => updateLine(chapter.clientId, line.clientId, { description: e.target.value })} />
            <input list="quote-units" aria-label="Unità di misura" value={line.unit} onChange={(e) => updateLine(chapter.clientId, line.clientId, { unit: e.target.value })} /><input type="number" min="0" step="0.001" aria-label="Quantità" value={line.quantity} onChange={(e) => updateLine(chapter.clientId, line.clientId, { quantity: Number(e.target.value) })} /><input type="number" min="0" step="0.01" aria-label="Prezzo" value={line.unitPrice} onChange={(e) => updateLine(chapter.clientId, line.clientId, { unitPrice: Number(e.target.value) })} /><input type="number" min="0" max="100" step="0.01" aria-label="Sconto percentuale" value={line.discountPercent} onChange={(e) => updateLine(chapter.clientId, line.clientId, { discountPercent: Number(e.target.value) })} /><strong>{money(line.quantity * line.unitPrice * (1 - line.discountPercent / 100))}</strong><button className="quote-line-remove" onClick={() => updateChapter(chapter.clientId, { lines: chapter.lines.filter((item) => item.clientId !== line.clientId) })}>×</button>
          </div>)}
        </section>)}</div>
        <datalist id="quote-units">{units.map((unit) => <option key={unit} value={unit} />)}</datalist>
        <div className="quote-totals"><label>Sconto generale % <input type="number" min="0" max="100" step="0.01" value={form.generalDiscountPercent} onChange={(e) => setForm({ ...form, generalDiscountPercent: Number(e.target.value) })} /></label><div><span>Lordo {money(totals.gross)}</span><span>Sconti voci -{money(totals.lineDiscount)}</span><span>Sconto generale -{money(totals.general)}</span><strong>Totale {money(totals.total)}</strong></div></div>
        <div className="quotes-save"><button className="mobile-button-secondary" onClick={() => setForm(emptyQuote())}>Nuovo / azzera</button><button className="button" disabled={saving} onClick={save}>{saving ? "Salvataggio..." : form.id ? "Salva modifiche" : "Salva preventivo e crea opportunità"}</button></div>

        <h2 className="quotes-section-title">Preventivi salvati</h2><div className="saved-quotes">{quotes.map((quote) => <article key={quote.id}><div><strong>{quote.number} · {quote.title}</strong><span>{quote.customerName} · {money(quote.totals.total)}</span></div><div><button onClick={() => editQuote(quote)}>Modifica</button><button onClick={() => duplicate(quote.id)}>Duplica</button><a href={`/api/preventivi/${quote.id}/export/pdf`}>PDF</a><a href={`/api/preventivi/${quote.id}/export/excel`}>Excel</a></div></article>)}</div>
      </> : <div className="opportunities-table-wrap"><table className="opportunities-table"><thead><tr><th>Preventivo</th><th>Cliente</th><th>Valore</th><th>Stato</th><th>Commessa</th></tr></thead><tbody>{quotes.filter((quote) => quote.opportunity).map((quote) => <tr key={quote.opportunity!.id}><td><button className="text-link" onClick={() => editQuote(quote)}>{quote.number} · {quote.title}</button></td><td>{quote.customerName}</td><td>{money(quote.totals.total)}</td><td><select value={quote.opportunity!.status} onChange={(e) => changeOpportunity(quote.opportunity!.id, e.target.value)}><option value="OPEN">Aperta</option><option value="SUSPENDED">Sospesa</option><option value="CLOSED">Chiusa</option><option value="APPROVED">Approvata</option></select></td><td>{quote.opportunity!.jobOrder ? <Link href={`/commesse/${quote.opportunity!.jobOrder.id}`}>{quote.opportunity!.jobOrder.name}</Link> : "-"}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
