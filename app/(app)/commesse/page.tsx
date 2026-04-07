"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type JobTypeValue = "SITE" | "TRAINING" | "LEAVE" | "SICKNESS" | "OTHER";
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

function compareText(a: string, b: string) {
  return a.localeCompare(b, "it", { sensitivity: "base" });
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
        matchesFilter(row.startDate, filters.startDate) &&
        (filters.status ? row.status === filters.status : true) &&
        matchesFilter(row.endDate, filters.endDate) &&
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
    return `${label} ${sortDirection === "asc" ? "↑" : "↓"}`;
  }

  return (
    <div className="grid gap-4">
      <div className="card">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Vedi commesse</h1>
            <p className="mobile-section-subtitle">
              Le commesse diventano schede compatte su mobile, senza perdere filtri, ordinamento e modifica rapida.
            </p>
          </div>
        </div>

        {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

        <div className="mobile-toolbar">
          <div className="mobile-table-meta" style={{ color: "#6b7280", fontSize: 14 }}>
            Righe visibili: <strong>{visibleRows.length}</strong> su {rows.length}
          </div>
          <div className="mobile-toolbar-actions">
            <button
              type="button"
              className="mobile-button-secondary"
              onClick={() => setFilters(getEmptyFilters())}
            >
              Azzera filtri
            </button>
          </div>
        </div>

        <div className="card mobile-filters">
          <label className="mobile-data-field">
            <span className="mobile-data-label">Commessa</span>
            <input
              value={filters.name}
              onChange={(e) => setFilterValue("name", e.target.value)}
              placeholder="Filtra commessa"
              className="mobile-data-input"
            />
          </label>

          <label className="mobile-data-field">
            <span className="mobile-data-label">Tipologia</span>
            <select
              value={filters.type}
              onChange={(e) => setFilterValue("type", e.target.value as JobTypeValue | "")}
              className="mobile-data-select"
            >
              <option value="">Tutte</option>
              <option value="SITE">{jobTypeLabel("SITE")}</option>
              <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
              <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
              <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
              <option value="OTHER">{jobTypeLabel("OTHER")}</option>
            </select>
          </label>

          <label className="mobile-data-field">
            <span className="mobile-data-label">Data Inizio</span>
            <input
              value={filters.startDate}
              onChange={(e) => setFilterValue("startDate", e.target.value)}
              placeholder="AAAA-MM-GG"
              className="mobile-data-input"
            />
          </label>

          <label className="mobile-data-field">
            <span className="mobile-data-label">Stato</span>
            <select
              value={filters.status}
              onChange={(e) => setFilterValue("status", e.target.value as ResourceStatusValue | "")}
              className="mobile-data-select"
            >
              <option value="">Tutti</option>
              <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
              <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
              <option value="ENDED">{statusLabel("ENDED")}</option>
            </select>
          </label>

          <label className="mobile-data-field">
            <span className="mobile-data-label">Data Fine</span>
            <input
              value={filters.endDate}
              onChange={(e) => setFilterValue("endDate", e.target.value)}
              placeholder="AAAA-MM-GG"
              className="mobile-data-input"
            />
          </label>

          <label className="mobile-data-field">
            <span className="mobile-data-label">Descrizione</span>
            <input
              value={filters.description}
              onChange={(e) => setFilterValue("description", e.target.value)}
              placeholder="Filtra descrizione"
              className="mobile-data-input"
            />
          </label>
        </div>

        <div className="mobile-table-shell">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("name")} style={headerButtonStyle}>
                    {renderSortLabel("Commessa", "name")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("type")} style={headerButtonStyle}>
                    {renderSortLabel("Tipologia", "type")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("startDate")} style={headerButtonStyle}>
                    {renderSortLabel("Data Inizio", "startDate")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("status")} style={headerButtonStyle}>
                    {renderSortLabel("Stato", "status")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("endDate")} style={headerButtonStyle}>
                    {renderSortLabel("Data Fine", "endDate")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("description")} style={headerButtonStyle}>
                    {renderSortLabel("Descrizione", "description")}
                  </button>
                </th>
                <th style={headerCell}>Apri Scheda</th>
                <th style={headerCellTiny}></th>
              </tr>
              <tr>
                <th style={filterHeaderCell}>
                  <input
                    value={filters.name}
                    onChange={(e) => setFilterValue("name", e.target.value)}
                    placeholder="Filtra commessa"
                    style={filterInputStyle}
                  />
                </th>
                <th style={filterHeaderCell}>
                  <select
                    value={filters.type}
                    onChange={(e) => setFilterValue("type", e.target.value as JobTypeValue | "")}
                    style={filterInputStyle}
                  >
                    <option value="">Tutte</option>
                    <option value="SITE">{jobTypeLabel("SITE")}</option>
                    <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                    <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                    <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                    <option value="OTHER">{jobTypeLabel("OTHER")}</option>
                  </select>
                </th>
                <th style={filterHeaderCell}>
                  <input
                    value={filters.startDate}
                    onChange={(e) => setFilterValue("startDate", e.target.value)}
                    placeholder="AAAA-MM-GG"
                    style={filterInputStyle}
                  />
                </th>
                <th style={filterHeaderCell}>
                  <select
                    value={filters.status}
                    onChange={(e) => setFilterValue("status", e.target.value as ResourceStatusValue | "")}
                    style={filterInputStyle}
                  >
                    <option value="">Tutti</option>
                    <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                    <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                    <option value="ENDED">{statusLabel("ENDED")}</option>
                  </select>
                </th>
                <th style={filterHeaderCell}>
                  <input
                    value={filters.endDate}
                    onChange={(e) => setFilterValue("endDate", e.target.value)}
                    placeholder="AAAA-MM-GG"
                    style={filterInputStyle}
                  />
                </th>
                <th style={filterHeaderCell}>
                  <input
                    value={filters.description}
                    onChange={(e) => setFilterValue("description", e.target.value)}
                    placeholder="Filtra descrizione"
                    style={filterInputStyle}
                  />
                </th>
                <th style={filterHeaderCell}></th>
                <th style={filterHeaderCell}></th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.localId}>
                  <td style={bodyCell}>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => setRowValue(row.localId, { name: e.target.value })}
                      style={inputStyle}
                      placeholder="Nome commessa"
                      disabled={loading}
                    />
                  </td>

                  <td style={bodyCell}>
                    <select
                      value={row.type}
                      onChange={(e) =>
                        setRowValue(row.localId, { type: e.target.value as JobTypeValue | "" })
                      }
                      style={inputStyle}
                      disabled={loading}
                    >
                      <option value="">Seleziona tipologia</option>
                      <option value="SITE">{jobTypeLabel("SITE")}</option>
                      <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                      <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                      <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                      <option value="OTHER">{jobTypeLabel("OTHER")}</option>
                    </select>
                  </td>

                  <td style={bodyCell}>
                    <input
                      type="date"
                      value={row.startDate}
                      onChange={(e) => setRowValue(row.localId, { startDate: e.target.value })}
                      style={inputStyle}
                      disabled={loading}
                    />
                  </td>

                  <td style={bodyCell}>
                    <select
                      value={row.status}
                      onChange={(e) =>
                        setRowValue(row.localId, { status: e.target.value as ResourceStatusValue | "" })
                      }
                      style={inputStyle}
                      disabled={loading}
                    >
                      <option value="">Seleziona stato</option>
                      <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                      <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                      <option value="ENDED">{statusLabel("ENDED")}</option>
                    </select>
                  </td>

                  <td style={bodyCell}>
                    <input
                      type="date"
                      value={row.endDate}
                      onChange={(e) => setRowValue(row.localId, { endDate: e.target.value })}
                      style={inputStyle}
                      disabled={loading}
                    />
                  </td>

                  <td style={bodyCell}>
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => setRowValue(row.localId, { description: e.target.value })}
                      style={inputStyle}
                      placeholder="Descrizione"
                      disabled={loading}
                    />
                  </td>

                  <td style={bodyCell}>
                    <button
                      className="button"
                      type="button"
                      disabled={!row.id}
                      onClick={() => row.id && router.push(`/commesse/${row.id}`)}
                    >
                      Apri Scheda
                    </button>
                  </td>

                  <td style={bodyCellTiny}>
                    <button
                      type="button"
                      onClick={() => removeRow(row.localId)}
                      style={removeButtonStyle}
                      title={`Rimuovi riga ${index + 1}`}
                    >
                      ×
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
                  ×
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
                    onChange={(e) =>
                      setRowValue(row.localId, { type: e.target.value as JobTypeValue | "" })
                    }
                    className="mobile-data-select"
                    disabled={loading}
                  >
                    <option value="">Seleziona tipologia</option>
                    <option value="SITE">{jobTypeLabel("SITE")}</option>
                    <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                    <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                    <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
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
                  Apri Scheda
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="mobile-footer-actions" style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={addRow}
            className="mobile-button-success"
            aria-label="Aggiungi riga"
          >
            +
          </button>

          <div className="mobile-toolbar-actions">
            <button className="button" type="button" disabled>
              Modifica
            </button>
            <button className="button" type="button" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Salvataggio..." : "Salva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const headerCell: React.CSSProperties = {
  background: "#f97316",
  color: "white",
  textAlign: "left",
  padding: "12px 10px",
  fontWeight: 700,
  border: "2px solid white",
};

const filterHeaderCell: React.CSSProperties = {
  background: "#ffd9c2",
  padding: "8px 10px",
  border: "2px solid white",
};

const headerCellTiny: React.CSSProperties = {
  ...headerCell,
  width: 56,
};

const bodyCell: React.CSSProperties = {
  background: "#fdf2f2",
  border: "2px solid white",
  padding: 6,
};

const bodyCellTiny: React.CSSProperties = {
  ...bodyCell,
  width: 56,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 8px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "white",
};

const filterInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 8px",
  borderRadius: 8,
  border: "1px solid #f08a54",
  background: "white",
};

const headerButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "white",
  padding: 0,
  font: "inherit",
  fontWeight: 700,
  cursor: "pointer",
};

const removeButtonStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 8,
  border: "none",
  background: "#ef4444",
  color: "white",
  fontSize: 22,
  lineHeight: 1,
  cursor: "pointer",
};
