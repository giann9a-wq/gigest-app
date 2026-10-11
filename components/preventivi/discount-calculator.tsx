"use client";
import { useEffect, useMemo, useState } from "react";
import { PreventiviTabs } from "@/components/layout/preventivi-tabs";
import { advanceDays, calculateSimulation, defaultSimulation, financialRate, simulationSchema, type SimulationInput } from "@/lib/discount-calculator";
import { formatCurrency, formatPercent } from "@/lib/number-format";

type Saved = SimulationInput & { id: string; createdAt: string; updatedAt: string };
type Draft = Omit<SimulationInput, "advances"> & { advances: Array<SimulationInput["advances"][number] & { key: string }> };
const draft = (value: SimulationInput): Draft => ({ ...value, advances: value.advances.map(row => ({ ...row, key: crypto.randomUUID() })) });
const dateLabel = (date: string) => date.split("-").reverse().join("/");
const timestamp = (date: string) => new Intl.DateTimeFormat("it-IT", { dateStyle: "short", timeStyle: "short" }).format(new Date(date));
async function api(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Operazione non riuscita."); }
  return response.json();
}
export function DiscountCalculator() {
  const [form, setForm] = useState<Draft>({ ...defaultSimulation(), advances: [] });
  const [saved, setSaved] = useState<Saved[]>([]);
  const [current, setCurrent] = useState<Saved | null>(null);
  const [selected, setSelected] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function refresh() { const data = await api("/api/preventivi/simulazioni"); setSaved(data.rows); }
  useEffect(() => { refresh().catch(e => setError(e.message)).finally(() => setLoading(false)); }, []);
  const validation = useMemo(() => simulationSchema.safeParse(form), [form]);
  const result = useMemo(() => validation.success ? calculateSimulation(validation.data) : null, [validation]);
  const euribor = Number(String(form.euribor).replace(",", ".")), spread = Number(String(form.spread).replace(",", "."));
  const bankRate = String(form.euribor).trim() && String(form.spread).trim() && Number.isFinite(euribor) && Number.isFinite(spread) && euribor >= -100 && euribor <= 100 && spread >= 0 && spread <= 100 ? financialRate(euribor, spread) : null;
  const ordered = form.advances.map((row, index) => ({ ...row, index })).sort((a, b) => a.date.localeCompare(b.date));
  function update(patch: Partial<Draft>) { setForm(value => ({ ...value, ...patch })); setDirty(true); setMessage(""); }
  function updateRow(key: string, patch: Partial<Draft["advances"][number]>) { update({ advances: form.advances.map(row => row.key === key ? { ...row, ...patch } : row) }); }
  function canReplace() { return !dirty || window.confirm("Ci sono modifiche non salvate. Vuoi abbandonarle?"); }
  function hydrate(row: Saved) { setForm(draft(row)); setCurrent(row); setSelected(row.id); setDirty(false); }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Operazione non riuscita."); } finally { setBusy(false); }
  }
  async function save(copy = false) {
    if (!validation.success) return;
    await run(async () => {
      const body = { ...validation.data, name: copy ? `${validation.data.name.slice(0, 152)} (copia)` : validation.data.name };
      const data = await api(current && !copy ? `/api/preventivi/simulazioni/${current.id}` : "/api/preventivi/simulazioni", { method: current && !copy ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      hydrate(data.simulation); setMessage(copy ? "Simulazione duplicata e salvata." : "Simulazione salvata."); await refresh();
    });
  }
  async function download() {
    if (!validation.success) return;
    await run(async () => {
      const response = await fetch("/api/preventivi/simulazioni/export/excel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validation.data) });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "Esportazione non riuscita."); }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a"); link.href = url; link.download = "Calcolatore-sconti.xlsx"; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Excel scaricato con dati e formule modificabili.");
    });
  }
  const fields: Array<{ key: "price" | "euribor" | "spread" | "guaranteeRate"; label: string; min: number; max: number; step: string }> = [
    { key: "price", label: "Prezzo appartamento (€)", min: 0.01, max: 9999999999.99, step: "0.01" },
    { key: "euribor", label: "Euribor 3 mesi (%)", min: -100, max: 100, step: "0.001" },
    { key: "spread", label: "Spread bancario (%)", min: 0, max: 100, step: "0.001" },
    { key: "guaranteeRate", label: "Fideiussione annua (%)", min: 0, max: 100, step: "0.001" },
  ];
  return <div className="quotes-page"><section className="card quotes-shell discount-shell">
    <div className="mobile-section-header quotes-page-header"><div><p className="dashboard-kicker">GiGEST · Preventivi</p><h1 className="mobile-section-title">Calcolatore Sconti</h1><p className="mobile-section-subtitle">Simula il beneficio degli acconti e lo sconto sostenibile sulla vendita.</p></div></div>
    <PreventiviTabs current="calculator" />
    <fieldset disabled={busy} className="discount-fieldset">
      <div className="discount-toolbar">
        <button type="button" className="mobile-button-secondary" onClick={() => { if (canReplace()) { setForm(draft(defaultSimulation())); setCurrent(null); setSelected(""); setDirty(false); setError(""); setMessage(""); } }}>Nuova simulazione</button>
        <label className="discount-select">Simulazioni salvate<select value={selected} disabled={loading} onChange={e => setSelected(e.target.value)}><option value="">{loading ? "Caricamento…" : "Seleziona simulazione"}</option>{saved.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <button type="button" className="mobile-button-secondary" disabled={!selected} onClick={() => { if (canReplace()) void run(async () => { const data = await api(`/api/preventivi/simulazioni/${selected}`); hydrate(data.simulation); }); }}>Apri</button>
        <button type="button" className="button" disabled={!validation.success} onClick={() => void save()}>Salva</button>
        <button type="button" className="mobile-button-secondary" disabled={!validation.success} onClick={() => void save(true)}>Duplica</button>
        <button type="button" className="mobile-button-secondary" disabled={!current} onClick={() => { if (current && window.confirm(`Eliminare la simulazione “${current.name}”?`)) void run(async () => { await api(`/api/preventivi/simulazioni/${current.id}`, { method: "DELETE" }); setForm(draft(defaultSimulation())); setCurrent(null); setSelected(""); setDirty(false); await refresh(); setMessage("Simulazione eliminata."); }); }}>Elimina</button>
        <button type="button" className="mobile-button-secondary" disabled={!validation.success} onClick={() => void download()}>Scarica Excel</button>
      </div>
      <div className="discount-meta">{current ? `Creata ${timestamp(current.createdAt)} · Aggiornata ${timestamp(current.updatedAt)}` : "Simulazione non ancora salvata"}{dirty ? " · Modifiche non salvate" : ""}{busy ? " · Operazione in corso…" : ""}</div>
      <div className="discount-parameters">
        <label>Nome simulazione<input maxLength={160} value={form.name} onChange={e => update({ name: e.target.value })} /></label>
        <label>Riferimento appartamento / commessa<input maxLength={200} placeholder="Facoltativo" value={form.reference} onChange={e => update({ reference: e.target.value })} /></label>
        <label>Data rogito / saldo<input type="date" value={form.closingDate} onChange={e => update({ closingDate: e.target.value })} /></label>
        {fields.map(field => <label key={field.key}>{field.label}<input type="number" min={field.min} max={field.max} step={field.step} value={form[field.key]} onChange={e => update({ [field.key]: e.target.value })} /></label>)}
        <label>Tasso finanziario complessivo<output>{bankRate !== null ? `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 6 }).format(bankRate)} %` : "—"}</output></label>
      </div>
      <p className="discount-note">Euribor di simulazione, tasso costante e interesse semplice ACT/365. Nessuna modifica ai preventivi esistenti.</p>
      <div className="discount-section-heading"><h2>Piano acconti</h2><button type="button" className="mobile-button-secondary" disabled={form.advances.length >= 500} onClick={() => update({ advances: [...form.advances, { key: crypto.randomUUID(), date: form.closingDate, amount: "" }] })}>+ Aggiungi acconto</button></div>
      <div className="discount-table-wrap"><table className="discount-table"><thead><tr><th>N.</th><th>Data acconto</th><th>Importo (€)</th><th>Giorni di anticipo</th><th>Interessi risparmiati</th><th>Azioni</th></tr></thead><tbody>
        {ordered.map((row, position) => {
          const issues = validation.success ? [] : validation.error.issues.filter(issue => issue.path[0] === "advances" && issue.path[1] === row.index);
          let days: number | null = null;
          try { days = advanceDays(row.date, form.closingDate); } catch { /* Invalid dates remain unavailable. */ }
          return <tr key={row.key}><td data-label="N.">{position + 1}</td><td data-label="Data acconto"><input aria-label={`Data acconto ${position + 1}`} aria-invalid={issues.some(issue => issue.path[2] === "date")} type="date" max={form.closingDate} value={row.date} onChange={e => updateRow(row.key, { date: e.target.value })} /></td><td data-label="Importo (€)"><input aria-label={`Importo acconto ${position + 1}`} aria-invalid={issues.some(issue => issue.path[2] === "amount")} type="number" min="0.01" step="0.01" value={row.amount} onChange={e => updateRow(row.key, { amount: e.target.value })} /></td><td data-label="Giorni di anticipo">{days ?? "—"}</td><td data-label="Interessi risparmiati">{result ? formatCurrency(result.rows[position].interest) : "—"}</td><td data-label="Azioni"><button type="button" className="mobile-button-secondary" aria-label={`Elimina acconto ${position + 1}`} onClick={() => update({ advances: form.advances.filter(item => item.key !== row.key) })}>Elimina</button></td></tr>;
        })}
      </tbody></table>{!ordered.length && <p className="quotes-empty">Nessun acconto. Aggiungi un versamento per simulare il beneficio.</p>}</div>
      <div className="discount-totals"><span>Totale acconti <strong>{result ? formatCurrency(result.total) : "—"}</strong></span><span>Saldo prima dello sconto <strong>{result ? formatCurrency(result.initialBalance) : "—"}</strong></span></div>
      {!validation.success && <div className="discount-errors" role="alert"><strong>Correggi i dati per calcolare e salvare:</strong><ul>{validation.error.issues.map((issue, index) => <li key={index}>{issue.path[0] === "advances" && typeof issue.path[1] === "number" ? `Acconto ${ordered.findIndex(row => row.index === issue.path[1]) + 1}: ` : `${({ price: "Prezzo", closingDate: "Rogito", euribor: "Euribor", spread: "Spread", guaranteeRate: "Fideiussione", customerShare: "Quota cliente", name: "Nome", reference: "Riferimento" } as Record<string, string>)[String(issue.path[0])] ?? "Piano acconti"}: `}{issue.message}</li>)}</ul></div>}
      <div className="discount-share"><label htmlFor="customer-share">Beneficio riconosciuto all’acquirente (%)</label><input aria-label="Quota beneficio cliente" type="range" min="0" max="100" step="1" value={Number(form.customerShare) || 0} onChange={e => update({ customerShare: e.target.value })} /><input id="customer-share" type="number" min="0" max="100" step="1" value={form.customerShare} onChange={e => update({ customerShare: e.target.value })} /></div>
    </fieldset>
    {error && <p className="discount-errors" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    <div className="discount-kpis" aria-live="polite">
      {[{ label: "Interessi risparmiati", value: result?.interest }, { label: "Costo fideiussione", value: result?.guarantee, detail: result?.firstDate ? `${result.guaranteeDays} giorni dal ${dateLabel(result.firstDate)}` : "Nessun acconto" }, { label: "Beneficio netto", value: result?.benefit, detail: result ? `${formatPercent(result.benefitPercent)} del prezzo` : "", negative: result && result.benefit < 0 }, { label: "Sconto concedibile", value: result?.discount, detail: result ? `${formatPercent(result.discountPercent)} del prezzo` : "", highlight: true }, { label: "Prezzo finale scontato", value: result?.finalPrice }, { label: "Saldo al rogito", value: result?.balance }].map(kpi => <div key={kpi.label} className={`discount-kpi ${kpi.highlight ? "discount-kpi-highlight" : ""} ${kpi.negative ? "discount-kpi-negative" : ""}`}><span>{kpi.label}</span><strong>{kpi.value === undefined ? "—" : formatCurrency(kpi.value)}</strong>{kpi.detail && <small>{kpi.detail}</small>}</div>)}
    </div>
    {result && <div className="discount-totals"><span>Sconto massimo teorico <strong>{formatCurrency(result.theoretical)}</strong></span><span>Sconto proposto dalla quota <strong>{formatCurrency(result.proposed)}</strong></span><span>Beneficio trattenuto <strong>{formatCurrency(result.retained)}</strong></span></div>}
    {result?.capped && <p className="discount-note">Lo sconto concedibile è limitato al saldo disponibile prima dello sconto per evitare un saldo negativo.</p>}
    {result && result.benefit < 0 && <p className="discount-note">Il costo della fideiussione supera il risparmio: nessuno sconto concedibile.</p>}
    <p className="discount-note">La fideiussione è sostenuta integralmente al primo acconto sull’intero piano, inclusi i versamenti futuri. Il modello non include il costo finanziario dell’anticipo del premio.</p>
  </section></div>;
}
