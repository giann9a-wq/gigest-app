"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { JobOrderTabs } from "@/components/layout/job-order-tabs";

type JobTypeValue = "SITE" | "TRAINING" | "LEAVE" | "SICKNESS" | "RAIN" | "OTHER";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";
type JobSortKey = "name" | "type" | "startDate" | "status" | "endDate" | "description";
type SortDirection = "asc" | "desc";

type EditableJobOrderRow = {
  localId: string;
  id?: string;
  name: string;
  type: JobTypeValue | "";
  startDate: string;
  status: ResourceStatusValue | "";
  endDate: string;
  description: string;
};

type JobFilters = {
  name: string;
  type: JobTypeValue | "";
  startDate: string;
  status: ResourceStatusValue | "";
  endDate: string;
  description: string;
};

function makeEmptyRow(): EditableJobOrderRow {
  return {
    localId: crypto.randomUUID(),
    name: "",
    type: "",
    startDate: "",
    status: "",
    endDate: "",
    description: "",
  };
}

function getEmptyFilters(): JobFilters {
  return {
    name: "",
    type: "",
    startDate: "",
    status: "",
    endDate: "",
    description: "",
  };
}

async function safeJsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(`Risposta non valida dal server: ${rawText.slice(0, 120)}`);
  }

  const data = JSON.parse(rawText);

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data;
}

function jobTypeLabel(type: JobTypeValue) {
  switch (type) {
    case "SITE":
      return "Cantiere";
    case "TRAINING":
      return "Formazione";
    case "LEAVE":
      return "Ferie";
    case "SICKNESS":
      return "Malattia";
    case "RAIN":
      return "Pioggia";
    case "OTHER":
      return "Altro";
  }
}

function statusLabel(status: ResourceStatusValue) {
  switch (status) {
    case "ACTIVE":
      return "Attivo";
    case "SUSPENDED":
      return "Sospeso";
    case "ENDED":
      return "Estinto";
  }
}

function matchesFilter(value: string, filter: string) {
  return value.toLowerCase().includes(filter.trim().toLowerCase());
}

function matchesDateRange(rowStartDate: string, rowEndDate: string, filterFrom: string, filterTo: string) {
  const startDate = rowStartDate || rowEndDate;
  const endDate = rowEndDate || rowStartDate;
  if (filterFrom && endDate && endDate < filterFrom) return false;
  if (filterTo && startDate && startDate > filterTo) return false;
  if ((filterFrom || filterTo) && !startDate && !endDate) return false;
  return true;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "it", { sensitivity: "base" });
}

function sortArrow(direction: SortDirection) {
  return direction === "asc" ? "\u2191" : "\u2193";
}

export default function CommessePage() {
  const router = useRouter();
  const [rows, setRows] = useState<EditableJobOrderRow[]>([
    makeEmptyRow(),
    makeEmptyRow(),
    makeEmptyRow(),
  ]);
  const [filters, setFilters] = useState<JobFilters>(getEmptyFilters());
  const [sortKey, setSortKey] = useState<JobSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setRowValue(localId: string, patch: Partial<EditableJobOrderRow>) {
    setRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function setFilterValue<K extends keyof JobFilters>(key: K, value: JobFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(nextKey: JobSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function addRow() {
    setRows((current) => [...current, makeEmptyRow()]);
  }

  function removeRow(localId: string) {
    setRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyRow()];
    });
  }

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/commesse");

      if (!data.rows || data.rows.length === 0) {
        setRows([makeEmptyRow(), makeEmptyRow(), makeEmptyRow()]);
      } else {
        setRows(
          data.rows.map((row: any) => ({
            localId: crypto.randomUUID(),
            id: row.id,
            name: row.name ?? "",
            type: row.type ?? "",
            startDate: row.startDate ?? "",
            status: row.status ?? "",
            endDate: row.endDate ?? "",
            description: row.description ?? "",
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento commesse");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payloadRows = rows.map((row) => ({
        id: row.id,
        name: row.name,
        type: row.type,
        startDate: row.startDate,
        status: row.status,
        endDate: row.endDate,
        description: row.description,
      }));

      const data = await safeJsonFetch("/api/commesse", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows: payloadRows }),
      });

      setMessage(`Salvataggio completato. Righe salvate: ${data.savedRows}.`);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      return (
        matchesFilter(row.name, filters.name) &&
        (filters.type ? row.type === filters.type : true) &&
        (filters.status ? row.status === filters.status : true) &&
        matchesDateRange(row.startDate, row.endDate, filters.startDate, filters.endDate) &&
        matchesFilter(row.description, filters.description)
      );
    });

    return [...filtered].sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case "name":
          result = compareText(a.name, b.name);
          break;
        case "type":
          result = compareText(a.type, b.type);
          break;
        case "startDate":
          result = compareText(a.startDate, b.startDate);
          break;
        case "status":
          result = compareText(a.status, b.status);
          break;
        case "endDate":
          result = compareText(a.endDate, b.endDate);
          break;
        case "description":
          result = compareText(a.description, b.description);
          break;
      }

      return sortDirection === "asc" ? result : -result;
    });
  }, [filters, rows, sortDirection, sortKey]);

  function renderSortLabel(label: string, key: JobSortKey) {
    if (sortKey !== key) return label;
    return `${label} ${sortArrow(sortDirection)}`;
  }

  return (
    <div className="grid gap-4">
      <div className="card commesse-page-card">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Gestione Commesse</h1>
            <p className="mobile-section-subtitle">
              Qui gestisci l'anagrafica delle commesse. I dati economici restano dentro la
              scheda commessa e nella sezione dedicata Dashboard Commessa.
            </p>
          </div>
        </div>

        <JobOrderTabs current="list" />

        {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

        <div className="commesse-filter-bar">
          <label className="report-control commesse-filter-name">
            <span>Commessa</span>
            <input
              value={filters.name}
              onChange={(e) => setFilterValue("name", e.target.value)}
              placeholder="Filtra commessa"
            />
          </label>

          <label className="report-control">
            <span>Tipologia</span>
            <select
              value={filters.type}
              onChange={(e) => setFilterValue("type", e.target.value as JobTypeValue | "")}
            >
              <option value="">Tutte</option>
              <option value="SITE">{jobTypeLabel("SITE")}</option>
              <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
              <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
              <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
              <option value="RAIN">{jobTypeLabel("RAIN")}</option>
              <option value="OTHER">{jobTypeLabel("OTHER")}</option>
            </select>
          </label>

          <label className="report-control">
            <span>Stato</span>
            <select
              value={filters.status}
              onChange={(e) => setFilterValue("status", e.target.value as ResourceStatusValue | "")}
            >
              <option value="">Tutti</option>
              <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
              <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
              <option value="ENDED">{statusLabel("ENDED")}</option>
            </select>
          </label>

          <label className="report-control">
            <span>Dal</span>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilterValue("startDate", e.target.value)}
            />
          </label>

          <label className="report-control">
            <span>Al</span>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilterValue("endDate", e.target.value)}
            />
          </label>

          <button
            type="button"
            className="report-print-btn"
            onClick={() => setFilters(getEmptyFilters())}
          >
            Azzera filtri
          </button>
        </div>

        <div className="mobile-toolbar">
          <div className="mobile-table-meta commesse-table-meta">
            Righe visibili: <strong>{visibleRows.length}</strong> su {rows.length}
          </div>
        </div>

        <div className="mobile-table-shell commesse-table-shell">
          <table className="commesse-table">
            <colgroup>
              <col className="commesse-col-name" />
              <col className="commesse-col-type" />
              <col className="commesse-col-date" />
              <col className="commesse-col-status" />
              <col className="commesse-col-date" />
              <col className="commesse-col-description" />
              <col className="commesse-col-action" />
              <col className="commesse-col-remove" />
            </colgroup>
            <thead>
              <tr>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("name")} className="commesse-sort-button">
                    {renderSortLabel("Commessa", "name")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("type")} className="commesse-sort-button">
                    {renderSortLabel("Tipologia", "type")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button
                    type="button"
                    onClick={() => toggleSort("startDate")}
                    className="commesse-sort-button"
                  >
                    {renderSortLabel("Data Inizio", "startDate")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("status")} className="commesse-sort-button">
                    {renderSortLabel("Stato", "status")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("endDate")} className="commesse-sort-button">
                    {renderSortLabel("Data Fine", "endDate")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button
                    type="button"
                    onClick={() => toggleSort("description")}
                    className="commesse-sort-button"
                  >
                    {renderSortLabel("Descrizione", "description")}
                  </button>
                </th>
                <th className="commesse-header-cell commesse-actions-header">Apri Scheda</th>
                <th className="commesse-header-cell commesse-tiny-cell"></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.localId}>
                  <td className="commesse-body-cell">
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => setRowValue(row.localId, { name: e.target.value })}
                      className="commesse-table-input"
                      placeholder="Nome commessa"
                      disabled={loading}
                    />
                  </td>
                  <td className="commesse-body-cell">
                    <select
                      value={row.type}
                      onChange={(e) => setRowValue(row.localId, { type: e.target.value as JobTypeValue | "" })}
                      className="commesse-table-input"
                      disabled={loading}
                    >
                      <option value="">Seleziona tipologia</option>
                      <option value="SITE">{jobTypeLabel("SITE")}</option>
                      <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                      <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                      <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                      <option value="RAIN">{jobTypeLabel("RAIN")}</option>
                      <option value="OTHER">{jobTypeLabel("OTHER")}</option>
                    </select>
                  </td>
                  <td className="commesse-body-cell">
                    <input
                      type="date"
                      value={row.startDate}
                      onChange={(e) => setRowValue(row.localId, { startDate: e.target.value })}
                      className="commesse-table-input"
                      disabled={loading}
                    />
                  </td>
                  <td className="commesse-body-cell">
                    <select
                      value={row.status}
                      onChange={(e) =>
                        setRowValue(row.localId, { status: e.target.value as ResourceStatusValue | "" })
                      }
                      className="commesse-table-input"
                      disabled={loading}
                    >
                      <option value="">Seleziona stato</option>
                      <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                      <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                      <option value="ENDED">{statusLabel("ENDED")}</option>
                    </select>
                  </td>
                  <td className="commesse-body-cell">
                    <input
                      type="date"
                      value={row.endDate}
                      onChange={(e) => setRowValue(row.localId, { endDate: e.target.value })}
                      className="commesse-table-input"
                      disabled={loading}
                    />
                  </td>
                  <td className="commesse-body-cell">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => setRowValue(row.localId, { description: e.target.value })}
                      className="commesse-table-input"
                      placeholder="Descrizione"
                      disabled={loading}
                    />
                  </td>
                  <td className="commesse-body-cell commesse-actions-cell">
                    <button
                      className="button commesse-open-button"
                      type="button"
                      disabled={!row.id}
                      onClick={() => row.id && router.push(`/commesse/${row.id}`)}
                    >
                      Apri Scheda
                    </button>
                  </td>
                  <td className="commesse-body-cell commesse-tiny-cell">
                    <button
                      type="button"
                      onClick={() => removeRow(row.localId)}
                      className="commesse-remove-button"
                      title={`Rimuovi riga ${index + 1}`}
                    >
                      &times;
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mobile-data-cards">
          {visibleRows.map((row, index) => (
            <article key={row.localId} className="card mobile-data-card">
              <div className="mobile-data-card-head">
                <div>
                  <div className="mobile-data-label">Commessa</div>
                  <strong>{row.name || `Nuova commessa ${index + 1}`}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(row.localId)}
                  className="mobile-danger-button"
                  title={`Rimuovi riga ${index + 1}`}
                >
                  &times;
                </button>
              </div>
              <div className="mobile-data-card-grid">
                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Nome Commessa</span>
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => setRowValue(row.localId, { name: e.target.value })}
                    className="mobile-data-input"
                    placeholder="Nome commessa"
                    disabled={loading}
                  />
                </label>
                <label className="mobile-data-field">
                  <span className="mobile-data-label">Tipologia</span>
                  <select
                    value={row.type}
                    onChange={(e) => setRowValue(row.localId, { type: e.target.value as JobTypeValue | "" })}
                    className="mobile-data-select"
                    disabled={loading}
                  >
                    <option value="">Seleziona tipologia</option>
                    <option value="SITE">{jobTypeLabel("SITE")}</option>
                    <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                    <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                    <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                    <option value="RAIN">{jobTypeLabel("RAIN")}</option>
                    <option value="OTHER">{jobTypeLabel("OTHER")}</option>
                  </select>
                </label>
                <label className="mobile-data-field">
                  <span className="mobile-data-label">Stato</span>
                  <select
                    value={row.status}
                    onChange={(e) =>
                      setRowValue(row.localId, { status: e.target.value as ResourceStatusValue | "" })
                    }
                    className="mobile-data-select"
                    disabled={loading}
                  >
                    <option value="">Seleziona stato</option>
                    <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                    <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                    <option value="ENDED">{statusLabel("ENDED")}</option>
                  </select>
                </label>
                <label className="mobile-data-field">
                  <span className="mobile-data-label">Data Inizio</span>
                  <input
                    type="date"
                    value={row.startDate}
                    onChange={(e) => setRowValue(row.localId, { startDate: e.target.value })}
                    className="mobile-data-input"
                    disabled={loading}
                  />
                </label>
                <label className="mobile-data-field">
                  <span className="mobile-data-label">Data Fine</span>
                  <input
                    type="date"
                    value={row.endDate}
                    onChange={(e) => setRowValue(row.localId, { endDate: e.target.value })}
                    className="mobile-data-input"
                    disabled={loading}
                  />
                </label>
                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Descrizione</span>
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => setRowValue(row.localId, { description: e.target.value })}
                    className="mobile-data-input"
                    placeholder="Descrizione"
                    disabled={loading}
                  />
                </label>
              </div>
              <div className="mobile-data-actions">
                <button
                  className="button"
                  type="button"
                  disabled={!row.id}
                  onClick={() => row.id && router.push(`/commesse/${row.id}`)}
                >
                  Apri scheda
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="mobile-footer-actions" style={{ marginTop: 18 }}>
          <button type="button" onClick={addRow} className="mobile-button-success" aria-label="Aggiungi riga">
            +
          </button>
          <div className="mobile-toolbar-actions">
            <button className="button" type="button" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
