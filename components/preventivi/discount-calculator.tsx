"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { PreventiviTabs } from "@/components/layout/preventivi-tabs";
import { advanceDays, calculateSimulation, defaultSimulation, financialRate, simulationSchema, type SimulationInput } from "@/lib/discount-calculator";
import { formatCurrency, formatPercent } from "@/lib/number-format";
import { AmountInput } from "./amount-input";

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
const simulationHref = (id: string) => `/preventivi/calcolatore-sconti/${encodeURIComponent(id)}` as Route;
export function DiscountCalculator({ simulationId }: { simulationId?: string }) {
  const router = useRouter();
  const detail = Boolean(simulationId);
  const [editing, setEditing] = useState(!simulationId);
  const [form, setForm] = useState<Draft>({ ...defaultSimulation(), advances: [] });
  const [saved, setSaved] = useState<Saved[]>([]);
  const [current, setCurrent] = useState<Saved | null>(null);
  const editor = useRef<HTMLDetailsElement>(null);
  const [page, setPage] = useState(1);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function refresh() { const data = await api("/api/preventivi/simulazioni"); setSaved(data.rows); }
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setCurrent(null); setDirty(false); setEditing(!simulationId);
    const request = simulationId ? api(`/api/preventivi/simulazioni/${encodeURIComponent(simulationId)}`) : api("/api/preventivi/simulazioni");
    request.then(data => { if (active) { if (simulationId) hydrate(data.simulation); else setSaved(data.rows); } })
      .catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [simulationId]);
  const validation = useMemo(() => simulationSchema.safeParse(form), [form]);
  const result = useMemo(() => validation.success ? calculateSimulation(validation.data) : null, [validation]);
  const euribor = Number(String(form.euribor).replace(",", ".")), spread = Number(String(form.spread).replace(",", "."));
  const bankRate = String(form.euribor).trim() && String(form.spread).trim() && Number.isFinite(euribor) && Number.isFinite(spread) && euribor >= -100 && euribor <= 100 && spread >= 0 && spread <= 100 ? financialRate(euribor, spread) : null;
  const ordered = form.advances.map((row, index) => ({ ...row, index })).sort((a, b) => a.date.localeCompare(b.date));
  const pageSize = 25;
  const pages = Math.max(1, Math.ceil(saved.length / pageSize));
  const currentPage = Math.min(page, pages);
  const visibleSimulations = saved.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  function update(patch: Partial<Draft>) { setForm(value => ({ ...value, ...patch })); setDirty(true); setMessage(""); }
  function updateRow(key: string, patch: Partial<Draft["advances"][number]>) { update({ advances: form.advances.map(row => row.key === key ? { ...row, ...patch } : row) }); }
  function canReplace() { return !dirty || window.confirm("Ci sono modifiche non salvate. Vuoi abbandonarle?"); }
  function hydrate(row: Saved) { setForm(draft(row)); setCurrent(row); setDirty(false); }
  function newSimulation() {
    if (!canReplace()) return;
    setForm(draft(defaultSimulation())); setCurrent(null); setDirty(false); setError(""); setMessage("");
    if (editor.current) editor.current.open = true;
  }
  function openSimulation(row: Saved) {
    if (!canReplace()) return;
    router.push(simulationHref(row.id));
  }
  async function duplicateSimulation(row: Saved) {
    if (!canReplace()) return;
    await run(async () => {
      const original = await api(`/api/preventivi/simulazioni/${row.id}`);
      const body = { ...original.simulation, name: `${original.simulation.name.slice(0, 152)} (copia)` };
      const data = await api("/api/preventivi/simulazioni", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      router.push(simulationHref(data.simulation.id));
    });
  }
  async function removeSimulation(row: Saved) {
    if (!window.confirm(`Eliminare la simulazione “${row.name}”?`)) return;
    await run(async () => {
      await api(`/api/preventivi/simulazioni/${row.id}`, { method: "DELETE" });
      const remaining = await api("/api/preventivi/simulazioni"); setSaved(remaining.rows);
      setPage(Math.min(currentPage, Math.max(1, Math.ceil(remaining.rows.length / pageSize))));
      setMessage("Simulazione eliminata.");
    });
  }
  async function run(action: () => Promise<void>) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Operazione non riuscita."); } finally { setBusy(false); }
  }
  function cancelEditing() {
    setError(""); setMessage(""); setDirty(false);
    if (detail && current) { setForm(draft(current)); setEditing(false); }
    else { setForm(draft(defaultSimulation())); setCurrent(null); if (editor.current) editor.current.open = false; }
  }
  async function save() {
    if (!validation.success) return;
    await run(async () => {
      const data = await api(detail && current ? `/api/preventivi/simulazioni/${current.id}` : "/api/preventivi/simulazioni", { method: detail && current ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validation.data) });
      if (detail) { hydrate(data.simulation); setEditing(false); }
      else { setForm(draft(defaultSimulation())); setCurrent(null); setDirty(false); await refresh(); setPage(1); if (editor.current) editor.current.open = false; }
      setMessage("Simulazione salvata.");
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
  const editorContent = <>
      <div className="discount-toolbar">
        {detail && !editing ? <>
          <button type="button" className="button" disabled={busy} onClick={() => setEditing(true)}>Modifica</button>
          <button type="button" className="mobile-button-secondary" disabled={busy || !current} onClick={() => { if (current) void duplicateSimulation(current); }}>Duplica</button>
        </> : <>
          <button type="button" className="button" disabled={busy || !validation.success} onClick={() => void save()}>{detail ? "Salva modifiche" : "Salva"}</button>
          <button type="button" className="mobile-button-secondary" disabled={busy} onClick={cancelEditing}>Annulla</button>
        </>}
        <button type="button" className="mobile-button-secondary" disabled={busy || !validation.success} onClick={() => void download()}>Scarica Excel</button>
      </div>
    <fieldset disabled={busy || (detail && !editing)} className="discount-fieldset">
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
          return <tr key={row.key}><td data-label="N.">{position + 1}</td><td data-label="Data acconto"><input aria-label={`Data acconto ${position + 1}`} aria-invalid={issues.some(issue => issue.path[2] === "date")} type="date" max={form.closingDate} value={row.date} onChange={e => updateRow(row.key, { date: e.target.value })} /></td><td data-label="Importo (€)"><AmountInput aria-label={`Importo acconto ${position + 1}`} aria-invalid={issues.some(issue => issue.path[2] === "amount")} value={row.amount} onValueChange={amount => updateRow(row.key, { amount })} /></td><td data-label="Giorni di anticipo">{days ?? "—"}</td><td data-label="Interessi risparmiati">{result ? formatCurrency(result.rows[position].interest) : "—"}</td><td data-label="Azioni"><button type="button" className="mobile-button-secondary" aria-label={`Elimina acconto ${position + 1}`} onClick={() => update({ advances: form.advances.filter(item => item.key !== row.key) })}>Elimina</button></td></tr>;
        })}
      </tbody></table>{!ordered.length && <p className="quotes-empty">Nessun acconto. Aggiungi un versamento per simulare il beneficio.</p>}</div>
      <div className="discount-totals"><span>Totale acconti <strong>{result ? formatCurrency(result.total) : "—"}</strong></span><span>Saldo prima dello sconto <strong>{result ? formatCurrency(result.initialBalance) : "—"}</strong></span></div>
      {!validation.success && <div className="discount-errors" role="alert"><strong>Correggi i dati per calcolare e salvare:</strong><ul>{validation.error.issues.map((issue, index) => <li key={index}>{issue.path[0] === "advances" && typeof issue.path[1] === "number" ? `Acconto ${ordered.findIndex(row => row.index === issue.path[1]) + 1}: ` : `${({ price: "Prezzo", closingDate: "Rogito", euribor: "Euribor", spread: "Spread", guaranteeRate: "Fideiussione", customerShare: "Quota cliente", name: "Nome", reference: "Riferimento" } as Record<string, string>)[String(issue.path[0])] ?? "Piano acconti"}: `}{issue.message}</li>)}</ul></div>}
      <div className="discount-share"><label htmlFor="customer-share">Beneficio riconosciuto all’acquirente (%)</label><input aria-label="Quota beneficio cliente" type="range" min="0" max="100" step="1" value={Number(form.customerShare) || 0} onChange={e => update({ customerShare: e.target.value })} /><input id="customer-share" type="number" min="0" max="100" step="1" value={form.customerShare} onChange={e => update({ customerShare: e.target.value })} /></div>
    </fieldset>
    <div className="discount-kpis" aria-live="polite">
      {[{ label: "Interessi risparmiati", value: result?.interest }, { label: "Costo fideiussione", value: result?.guarantee, detail: result?.firstDate ? `${result.guaranteeDays} giorni dal ${dateLabel(result.firstDate)}` : "Nessun acconto" }, { label: "Beneficio netto", value: result?.benefit, detail: result ? `${formatPercent(result.benefitPercent)} del prezzo` : "", negative: result && result.benefit < 0 }, { label: "Sconto concedibile", value: result?.discount, detail: result ? `${formatPercent(result.discountPercent)} del prezzo` : "", highlight: true }, { label: "Prezzo finale scontato", value: result?.finalPrice }, { label: "Saldo al rogito", value: result?.balance }].map(kpi => <div key={kpi.label} className={`discount-kpi ${kpi.highlight ? "discount-kpi-highlight" : ""} ${kpi.negative ? "discount-kpi-negative" : ""}`}><span>{kpi.label}</span><strong>{kpi.value === undefined ? "—" : formatCurrency(kpi.value)}</strong>{kpi.detail && <small>{kpi.detail}</small>}</div>)}
    </div>
    {result && <div className="discount-totals"><span>Sconto massimo teorico <strong>{formatCurrency(result.theoretical)}</strong></span><span>Sconto proposto dalla quota <strong>{formatCurrency(result.proposed)}</strong></span><span>Beneficio trattenuto <strong>{formatCurrency(result.retained)}</strong></span></div>}
    {result?.capped && <p className="discount-note">Lo sconto concedibile è limitato al saldo disponibile prima dello sconto per evitare un saldo negativo.</p>}
    {result && result.benefit < 0 && <p className="discount-note">Il costo della fideiussione supera il risparmio: nessuno sconto concedibile.</p>}
    <p className="discount-note">La fideiussione è sostenuta integralmente al primo acconto sull’intero piano, inclusi i versamenti futuri. Il modello non include il costo finanziario dell’anticipo del premio.</p>
  </>;
  return <div className="quotes-page"><section className="card quotes-shell discount-shell">
    <div className="mobile-section-header quotes-page-header"><div><p className="dashboard-kicker">GiGEST · Preventivi</p><h1 className="mobile-section-title">{detail ? current?.name ?? "Simulazione" : "Calcolatore Sconti"}</h1><p className="mobile-section-subtitle">{detail ? "Dettaglio della simulazione salvata." : "Simula il beneficio degli acconti e lo sconto sostenibile sulla vendita."}</p></div>{detail && <Link className="mobile-button-secondary" href="/preventivi/calcolatore-sconti" onClick={event => { if (busy || !canReplace()) event.preventDefault(); }}>← Torna alle simulazioni</Link>}</div>
    <PreventiviTabs current="calculator" />
    {error && <p className="discount-errors" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {detail ? loading ? <p role="status">Caricamento simulazione…</p> : current && <div className="discount-detail">{editorContent}</div> : <details ref={editor} className="discount-editor">
      <summary><strong>Nuova simulazione</strong><span>Parametri, piano acconti e risultati</span></summary>
      <div className="discount-editor-body">{editorContent}</div>
    </details>}
    {!detail && <section className="discount-history" aria-labelledby="discount-history-title" aria-busy={loading || busy}>
      <div className="discount-section-heading"><h2 id="discount-history-title">Simulazioni create</h2><button type="button" className="mobile-button-secondary" disabled={busy} onClick={newSimulation}>+ Nuova simulazione</button></div>
      <div className="quotes-history-table-wrap discount-history-wrap">
        <table className="quotes-history-table discount-history-table"><thead><tr><th>Simulazione</th><th>Prezzo appartamento</th><th>Rogito</th><th>Creata</th><th>Aggiornata</th><th>Azioni</th></tr></thead><tbody>
          {visibleSimulations.map(row => <tr key={row.id} className="discount-history-row" tabIndex={busy ? -1 : 0} title={`Visualizza ${row.name}`} onClick={() => { if (!busy) openSimulation(row); }} onKeyDown={event => { if (!busy && event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openSimulation(row); } }}>
            <td data-label="Simulazione"><Link href={simulationHref(row.id)} prefetch={false} onClick={event => { event.stopPropagation(); if (busy || (!event.ctrlKey && !event.metaKey && !canReplace())) event.preventDefault(); }}><strong>{row.name}</strong></Link>{row.reference && <span>{row.reference}</span>}</td>
            <td data-label="Prezzo appartamento">{formatCurrency(Number(row.price))}</td>
            <td data-label="Rogito">{dateLabel(row.closingDate)}</td>
            <td data-label="Creata">{timestamp(row.createdAt)}</td>
            <td data-label="Aggiornata">{timestamp(row.updatedAt)}</td>
            <td data-label="Azioni" onClick={event => event.stopPropagation()}><div className="quotes-history-actions"><button type="button" disabled={busy} aria-label={`Duplica ${row.name}`} onClick={() => void duplicateSimulation(row)}>Duplica</button><button type="button" className="danger" disabled={busy} aria-label={`Elimina ${row.name}`} onClick={() => void removeSimulation(row)}>Elimina</button></div></td>
          </tr>)}
        </tbody></table>
        {loading ? <p className="quotes-empty" role="status">Caricamento simulazioni…</p> : !saved.length && <p className="quotes-empty">Non ci sono ancora simulazioni salvate.</p>}
      </div>
      <nav className="discount-pagination" aria-label="Paginazione simulazioni">
        <span aria-live="polite">{saved.length ? `${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, saved.length)} di ${saved.length} simulazioni` : "0 simulazioni"}</span>
        <div><button type="button" className="mobile-button-secondary" disabled={busy || loading || currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Precedente</button><span>Pagina {currentPage} di {pages}</span><button type="button" className="mobile-button-secondary" disabled={busy || loading || currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Successiva</button></div>
      </nav>
    </section>}
  </section></div>;
}
