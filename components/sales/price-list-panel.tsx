"use client";
import { useEffect, useState } from "react";
import type { SalesView } from "@/lib/property-sales";
import { SalesSummary } from "./sales-summary";
import { salesFetch } from "./sales-client";
import { formatCurrency } from "@/lib/number-format";
const empty = { id: undefined as string | undefined, code: "", description: "", listPrice: "" };
export function PriceListPanel({ jobOrderId }: { jobOrderId: string }) {
  const [view, setView] = useState<SalesView | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const url = `/api/commesse/${jobOrderId}/listino`;
  async function load() { setView(await salesFetch<SalesView>(url)); }
  useEffect(() => { load().catch(error => setError(error.message)); }, [jobOrderId]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await salesFetch(url, { method: "POST", body: JSON.stringify(form) }); setForm(empty); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Errore salvataggio"); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!window.confirm("Eliminare l'unità dal listino?")) return;
    setBusy(true); setError("");
    try { await salesFetch(`${url}?unitId=${encodeURIComponent(id)}`, { method: "DELETE" }); await load(); }
    catch (error) { setError(error instanceof Error ? error.message : "Errore eliminazione"); } finally { setBusy(false); }
  }
  return <div className="sales-panel">
    <h2>Listino appartamenti e box</h2><p className="muted">Inserisci appartamenti e box con i rispettivi prezzi di listino. Le vendite si registrano in Admin → Vendite.</p>
    {error && <div role="alert" className="job-dashboard-error">{error}</div>}
    {view && <SalesSummary view={view} />}
    <form onSubmit={save} className="sales-form"><fieldset disabled={busy}>
      <legend>{form.id ? "Modifica unità" : "Nuova unità"}</legend>
      <div className="sales-fields">
        <label>Identificativo<input required maxLength={100} value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="Es. A1" /></label>
        <label>Descrizione<input maxLength={1000} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Piano, superficie, pertinenze…" /></label>
        <label>Prezzo di listino (€)<input required type="number" min="0.01" step="0.01" value={form.listPrice} onChange={e => setForm({ ...form, listPrice: e.target.value })} /></label>
      </div><div className="sales-actions"><button className="button">{form.id ? "Salva modifiche" : "Aggiungi unità"}</button>{form.id && <button type="button" className="mobile-button-secondary" onClick={() => setForm(empty)}>Annulla modifica</button>}</div>
    </fieldset></form>
    {view && <div className="sales-table-frame" role="region" aria-label="Listino modificabile scorribile" tabIndex={0}><table className="sales-table" aria-label="Modifica listino unità immobiliari"><thead><tr><th scope="col">Unità immobiliare</th><th scope="col">Descrizione</th><th scope="col" className="sales-table-money">Listino</th><th scope="col">Stato</th><th scope="col">Azioni</th></tr></thead><tbody>
      {!view.units.length && <tr><td colSpan={5} className="sales-table-empty">Nessuna unità inserita.</td></tr>}
      {view.units.map(unit => <tr key={unit.id}><td data-label="Unità immobiliare"><strong>{unit.code}</strong></td><td data-label="Descrizione">{unit.description || "—"}</td><td data-label="Listino" className="sales-table-money">{formatCurrency(unit.listPrice)}</td><td data-label="Stato"><div className="sales-table-cell"><span className={`sales-status ${unit.sale ? "sales-status-sold" : "sales-status-available"}`}>{unit.sale ? "Venduto" : "Disponibile"}</span>{unit.sale && <span className="sales-table-customer">{unit.sale.customerName}</span>}</div></td><td data-label="Azioni"><div className="sales-actions">
        <button type="button" disabled={busy} className="mobile-button-secondary" onClick={() => setForm({ id: unit.id, code: unit.code, description: unit.description, listPrice: String(unit.listPrice) })}>Modifica</button>
        {!unit.sale && <button type="button" disabled={busy} className="mobile-button-secondary" onClick={() => remove(unit.id)}>Elimina</button>}
      </div></td></tr>)}
    </tbody></table></div>}
  </div>;
}
