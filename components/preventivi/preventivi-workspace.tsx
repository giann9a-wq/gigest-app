"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type SourceType = "PERSON_ROLE" | "EQUIPMENT" | "PRICE_LIST" | "FREE";
type Line = { clientId: string; sourceType: SourceType; sourceReference: string; priceListItemId: string; code: string; description: string; unit: string; quantity: number; unitPrice: number; discountPercent: number };
type Chapter = { clientId: string; parentClientId: string | null; title: string; description: string; lines: Line[] };
type TextSection = { clientId: string; title: string; content: string };
type QuoteForm = { id?: string; number?: string; title: string; customerName: string; customerContact: string; siteAddress: string; description: string; plannedStartDate: string; plannedEndDate: string; isOwnAccountSite: boolean; generalDiscountPercent: number; textSections: TextSection[]; chapters: Chapter[] };
type Options = { roles: Array<{ role: string; hourlyCost: number }>; equipment: Array<{ id: string; name: string; hourlyCost: number }>; priceListVersion: { id: string; name: string; itemCount: number } | null };
type PriceItem = { id: string; code: string; description: string; unit: string; price: number; sourceFile: string; category: string };
type PricePickerTarget = { chapterId: string; lineId: string };
type QuoteRow = QuoteForm & { id: string; number: string; status: string; updatedAt: string; totals: { gross: number; lineDiscounts: number; generalDiscount: number; total: number }; opportunity?: { id: string; status: string; notes?: string | null; jobOrder?: { id: string; name: string } | null } | null };

const units = ["m", "h", "m²", "m³", "kg", "cad", "a corpo"];
const uid = () => Math.random().toString(36).slice(2, 10);
const emptyLine = (sourceType: SourceType = "FREE"): Line => ({ clientId: uid(), sourceType, sourceReference: "", priceListItemId: "", code: "", description: "", unit: sourceType === "PERSON_ROLE" || sourceType === "EQUIPMENT" ? "h" : "a corpo", quantity: 1, unitPrice: 0, discountPercent: 0 });
const defaultTextSections = (): TextSection[] => [
  { clientId: uid(), title: "Note all'offerta", content: "" },
  { clientId: uid(), title: "Tempistiche e fasi di lavoro", content: "" },
  { clientId: uid(), title: "Modalità di pagamento", content: "" },
  { clientId: uid(), title: "Esclusioni", content: "" },
];
const emptyQuote = (): QuoteForm => ({ title: "", customerName: "", customerContact: "", siteAddress: "", description: "", plannedStartDate: "", plannedEndDate: "", isOwnAccountSite: false, generalDiscountPercent: 0, textSections: defaultTextSections(), chapters: [{ clientId: uid(), parentClientId: null, title: "Lavorazioni", description: "", lines: [] }] });
const money = (value: number) => {
  const safeValue = Number.isFinite(value) ? value : 0;
  const sign = safeValue < 0 ? "-" : "";
  const [integerPart, decimalPart] = Math.abs(safeValue).toFixed(2).split(".");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sign}${groupedInteger},${decimalPart} €`;
};

async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options); const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Operazione non riuscita"); return data;
}

export function PreventiviWorkspace() {
  const [tab, setTab] = useState<"quote" | "opportunities">("quote");
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [form, setForm] = useState<QuoteForm>(emptyQuote());
  const [options, setOptions] = useState<Options>({ roles: [], equipment: [], priceListVersion: null });
  const [pricePickerTarget, setPricePickerTarget] = useState<PricePickerTarget | null>(null);
  const [priceQuery, setPriceQuery] = useState("");
  const [priceResults, setPriceResults] = useState<PriceItem[]>([]);
  const [priceTotal, setPriceTotal] = useState(0);
  const [pricePage, setPricePage] = useState(0);
  const [priceHasMore, setPriceHasMore] = useState(false);
  const [priceLoading, setPriceLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadQuotes() { const data = await api("/api/preventivi"); setQuotes(data.rows); }
  async function loadOptions() { const data = await api("/api/preventivi/options"); setOptions(data); }
  useEffect(() => { Promise.all([loadQuotes(), loadOptions()]).catch((e) => setError(e.message)); }, []);
  useEffect(() => {
    if (!pricePickerTarget) return;
    const query = priceQuery.trim();
    if (query.length < 2) {
      setPriceResults([]);
      setPriceTotal(0);
      setPriceHasMore(false);
      return;
    }
    setPriceResults([]);
    setPriceTotal(0);
    setPricePage(0);
    setPriceHasMore(false);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setPriceLoading(true);
      try {
        const response = await fetch(`/api/preventivi/listino?q=${encodeURIComponent(query)}&page=0&pageSize=100`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Ricerca listino non riuscita");
        setPriceResults(data.rows);
        setPriceTotal(data.total);
        setPricePage(0);
        setPriceHasMore(data.hasMore);
      } catch (searchError) {
        if (!(searchError instanceof DOMException && searchError.name === "AbortError")) {
          setError(searchError instanceof Error ? searchError.message : "Ricerca listino non riuscita");
        }
      } finally {
        if (!controller.signal.aborted) setPriceLoading(false);
      }
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [pricePickerTarget, priceQuery]);
  useEffect(() => {
    if (!pricePickerTarget) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPricePickerTarget(null);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [pricePickerTarget]);

  const totals = useMemo(() => {
    let gross = 0, afterLines = 0;
    for (const chapter of form.chapters) for (const line of chapter.lines) { const row = Number(line.quantity) * Number(line.unitPrice); gross += row; afterLines += row * (1 - Number(line.discountPercent) / 100); }
    return { gross, lineDiscount: gross - afterLines, general: afterLines * Number(form.generalDiscountPercent) / 100, total: afterLines * (1 - Number(form.generalDiscountPercent) / 100) };
  }, [form]);

  function updateChapter(id: string, patch: Partial<Chapter>) { setForm((current) => ({ ...current, chapters: current.chapters.map((item) => item.clientId === id ? { ...item, ...patch } : item) })); }
  function updateLine(chapterId: string, lineId: string, patch: Partial<Line>) { setForm((current) => ({ ...current, chapters: current.chapters.map((chapter) => chapter.clientId === chapterId ? { ...chapter, lines: chapter.lines.map((line) => line.clientId === lineId ? { ...line, ...patch } : line) } : chapter) })); }
  function updateTextSection(id: string, patch: Partial<TextSection>) { setForm((current) => ({ ...current, textSections: current.textSections.map((section) => section.clientId === id ? { ...section, ...patch } : section) })); }
  function moveTextSection(id: string, direction: -1 | 1) {
    setForm((current) => {
      const index = current.textSections.findIndex((section) => section.clientId === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.textSections.length) return current;
      const textSections = [...current.textSections];
      [textSections[index], textSections[target]] = [textSections[target], textSections[index]];
      return { ...current, textSections };
    });
  }
  function addLine(chapterId: string) { updateChapter(chapterId, { lines: [...(form.chapters.find((item) => item.clientId === chapterId)?.lines ?? []), emptyLine()] }); }
  function removeChapter(id: string) { setForm((current) => ({ ...current, chapters: current.chapters.filter((item) => item.clientId !== id && item.parentClientId !== id) })); }
  function editQuote(quote: QuoteRow) { setForm({ ...quote, textSections: quote.textSections?.length ? quote.textSections.map((section: any) => ({ ...section, clientId: section.id })) : defaultTextSections(), chapters: quote.chapters.map((chapter: any) => ({ ...chapter, clientId: chapter.id, parentClientId: chapter.parentId, lines: chapter.lines.map((line: any) => ({ ...line, clientId: line.id, sourceReference: line.sourceReference ?? "", priceListItemId: line.priceListItemId ?? "", code: line.code ?? "" })) })) }); setTab("quote"); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function openPricePicker(chapterId: string, line: Line) {
    setPricePickerTarget({ chapterId, lineId: line.clientId });
    setPriceQuery(line.code || "");
    setPriceResults([]);
    setPriceTotal(0);
    setPricePage(0);
    setPriceHasMore(false);
  }

  async function loadMorePriceItems() {
    if (!pricePickerTarget || priceLoading || !priceHasMore) return;
    const nextPage = pricePage + 1;
    setPriceLoading(true);
    try {
      const data = await api(`/api/preventivi/listino?q=${encodeURIComponent(priceQuery.trim())}&page=${nextPage}&pageSize=100`);
      setPriceResults((current) => [...current, ...data.rows]);
      setPricePage(nextPage);
      setPriceHasMore(data.hasMore);
      setPriceTotal(data.total);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Caricamento risultati non riuscito");
    } finally {
      setPriceLoading(false);
    }
  }

  function selectPriceItem(item: PriceItem) {
    if (!pricePickerTarget) return;
    updateLine(pricePickerTarget.chapterId, pricePickerTarget.lineId, {
      priceListItemId: item.id,
      sourceReference: item.id,
      code: item.code,
      description: item.description,
      unit: item.unit || "a corpo",
      unitPrice: item.price,
    });
    setPricePickerTarget(null);
  }

  async function save() {
    setSaving(true); setError(""); setMessage("");
    try {
      const data = await api("/api/preventivi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          textSections: form.textSections.map((section, sortOrder) => ({ ...section, sortOrder })),
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
          <label className="wide"><span>Introduzione / oggetto dei lavori</span><textarea placeholder="Testo introduttivo che comparirà nella lettera di offerta" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
          <label className="quotes-checkbox"><input type="checkbox" checked={form.isOwnAccountSite} onChange={(e) => setForm({ ...form, isOwnAccountSite: e.target.checked })} /><span>Cantiere conto proprio</span></label>
        </div>

        <div className="quotes-toolbar"><button className="mobile-button-secondary" onClick={() => setForm((current) => ({ ...current, chapters: [...current.chapters, { clientId: uid(), parentClientId: null, title: "Nuovo macro capitolo", description: "", lines: [] }] }))}>+ Macro capitolo</button><span>{options.priceListVersion ? `${options.priceListVersion.name}: ${options.priceListVersion.itemCount.toLocaleString("it-IT")} voci` : "Listino non ancora inizializzato"}</span></div>
        <div className="quote-chapters">{form.chapters.map((chapter) => <section key={chapter.clientId} className={`quote-chapter ${chapter.parentClientId ? "sub" : ""}`}>
          <div className="quote-chapter-head"><input value={chapter.title} onChange={(e) => updateChapter(chapter.clientId, { title: e.target.value })} /><div>{!chapter.parentClientId && <button onClick={() => setForm((current) => ({ ...current, chapters: [...current.chapters, { clientId: uid(), parentClientId: chapter.clientId, title: "Nuovo sottocapitolo", description: "", lines: [] }] }))}>+ Sottocapitolo</button>}<button onClick={() => addLine(chapter.clientId)}>+ Voce</button><button className="danger" onClick={() => removeChapter(chapter.clientId)}>Rimuovi</button></div></div>
          {chapter.lines.map((line) => <div className="quote-line" key={line.clientId}>
            <label className="quote-line-field quote-line-source">
              <span>Origine voce</span>
              <select value={line.sourceType} onChange={(e) => updateLine(chapter.clientId, line.clientId, { sourceType: e.target.value as SourceType, sourceReference: "", priceListItemId: "", code: "", description: "", unit: e.target.value === "PERSON_ROLE" || e.target.value === "EQUIPMENT" ? "h" : "a corpo", unitPrice: 0 })}><option value="PERSON_ROLE">Ruolo personale</option><option value="EQUIPMENT">Mezzo / attrezzatura</option><option value="PRICE_LIST">Listino edilizia</option><option value="FREE">Voce libera</option></select>
            </label>
            {line.sourceType === "PERSON_ROLE" && <label className="quote-line-field quote-line-selector"><span>Ruolo</span><select value={line.sourceReference} onChange={(e) => { const role = options.roles.find((item) => item.role === e.target.value); updateLine(chapter.clientId, line.clientId, { sourceReference: e.target.value, description: e.target.value, unit: "h", unitPrice: role?.hourlyCost ?? 0 }); }}><option value="">Seleziona ruolo</option>{options.roles.map((item) => <option key={item.role}>{item.role}</option>)}</select></label>}
            {line.sourceType === "EQUIPMENT" && <label className="quote-line-field quote-line-selector"><span>Mezzo o attrezzatura</span><select value={line.sourceReference} onChange={(e) => { const item = options.equipment.find((x) => x.id === e.target.value); updateLine(chapter.clientId, line.clientId, { sourceReference: e.target.value, description: item?.name ?? "", unit: "h", unitPrice: item?.hourlyCost ?? 0 }); }}><option value="">Seleziona mezzo</option>{options.equipment.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
            {line.sourceType === "PRICE_LIST" && <div className="quote-line-field quote-line-selector"><span>Voce di listino</span><button type="button" className="price-list-open-picker" onClick={() => openPricePicker(chapter.clientId, line)}><strong>{line.code || "Cerca nel listino"}</strong><span>{line.priceListItemId ? "Cambia voce selezionata" : "Apri ricerca completa"}</span></button></div>}
            {line.sourceType === "FREE" && <div className="quote-line-field quote-line-selector"><span>Compilazione</span><div className="quote-line-free-note">Inserimento manuale</div></div>}
            <label className="quote-line-field quote-line-description">
              <span>Descrizione voce (editabile)</span>
              <textarea rows={3} placeholder="Descrizione completa della lavorazione o risorsa" value={line.description} onChange={(e) => updateLine(chapter.clientId, line.clientId, { description: e.target.value })} />
            </label>
            <label className="quote-line-field quote-line-unit"><span>U.M.</span><input list="quote-units" value={line.unit} onChange={(e) => updateLine(chapter.clientId, line.clientId, { unit: e.target.value })} /></label>
            <label className="quote-line-field quote-line-quantity"><span>Quantità</span><input type="number" min="0" step="0.001" value={line.quantity} onChange={(e) => updateLine(chapter.clientId, line.clientId, { quantity: Number(e.target.value) })} /></label>
            <label className="quote-line-field quote-line-price"><span>Prezzo unitario (€)</span><input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(chapter.clientId, line.clientId, { unitPrice: Number(e.target.value) })} /></label>
            <label className="quote-line-field quote-line-discount"><span>Sconto (%)</span><input type="number" min="0" max="100" step="0.01" value={line.discountPercent} onChange={(e) => updateLine(chapter.clientId, line.clientId, { discountPercent: Number(e.target.value) })} /></label>
            <div className="quote-line-field quote-line-total"><span>Totale netto</span><strong>{money(line.quantity * line.unitPrice * (1 - line.discountPercent / 100))}</strong></div>
            <button type="button" className="quote-line-remove" aria-label="Rimuovi voce" title="Rimuovi voce" onClick={() => updateChapter(chapter.clientId, { lines: chapter.lines.filter((item) => item.clientId !== line.clientId) })}>×</button>
          </div>)}
        </section>)}</div>
        <datalist id="quote-units">{units.map((unit) => <option key={unit} value={unit} />)}</datalist>
        <div className="quote-totals"><label>Sconto generale % <input type="number" min="0" max="100" step="0.01" value={form.generalDiscountPercent} onChange={(e) => setForm({ ...form, generalDiscountPercent: Number(e.target.value) })} /></label><div><span>Lordo {money(totals.gross)}</span><span>Sconti voci -{money(totals.lineDiscount)}</span><span>Sconto generale -{money(totals.general)}</span><strong>Totale {money(totals.total)}</strong></div></div>

        <section className="quote-text-sections">
          <div className="quote-text-sections-head">
            <div><h2>Testi e condizioni dell'offerta</h2><p>Aggiungi e ordina liberamente note, tempi, condizioni, esclusioni, allegati o altri capitoli testuali.</p></div>
            <button type="button" className="mobile-button-secondary" onClick={() => setForm((current) => ({ ...current, textSections: [...current.textSections, { clientId: uid(), title: "Nuova sezione", content: "" }] }))}>+ Sezione testuale</button>
          </div>
          <div className="quote-text-sections-list">{form.textSections.map((section, index) => <article key={section.clientId} className="quote-text-section">
            <div className="quote-text-section-title">
              <label><span>Titolo della sezione</span><input value={section.title} onChange={(event) => updateTextSection(section.clientId, { title: event.target.value })} /></label>
              <div>
                <button type="button" disabled={index === 0} aria-label="Sposta sezione in alto" title="Sposta in alto" onClick={() => moveTextSection(section.clientId, -1)}>↑</button>
                <button type="button" disabled={index === form.textSections.length - 1} aria-label="Sposta sezione in basso" title="Sposta in basso" onClick={() => moveTextSection(section.clientId, 1)}>↓</button>
                <button type="button" className="danger" onClick={() => setForm((current) => ({ ...current, textSections: current.textSections.filter((item) => item.clientId !== section.clientId) }))}>Rimuovi</button>
              </div>
            </div>
            <label><span>Testo</span><textarea rows={5} placeholder="Scrivi il contenuto della sezione. Gli elenchi possono essere inseriti una voce per riga." value={section.content} onChange={(event) => updateTextSection(section.clientId, { content: event.target.value })} /></label>
          </article>)}</div>
        </section>
        <div className="quotes-save"><button className="mobile-button-secondary" onClick={() => setForm(emptyQuote())}>Nuovo / azzera</button><button className="button" disabled={saving} onClick={save}>{saving ? "Salvataggio..." : form.id ? "Salva modifiche" : "Salva preventivo e crea opportunità"}</button></div>

        <h2 className="quotes-section-title">Preventivi salvati</h2><div className="saved-quotes">{quotes.map((quote) => <article key={quote.id}><div><strong>{quote.number} · {quote.title}</strong><span>{quote.customerName} · {money(quote.totals.total)}</span></div><div><button onClick={() => editQuote(quote)}>Modifica</button><button onClick={() => duplicate(quote.id)}>Duplica</button><a href={`/api/preventivi/${quote.id}/export/pdf`}>PDF</a><a href={`/api/preventivi/${quote.id}/export/excel`}>Excel</a></div></article>)}</div>
      </> : <div className="opportunities-table-wrap"><table className="opportunities-table"><thead><tr><th>Preventivo</th><th>Cliente</th><th>Valore</th><th>Stato</th><th>Commessa</th></tr></thead><tbody>{quotes.filter((quote) => quote.opportunity).map((quote) => <tr key={quote.opportunity!.id}><td><button className="text-link" onClick={() => editQuote(quote)}>{quote.number} · {quote.title}</button></td><td>{quote.customerName}</td><td>{money(quote.totals.total)}</td><td><select value={quote.opportunity!.status} onChange={(e) => changeOpportunity(quote.opportunity!.id, e.target.value)}><option value="OPEN">Aperta</option><option value="SUSPENDED">Sospesa</option><option value="CLOSED">Chiusa</option><option value="APPROVED">Approvata</option></select></td><td>{quote.opportunity!.jobOrder ? <Link href={`/commesse/${quote.opportunity!.jobOrder.id}`}>{quote.opportunity!.jobOrder.name}</Link> : "-"}</td></tr>)}</tbody></table></div>}
    </section>
    {pricePickerTarget ? <div className="price-list-picker-backdrop" onMouseDown={() => setPricePickerTarget(null)}>
      <div className="price-list-picker-modal" role="dialog" aria-modal="true" aria-labelledby="price-list-picker-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="price-list-picker-header">
          <div>
            <p>Prezzario edilizia</p>
            <h2 id="price-list-picker-title">Cerca e seleziona una voce</h2>
          </div>
          <button type="button" aria-label="Chiudi ricerca listino" onClick={() => setPricePickerTarget(null)}>×</button>
        </header>
        <div className="price-list-picker-search">
          <label htmlFor="price-list-picker-query">Codice o parole della descrizione</label>
          <input id="price-list-picker-query" autoFocus value={priceQuery} onChange={(event) => setPriceQuery(event.target.value)} placeholder="Esempio: ponteggio, calcestruzzo C25, LOM261..." />
          <span>
            {priceQuery.trim().length < 2
              ? "Inserisci almeno 2 caratteri."
              : priceLoading && priceResults.length === 0
                ? "Ricerca in corso..."
                : `${priceTotal.toLocaleString("it-IT")} risultati trovati`}
          </span>
        </div>
        <div
          className="price-list-picker-results"
          onScroll={(event) => {
            const element = event.currentTarget;
            if (element.scrollHeight - element.scrollTop - element.clientHeight < 180) void loadMorePriceItems();
          }}
        >
          {priceQuery.trim().length >= 2 && !priceLoading && priceResults.length === 0 ? <div className="price-list-picker-empty">Nessuna voce corrisponde alla ricerca.</div> : null}
          {priceResults.map((item) => <article key={item.id} className="price-list-picker-row">
            <div className="price-list-picker-row-head">
              <strong>{item.code}</strong>
              <div><span>U.M. {item.unit || "-"}</span><strong>{money(item.price)}</strong></div>
            </div>
            <p>{item.description}</p>
            <div className="price-list-picker-row-foot">
              <span>{item.category || "Voce di listino"}</span>
              <button type="button" onClick={() => selectPriceItem(item)}>Usa questa voce</button>
            </div>
          </article>)}
          {priceLoading && priceResults.length > 0 ? <div className="price-list-picker-loading">Caricamento di altri risultati...</div> : null}
        </div>
        <footer className="price-list-picker-footer">
          <span>Visualizzati {priceResults.length.toLocaleString("it-IT")} di {priceTotal.toLocaleString("it-IT")}</span>
          {priceHasMore ? <button type="button" disabled={priceLoading} onClick={() => void loadMorePriceItems()}>{priceLoading ? "Caricamento..." : "Carica altri risultati"}</button> : null}
        </footer>
      </div>
    </div> : null}
  </div>;
}
