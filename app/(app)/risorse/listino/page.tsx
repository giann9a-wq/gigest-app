"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { ResourceTabs } from "@/components/layout/resource-tabs";

type ItemKind = "PERSON_ROLE" | "EQUIPMENT";
type PriceItem = {
  id: string;
  kind: ItemKind;
  name: string;
  hourlyPrice: string;
  active: boolean;
  isRegistered: boolean;
};

async function jsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Errore server");
  return data;
}

function kindLabel(kind: ItemKind) {
  return kind === "PERSON_ROLE" ? "Ruolo personale" : "Mezzo / attrezzatura";
}

export default function ResourcePriceListPage() {
  const [rows, setRows] = useState<PriceItem[]>([]);
  const [activeKind, setActiveKind] = useState<ItemKind>("PERSON_ROLE");
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    try {
      const data = await jsonFetch("/api/risorse/listino");
      setRows(data.rows.map((row: Omit<PriceItem, "hourlyPrice"> & { hourlyPrice: number }) => ({
        ...row,
        hourlyPrice: String(row.hourlyPrice),
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento del listino");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadRows(); }, []);

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it-IT");
    return rows.filter((row) => row.kind === activeKind && (!needle || row.name.toLocaleLowerCase("it-IT").includes(needle)));
  }, [rows, activeKind, query]);

  function updateRow(id: string, patch: Partial<PriceItem>) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  async function savePriceList() {
    setSavingId("list"); setMessage(""); setError("");
    try {
      await jsonFetch("/api/risorse/listino", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: rows.map(({ id, name, hourlyPrice, active }) => ({ id, name, hourlyPrice, active })) }),
      });
      setMessage("Listino aggiornato.");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante il salvataggio");
    } finally { setSavingId(null); }
  }

  async function addItem(event: FormEvent) {
    event.preventDefault(); setSavingId("new"); setMessage(""); setError("");
    try {
      await jsonFetch("/api/risorse/listino", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: activeKind, name: newName, hourlyPrice: newPrice, active: true }),
      });
      setMessage(`${kindLabel(activeKind)} aggiunto al listino.`);
      setNewName(""); setNewPrice("");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l’inserimento");
    } finally { setSavingId(null); }
  }

  async function deleteItem(row: PriceItem) {
    if (!window.confirm(`Eliminare la voce “${row.name}”?`)) return;
    setSavingId(row.id); setMessage(""); setError("");
    try {
      await jsonFetch(`/api/risorse/listino?id=${encodeURIComponent(row.id)}`, { method: "DELETE" });
      setMessage("Voce eliminata dal listino.");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l’eliminazione");
    } finally { setSavingId(null); }
  }

  return (
    <div className="grid gap-4">
      <div className="card commesse-page-card">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Gestione Risorse</h1>
            <p className="resource-price-list-intro">Prezzi di vendita utilizzati nei preventivi, separati dai costi gestionali delle risorse.</p>
          </div>
        </div>

        <ResourceTabs current="price-list" />
        {message ? <div className="job-dashboard-success">{message}</div> : null}
        {error ? <div className="job-dashboard-error">{error}</div> : null}

        <div className="resource-price-kind-tabs" role="tablist" aria-label="Tipologia listino risorse">
          <button type="button" className={activeKind === "PERSON_ROLE" ? "active" : ""} onClick={() => { setActiveKind("PERSON_ROLE"); setQuery(""); }}>Ruoli personale</button>
          <button type="button" className={activeKind === "EQUIPMENT" ? "active" : ""} onClick={() => { setActiveKind("EQUIPMENT"); setQuery(""); }}>Mezzi e attrezzature</button>
        </div>

        <form className="resource-price-new-form" onSubmit={addItem}>
          <label className="report-control resource-price-name">
            <span>{activeKind === "PERSON_ROLE" ? "Nuovo ruolo" : "Nuova voce mezzo / attrezzatura"}</span>
            <input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={activeKind === "PERSON_ROLE" ? "Es. Muratore specializzato 3° livello" : "Es. Noleggio ponteggio"} required />
          </label>
          <label className="report-control">
            <span>Prezzo orario (€)</span>
            <input type="number" min="0" step="0.01" value={newPrice} onChange={(event) => setNewPrice(event.target.value)} required />
          </label>
          <button className="button" type="submit" disabled={savingId === "new"}>{savingId === "new" ? "Inserimento..." : "+ Aggiungi voce"}</button>
        </form>

        <div className="resource-price-toolbar">
          <label className="report-control">
            <span>Cerca</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtra per descrizione" />
          </label>
          <div className="resource-price-toolbar-actions">
            <span>{visibleRows.length} voci visualizzate</span>
            <button className="button" type="button" onClick={savePriceList} disabled={loading || savingId === "list"}>
              {savingId === "list" ? "Salvataggio..." : "Salva listino"}
            </button>
          </div>
        </div>

        <div className="mobile-table-shell commesse-table-shell">
          <table className="commesse-table resource-price-table">
            <thead><tr><th>Descrizione</th><th>Origine</th><th>Prezzo orario (€)</th><th>Disponibile nei preventivi</th><th>Azioni</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5}>Caricamento...</td></tr> : visibleRows.length === 0 ? <tr><td colSpan={5}>Nessuna voce presente.</td></tr> : visibleRows.map((row) => (
                <tr key={row.id}>
                  <td><input value={row.name} disabled={row.isRegistered} onChange={(event) => updateRow(row.id, { name: event.target.value })} aria-label={`Descrizione ${row.name}`} /></td>
                  <td><span className={row.isRegistered ? "resource-price-source registered" : "resource-price-source"}>{row.isRegistered ? "Risorsa registrata" : "Voce aggiunta"}</span></td>
                  <td><input type="number" min="0" step="0.01" value={row.hourlyPrice} onChange={(event) => updateRow(row.id, { hourlyPrice: event.target.value })} aria-label={`Prezzo orario ${row.name}`} /></td>
                  <td><label className="resource-price-active"><input type="checkbox" checked={row.active} onChange={(event) => updateRow(row.id, { active: event.target.checked })} /><span>{row.active ? "Sì" : "No"}</span></label></td>
                  <td><div className="resource-price-actions">{!row.isRegistered ? <button className="button danger" type="button" onClick={() => deleteItem(row)} disabled={savingId === row.id}>Elimina</button> : <span>—</span>}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
