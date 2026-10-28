"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import type { SalesView } from "@/lib/property-sales";
import { SalesSummary, SalesTable } from "@/components/sales/sales-summary";
import { salesFetch } from "@/components/sales/sales-client";
import { formatCurrency } from "@/lib/number-format";

type InstallmentForm = { id?: string; description: string; dueDate: string; amount: string; advanceId?: string | null };
type SaleForm = { id?: string; updatedAt?: string; unitId: string; customerRecordId: string; customerName: string; customerContact: string; agreedPrice: string; saleDate: string; installments: InstallmentForm[] };
function emptySale(): SaleForm { return { unitId: "", customerRecordId: "", customerName: "", customerContact: "", agreedPrice: "", saleDate: new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date()), installments: [] }; }
export function SalesManagementPanel({ initialJobOrderId = "" }: { initialJobOrderId?: string }) {
  const [jobs, setJobs] = useState<{ id: string; name: string; status: string }[]>([]);
  const [jobId, setJobId] = useState(initialJobOrderId);
  const [view, setView] = useState<SalesView | null>(null);
  const [form, setForm] = useState<SaleForm>(emptySale);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => { salesFetch<{ jobOrders: typeof jobs }>("/api/admin/vendite").then(data => setJobs(data.jobOrders)).catch(error => setError(error.message)); }, []);
  useEffect(() => {
    let live = true; setView(null); setForm(emptySale()); setError(""); setMessage("");
    if (!jobId) return;
    setLoading(true);
    salesFetch<SalesView | null>(`/api/admin/vendite?jobOrderId=${encodeURIComponent(jobId)}`)
      .then(data => { if (live) setView(data); }).catch(error => { if (live) setError(error.message); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [jobId]);
  async function refresh() { setView(await salesFetch<SalesView>(`/api/admin/vendite?jobOrderId=${encodeURIComponent(jobId)}`)); }
  async function action(work: () => Promise<unknown>, text: string, reset = true) {
    setBusy(true); setError(""); setMessage("");
    try { await work(); if (reset) setForm(emptySale()); await refresh(); setMessage(text); }
    catch (error) { setError(error instanceof Error ? error.message : "Errore server"); } finally { setBusy(false); }
  }
  function edit(unit: SalesView["units"][number]) {
    if (!unit.sale) return;
    setForm({ id: unit.sale.id, updatedAt: unit.sale.updatedAt, unitId: unit.id, customerRecordId: unit.sale.customerRecordId ?? "new", customerName: unit.sale.customerName, customerContact: "",
      agreedPrice: String(unit.sale.agreedPrice), saleDate: unit.sale.saleDate,
      installments: unit.sale.installments.map(row => ({ id: row.id, description: row.description, dueDate: row.dueDate, amount: String(row.amount), advanceId: row.advanceId })) });
  }
  const plannedTotal = form.installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return <div className="sales-panel">
    <label className="sales-job-picker">Commessa con listino<select value={jobId} disabled={busy} onChange={e => setJobId(e.target.value)}><option value="">Seleziona commessa</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.name}{job.status === "COMPLETED" ? " (Conclusa)" : ""}</option>)}</select></label>
    {!jobs.length && <p className="muted">Abilita il listino nella scheda di una commessa per registrare le vendite.</p>}
    {error && <div role="alert" className="job-dashboard-error">{error}</div>}{message && <div role="status" className="job-dashboard-success">{message}</div>}
    {loading && <p>Caricamento vendite…</p>}
    {view && <><SalesSummary view={view} /><SalesTable view={view} />
      <form className="sales-form" onSubmit={event => { event.preventDefault(); action(() => salesFetch("/api/admin/vendite", { method: "POST", body: JSON.stringify({ ...form, customerRecordId: form.customerRecordId && form.customerRecordId !== "new" ? form.customerRecordId : null, createCustomer: form.customerRecordId === "new" }) }), "Vendita, cliente e scadenze salvati. Il fascicolo cliente è disponibile nella scheda commessa."); }}>
        <fieldset disabled={busy}><legend>{form.id ? "Modifica vendita" : "Registra vendita"}</legend><div className="sales-fields">
          <label>Unità immobiliare<select required disabled={!!form.id} value={form.unitId} onChange={e => { const unit = view.units.find(row => row.id === e.target.value); setForm({ ...form, unitId: e.target.value, agreedPrice: unit ? String(unit.listPrice) : "" }); }}><option value="">Seleziona unità</option>{view.units.filter(row => !row.sale || row.id === form.unitId).map(unit => <option key={unit.id} value={unit.id}>{unit.code} · {formatCurrency(unit.listPrice)}</option>)}</select></label>
          <label>Cliente<select aria-label="Cliente della vendita" required value={form.customerRecordId} onChange={e => { const customer = view.customers.find(c => c.id === e.target.value); setForm({ ...form, customerRecordId: e.target.value, customerName: customer?.name ?? "", customerContact: "" }); }}><option value="">Seleziona cliente</option>{view.customers.map(c => <option key={c.id} value={c.id} disabled={c.status === "CLOSED" && c.id !== view.units.find(u => u.id === form.unitId)?.sale?.customerRecordId}>{c.name}{c.unitCodes.length ? ` · ${c.unitCodes.join(", ")}` : ""}{c.status === "CLOSED" ? " · pratica chiusa" : ""}</option>)}<option value="new">+ Inserisci nuovo cliente</option></select></label>
          {form.customerRecordId === "new" && <><label>Nome nuovo cliente / intestatari<input required maxLength={200} value={form.customerName} onChange={e => setForm({ ...form, customerName: e.target.value })} /></label><label>Referenti e contatti cliente<textarea rows={2} maxLength={2000} value={form.customerContact} onChange={e => setForm({ ...form, customerContact: e.target.value })} /></label></>}
          <label>Valore di vendita concordato (€)<input type="number" required min="0.01" step="0.01" value={form.agreedPrice} onChange={e => setForm({ ...form, agreedPrice: e.target.value })} /></label>
          <label>Data accordo<input type="date" required value={form.saleDate} onChange={e => setForm({ ...form, saleDate: e.target.value })} /></label>
        </div>
        <p className="muted">Al salvataggio il cliente viene collegato all’unità e al suo fascicolo nella commessa. Per appartamento e box dello stesso cliente seleziona la stessa pratica.</p>
        {form.id && <p className="muted">Se cambi acquirente, scegli un’altra pratica o inserisci un nuovo cliente: documenti e richieste precedenti restano nel fascicolo originario.</p>}
        <h3>Scaletta acconti</h3><p className="muted">Ogni rata genera una scadenza. L’approvazione crea l’acconto attivo in Gestione Acconti.</p>
        {form.installments.some(row => row.advanceId) && <p className="muted">Puoi correggere la data degli acconti approvati: si aggiorna anche l’acconto già generato, mantenendo l’approvazione.</p>}
        {form.installments.map((row, index) => <div key={row.id ?? `new-${index}`} className="sales-installment-row">
          <label>Descrizione<input required disabled={!!row.advanceId} maxLength={200} value={row.description} onChange={e => setForm({ ...form, installments: form.installments.map((item, i) => i === index ? { ...item, description: e.target.value } : item) })} /></label>
          <label>Scadenza<input type="date" required value={row.dueDate} onChange={e => setForm({ ...form, installments: form.installments.map((item, i) => i === index ? { ...item, dueDate: e.target.value } : item) })} /></label>
          <label>Importo (€)<input type="number" min="0.01" step="0.01" required disabled={!!row.advanceId} value={row.amount} onChange={e => setForm({ ...form, installments: form.installments.map((item, i) => i === index ? { ...item, amount: e.target.value } : item) })} /></label>
          {row.advanceId ? <span>Approvato</span> : <button type="button" className="mobile-button-secondary" onClick={() => setForm({ ...form, installments: form.installments.filter((_, i) => i !== index) })}>Rimuovi</button>}
        </div>)}
        <div className="sales-actions"><button type="button" className="mobile-button-secondary" onClick={() => setForm({ ...form, installments: [...form.installments, { description: `Acconto ${form.installments.length + 1}`, dueDate: "", amount: "" }] })}>Aggiungi acconto</button><span>Totale pianificato: {formatCurrency(plannedTotal)} · Saldo non pianificato: {formatCurrency((Number(form.agreedPrice) || 0) - plannedTotal)}</span></div>
        <div className="sales-actions"><button className="button">Salva vendita</button>{form.id && <button type="button" className="mobile-button-secondary" onClick={() => setForm(emptySale())}>Annulla modifica</button>}</div>
        </fieldset>
      </form>
      <h2>Vendite e approvazione acconti</h2>
      {!view.units.some(row => row.sale) && <p>Nessuna vendita registrata.</p>}
      {view.units.filter(unit => unit.sale).map(unit => { const sale = unit.sale!; return <details key={unit.id} className="sales-sale" open>
        <summary><strong>{unit.code} · {sale.customerName}</strong><span>{formatCurrency(sale.agreedPrice)}</span></summary>
        <div className="sales-actions"><button type="button" disabled={busy} className="mobile-button-secondary" onClick={() => edit(unit)}>Modifica vendita</button>
        {sale.customerRecordId && <Link className="text-link" href={`/commesse/${jobId}?tab=clients&unitId=${unit.id}` as Route}>Apri fascicolo cliente →</Link>}
        {!sale.installments.some(row => row.advanceId) && <button type="button" disabled={busy} className="mobile-button-secondary" onClick={() => { if (window.confirm("Annullare la vendita e rimuovere le scadenze? L'unità tornerà disponibile.")) action(() => salesFetch(`/api/admin/vendite?saleId=${encodeURIComponent(sale.id)}`, { method: "DELETE" }), "Vendita annullata."); }}>Annulla vendita</button>}</div>
        {!sale.installments.length && <p className="muted">Nessun acconto pianificato.</p>}
        {sale.installments.map(row => <div key={row.id} className="sales-approval-row"><span><strong>{row.description}</strong> · {new Date(`${row.dueDate}T12:00:00Z`).toLocaleDateString("it-IT")} · {formatCurrency(row.amount)}</span>
          {row.advanceId ? <span>{row.isActive ? "Approvato · acconto attivo" : "Approvato · acconto spento"}</span> : <button type="button" className="button" disabled={busy} onClick={() => action(() => salesFetch(`/api/admin/vendite/acconti/${row.id}/approva`, { method: "POST" }), "Acconto approvato e aggiunto ai ricavi.")}>Approva e genera acconto</button>}
        </div>)}
      </details>; })}
    </>}
  </div>;
}
