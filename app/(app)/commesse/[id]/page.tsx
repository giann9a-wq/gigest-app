"use client";
import { useEffect, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import type { JobOrderDashboardResponse } from "@/components/dashboard/job-dashboard-view";
import { PriceListPanel } from "@/components/sales/price-list-panel";
import { JobOrderDossierPanel } from "@/components/sales/job-order-dossier-panel";
import { salesFetch } from "@/components/sales/sales-client";
import { formatCurrency, formatPercent } from "@/lib/number-format";

type Tab = "data" | "budget" | "list" | "clients" | "technical";
type Sheet = JobOrderDashboardResponse & { jobOrder: JobOrderDashboardResponse["jobOrder"] & {
  salesPriceListEnabled: boolean; budgetRevenueSource: string; manualExpectedRevenue: number; clientDossierEnabled: boolean; technicalBookEnabled: boolean;
} };
type DataForm = { name: string; type: string; status: string; isOwnAccountSite: boolean; startDate: string; endDate: string; description: string; customerName: string; customerContact: string; siteAddress: string };
type Budget = { personnel: string; equipment: string; materials: string; professionalServices: string; thirdPartyServices: string; misc: string; revenue: string };
const types: Record<string, string> = { SITE: "Cantiere", OTHER: "Altro", TRAINING: "Formazione", LEAVE: "Ferie", SICKNESS: "Malattia", RAIN: "Pioggia", NATIONAL_HOLIDAY: "Festività nazionale" };
const statuses: Record<string, string> = { ACTIVE: "Attiva", SUSPENDED: "Sospesa", COMPLETED: "Conclusa", ENDED: "Estinta" };
const categories = [{ key: "personnel", label: "Utilizzo personale" }, { key: "equipment", label: "Mezzi e attrezzature" }, { key: "materials", label: "Materie prime" }, { key: "professionalServices", label: "Prestazioni professionali" }, { key: "thirdPartyServices", label: "Prestazioni terzi" }, { key: "misc", label: "Spese varie" }] as const;
const tabs: { id: Tab; label: string }[] = [{ id: "data", label: "Dati Commessa" }, { id: "budget", label: "Budget" }, { id: "list", label: "Listino" }, { id: "clients", label: "Clienti" }, { id: "technical", label: "Libretto immobile" }];
const inputAmount = (value: number) => value ? value.toFixed(2) : "";
const dataFrom = (d: Sheet): DataForm => ({ name: d.jobOrder.name, type: d.jobOrder.type, status: d.jobOrder.status, isOwnAccountSite: d.jobOrder.isOwnAccountSite, startDate: d.jobOrder.startDate, endDate: d.jobOrder.endDate, description: d.jobOrder.description, customerName: d.jobOrder.customerName, customerContact: d.jobOrder.customerContact, siteAddress: d.jobOrder.siteAddress });
const budgetFrom = (d: Sheet): Budget => ({ personnel: inputAmount(d.budget.personnel), equipment: inputAmount(d.budget.equipment), materials: inputAmount(d.budget.materials), professionalServices: inputAmount(d.budget.professionalServices), thirdPartyServices: inputAmount(d.budget.thirdPartyServices), misc: inputAmount(d.budget.misc), revenue: inputAmount(d.jobOrder.manualExpectedRevenue) });

export default function SchedaCommessaPage() {
  const { id } = useParams<{ id: string }>(); const router = useRouter(); const search = useSearchParams();
  const requestedTab = search.get("tab"); const tab: Tab = tabs.some(t => t.id === requestedTab) ? requestedTab as Tab : "data";
  const from2 = search.get("from") === "commesse2";
  const requestedReturn = search.get("returnTo");
  const back = from2 ? (requestedReturn === "/commesse2" || requestedReturn?.startsWith("/commesse2?") ? requestedReturn : "/commesse2") : "/commesse";
  const [sheet, setSheet] = useState<Sheet | null>(null); const [form, setForm] = useState<DataForm | null>(null);
  const [budget, setBudget] = useState<Budget | null>(null); const [source, setSource] = useState("MANUAL");
  const [dirtyData, setDirtyData] = useState(false); const [dirtyBudget, setDirtyBudget] = useState(false); const [dirtyDossier, setDirtyDossier] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [message, setMessage] = useState("");
  const [showModules, setShowModules] = useState(false);
  const dirty = dirtyData || dirtyBudget || dirtyDossier;
  async function refresh() { const next = await salesFetch<Sheet>(`/api/commesse/${id}`); setSheet(next); return next; }
  useEffect(() => { let active = true; salesFetch<Sheet>(`/api/commesse/${id}`).then(next => { if (!active) return; setSheet(next); setForm(dataFrom(next)); setBudget(budgetFrom(next)); setSource(next.jobOrder.budgetRevenueSource); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, [id]);
  useEffect(() => { const leave = (event: BeforeUnloadEvent) => { if (dirty) event.preventDefault(); }; window.addEventListener("beforeunload", leave); return () => window.removeEventListener("beforeunload", leave); }, [dirty]);
  function mayLeave() { return !dirty || window.confirm("Ci sono modifiche non salvate. Vuoi abbandonarle?"); }
  function navigate(url: string) { if (mayLeave()) router.push(url as Route); }
  function changeTab(next: Tab) {
    if (busy || next === tab) return;
    if (dirtyDossier && !window.confirm("Ci sono modifiche al fascicolo non salvate. Vuoi abbandonarle?")) return;
    setDirtyDossier(false); setMessage("");
    const query = new URLSearchParams(search.toString()); query.set("tab", next);
    router.replace(`/commesse/${id}?${query}` as Route, { scroll: false });
  }
  async function save(section: "DATA" | "BUDGET") {
    if (!sheet || !form || !budget) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const body = section === "DATA" ? { section, updatedAt: sheet.jobOrder.updatedAt, ...form } : { section, updatedAt: sheet.jobOrder.updatedAt, budget, budgetRevenueSource: source };
      const next = await salesFetch<Sheet>(`/api/commesse/${id}`, { method: "PATCH", body: JSON.stringify(body) }); setSheet(next);
      if (section === "DATA") { setForm(dataFrom(next)); setDirtyData(false); } else { setBudget(budgetFrom(next)); setSource(next.jobOrder.budgetRevenueSource); setDirtyBudget(false); }
      setMessage(section === "DATA" ? "Dati commessa salvati." : "Budget salvato.");
    } catch (e) { setError(e instanceof Error ? e.message : "Salvataggio non riuscito"); } finally { setBusy(false); }
  }
  async function modules(clientDossierEnabled: boolean, technicalBookEnabled: boolean) {
    if (!sheet || dirtyDossier || busy) return;
    setBusy(true); setError(""); setMessage("");
    try { const next = await salesFetch<Sheet>(`/api/commesse/${id}`, { method: "PATCH", body: JSON.stringify({ section: "MODULES", updatedAt: sheet.jobOrder.updatedAt, clientDossierEnabled, technicalBookEnabled }) }); setSheet(next); setMessage("Moduli aggiornati. I dati già inseriti restano conservati."); }
    catch (e) { setError(e instanceof Error ? e.message : "Aggiornamento non riuscito"); } finally { setBusy(false); }
  }
  async function listEnabled(enabled: boolean) {
    if (!sheet || busy) return;
    setBusy(true); setError(""); setMessage("");
    try { await salesFetch(`/api/commesse/${id}/listino`, { method: "PATCH", body: JSON.stringify({ enabled }) }); const next = await refresh(); if (!enabled || !dirtyBudget) setSource(next.jobOrder.budgetRevenueSource); setMessage(enabled ? "Listino abilitato. Puoi scegliere nel Budget se usarlo per il fatturato previsto." : "Listino disabilitato. Ripristinata la previsione manuale conservata."); }
    catch (e) { setError(e instanceof Error ? e.message : "Aggiornamento non riuscito"); } finally { setBusy(false); }
  }
  function dataField<K extends keyof DataForm>(key: K, value: DataForm[K]) { setForm(current => current ? { ...current, [key]: value } : current); setDirtyData(true); }
  function budgetField(key: keyof Budget, value: string) { setBudget(current => current ? { ...current, [key]: value } : current); setDirtyBudget(true); }
  if (!sheet || !form || !budget) return <div className="card">{error || "Caricamento scheda commessa…"}</div>;
  const listTotal = sheet.sales?.listTotal ?? 0;
  const revenue = source === "LIST" && sheet.jobOrder.salesPriceListEnabled ? listTotal : Number(budget.revenue || 0);
  const costs = categories.reduce((sum, c) => sum + Number(budget[c.key] || 0), 0);
  const margin = revenue - costs;
  const visibleTabs = tabs.filter(t => t.id !== "clients" || sheet.jobOrder.clientDossierEnabled).filter(t => t.id !== "technical" || sheet.jobOrder.technicalBookEnabled);
  const activeTab = visibleTabs.some(t => t.id === tab) ? tab : "data";
  return <div className="job-sheet-page"><section className="card job-sheet-shell">
    <div className="job-sheet-topbar"><div><p className="job-dashboard-kicker">Scheda commessa</p><h1 className="job-dashboard-title">{sheet.jobOrder.name}</h1><p>{types[sheet.jobOrder.type]} · {statuses[sheet.jobOrder.status]}</p></div><div className="job-sheet-actions"><button className="button" type="button" onClick={() => navigate(`/dashboard-commessa?jobOrderId=${id}${from2 ? "&from=commesse2" : ""}`)}>Apri dashboard →</button><button className="mobile-button-secondary" type="button" onClick={() => setShowModules(!showModules)}>Moduli commessa</button><button className="mobile-button-secondary" type="button" onClick={() => navigate(back)}>Chiudi</button></div></div>
    {error && <div role="alert" className="job-dashboard-error">{error}<button className="mobile-button-secondary" onClick={() => { if (mayLeave()) window.location.reload(); }}>Ricarica scheda</button></div>}{message && <div role="status" className="job-dashboard-success">{message}</div>}
    {showModules && <section className="job-sheet-panel sheet-modules"><h2>Moduli facoltativi</h2><label><input type="checkbox" checked={sheet.jobOrder.clientDossierEnabled} disabled={busy || dirtyDossier} onChange={e => modules(e.target.checked, sheet.jobOrder.technicalBookEnabled)} />Fascicoli clienti</label><label><input type="checkbox" checked={sheet.jobOrder.technicalBookEnabled} disabled={busy || dirtyDossier} onChange={e => modules(sheet.jobOrder.clientDossierEnabled, e.target.checked)} />Libretto immobile</label><small>Disattivare un modulo nasconde le schede senza cancellare lo storico. Riattivalo per consultarle.</small></section>}
    <div className="job-order-tabs" role="tablist" aria-label="Scheda commessa">{visibleTabs.map(t => <button type="button" role="tab" id={`sheet-tab-${t.id}`} aria-controls={`sheet-panel-${t.id}`} aria-selected={activeTab === t.id} disabled={busy} key={t.id} className={`job-order-tab ${activeTab === t.id ? "job-order-tab-active" : ""}`} onClick={() => changeTab(t.id)}>{t.label}{t.id === "data" && dirtyData || t.id === "budget" && dirtyBudget ? " *" : ""}</button>)}</div>
    {activeTab === "data" && <section id="sheet-panel-data" role="tabpanel" aria-labelledby="sheet-tab-data" className="job-sheet-panel"><h2>Dati Commessa</h2><form onSubmit={e => { e.preventDefault(); save("DATA"); }}><fieldset disabled={busy}><div className="job-sheet-form-grid">
      <label className="job-sheet-field job-sheet-field-wide"><span>Commessa</span><input required maxLength={300} value={form.name} onChange={e => dataField("name", e.target.value)} /></label>
      <label className="job-sheet-field"><span>Tipologia</span><select value={form.type} onChange={e => dataField("type", e.target.value)}>{Object.entries(types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="job-sheet-field"><span>Stato</span><select value={form.status} onChange={e => dataField("status", e.target.value)}>{Object.entries(statuses).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label className="job-sheet-field"><span>Cantiere conto proprio</span><select value={form.isOwnAccountSite ? "yes" : "no"} onChange={e => dataField("isOwnAccountSite", e.target.value === "yes")}><option value="no">No</option><option value="yes">Sì</option></select></label>
      <label className="job-sheet-field"><span>Data inizio</span><input type="date" value={form.startDate} onChange={e => dataField("startDate", e.target.value)} /></label>
      <label className="job-sheet-field"><span>Data fine</span><input type="date" value={form.endDate} onChange={e => dataField("endDate", e.target.value)} /></label>
      <label className="job-sheet-field job-sheet-field-wide"><span>Descrizione</span><textarea rows={3} maxLength={10000} value={form.description} onChange={e => dataField("description", e.target.value)} /></label>
      <label className="job-sheet-field"><span>Cliente / committente</span><input maxLength={300} value={form.customerName} onChange={e => dataField("customerName", e.target.value)} /></label>
      <label className="job-sheet-field"><span>Contatto committente</span><input maxLength={1000} value={form.customerContact} onChange={e => dataField("customerContact", e.target.value)} /></label>
      <label className="job-sheet-field job-sheet-field-wide"><span>Indirizzo cantiere</span><input maxLength={1000} value={form.siteAddress} onChange={e => dataField("siteAddress", e.target.value)} /></label>
    </div><div className="job-dashboard-actions"><button className="button">{busy ? "Salvataggio…" : "Salva dati commessa"}</button></div></fieldset></form></section>}
    {activeTab === "budget" && <section id="sheet-panel-budget" role="tabpanel" aria-labelledby="sheet-tab-budget"><form onSubmit={e => { e.preventDefault(); save("BUDGET"); }}><fieldset disabled={busy}><div className="job-sheet-panel"><h2>Budget e Actual</h2><div className="job-premium-table-wrap"><table className="job-premium-summary-table sheet-budget-table"><thead><tr><th>Voce</th><th>Budget (€)</th><th>Actual (€)</th></tr></thead><tbody>{categories.map(c => <tr key={c.key}><td>{c.label}</td><td><input aria-label={`Budget ${c.label}`} type="number" min="0" max="9999999999.99" step="0.01" value={budget[c.key]} onChange={e => budgetField(c.key, e.target.value)} /></td><td>{formatCurrency(sheet.actual[c.key])}</td></tr>)}<tr><td>Fatturato previsto / ricavi actual</td><td>{source === "LIST" ? <strong>{sheet.sales?.units.length ? formatCurrency(revenue) : "Listino da compilare"}</strong> : <input aria-label="Fatturato previsto" type="number" min="0" max="9999999999.99" step="0.01" value={budget.revenue} onChange={e => budgetField("revenue", e.target.value)} />}</td><td>{formatCurrency(sheet.actual.revenue)}</td></tr></tbody></table></div>
      <div className="sheet-revenue-source"><label>Fonte del fatturato previsto<select value={source} onChange={e => { setSource(e.target.value); setDirtyBudget(true); }}><option value="MANUAL">Importo manuale</option><option value="LIST" disabled={!sheet.jobOrder.salesPriceListEnabled}>Totale prezzi di listino</option></select></label><p>{source === "LIST" ? `Previsione aggiornata dai prezzi delle unità. Importo manuale conservato: ${formatCurrency(sheet.jobOrder.manualExpectedRevenue)}.` : "Compila il fatturato previsto. Se abiliti il listino puoi scegliere di utilizzarne il totale."}</p></div><p className="sheet-source-note">Actual: personale e mezzi dal Diario; altre categorie da import costi; ricavi da fatture emesse e acconti attivi.</p></div>
      <div className="job-sheet-panel"><h2>Riepilogo</h2><div className="job-premium-table-wrap"><table className="job-premium-summary-table"><thead><tr><th>Indicatore</th><th>Budget</th><th>Actual</th></tr></thead><tbody><tr><th>Totale costi</th><td>{formatCurrency(costs)}</td><td>{formatCurrency(sheet.actual.totalCosts)}</td></tr><tr><th>Primo margine</th><td>{source === "LIST" && !sheet.sales?.units.length ? "Da completare" : formatCurrency(margin)}</td><td>{formatCurrency(sheet.actual.grossMargin)}</td></tr><tr><th>Margine %</th><td>{revenue ? formatPercent(margin / revenue * 100) : "—"}</td><td>{sheet.actual.revenue ? formatPercent(sheet.actual.grossMarginPct) : "—"}</td></tr></tbody></table></div><div className="sheet-summary-meta"><span>{sheet.jobOrder.activityCount} caricamenti collegati</span><span>Creata: {new Date(sheet.jobOrder.createdAt).toLocaleString("it-IT")}</span><span>Aggiornata: {new Date(sheet.jobOrder.updatedAt).toLocaleString("it-IT")}</span></div><button className="button" type="submit">{busy ? "Salvataggio…" : "Salva budget"}</button></div></fieldset></form></section>}
    {activeTab === "list" && <section id="sheet-panel-list" role="tabpanel" aria-labelledby="sheet-tab-list"><div className="job-sheet-panel"><h2>Listino</h2><label className="sales-enable"><input type="checkbox" disabled={busy} checked={sheet.jobOrder.salesPriceListEnabled} onChange={e => listEnabled(e.target.checked)} />Abilita listino appartamenti, box e vendite</label>{!sheet.jobOrder.salesPriceListEnabled && <p>Listino inattivo. Abilitalo per inserire le unità; nel Budget il fatturato può essere compilato manualmente.</p>}</div>{sheet.jobOrder.salesPriceListEnabled && <PriceListPanel jobOrderId={id} clientDossierEnabled={sheet.jobOrder.clientDossierEnabled} onOpenClient={unitId => { const query = new URLSearchParams(search.toString()); query.set("tab", "clients"); query.set("unitId", unitId); router.replace(`/commesse/${id}?${query}` as Route, { scroll: false }); }} onChanged={async () => { await refresh(); }} />}</section>}
    {activeTab === "clients" && <section id="sheet-panel-clients" role="tabpanel" aria-labelledby="sheet-tab-clients"><JobOrderDossierPanel key={`client-${id}`} jobOrderId={id} mode="client" unitId={search.get("unitId") ?? ""} onDirtyChange={setDirtyDossier} /></section>}
    {activeTab === "technical" && <section id="sheet-panel-technical" role="tabpanel" aria-labelledby="sheet-tab-technical"><JobOrderDossierPanel key={`technical-${id}`} jobOrderId={id} mode="technical" onDirtyChange={setDirtyDossier} /></section>}
    <div className="job-dashboard-actions"><button className="mobile-button-secondary" onClick={() => navigate(back)}>← Torna a Commesse{from2 ? "2" : ""}</button>{dirty && <span role="status">Modifiche non salvate</span>}</div>
  </section></div>;
}
