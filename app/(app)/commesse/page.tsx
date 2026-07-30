"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { JobOrderTabs } from "@/components/layout/job-order-tabs";
import { formatCurrency, formatPercent } from "@/lib/number-format";

type JobTypeValue =
  | "SITE"
  | "TRAINING"
  | "LEAVE"
  | "SICKNESS"
  | "RAIN"
  | "NATIONAL_HOLIDAY"
  | "OTHER";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED" | "COMPLETED";
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

type BudgetForm = {
  personnel: string;
  equipment: string;
  materials: string;
  professionalServices: string;
  thirdPartyServices: string;
  misc: string;
  revenue: string;
};

type NewJobOrderForm = {
  name: string;
  type: JobTypeValue;
  startDate: string;
  endDate: string;
  status: ResourceStatusValue;
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

const budgetFields: { key: keyof BudgetForm; label: string }[] = [
  { key: "personnel", label: "Utilizzo Personale" },
  { key: "equipment", label: "Utilizzo Mezzi e Attrezzature" },
  { key: "materials", label: "Materie Prime" },
  { key: "professionalServices", label: "Prestazioni Professionali" },
  { key: "thirdPartyServices", label: "Prestazioni Terzi" },
  { key: "misc", label: "Spese Varie" },
  { key: "revenue", label: "Fatturato Previsto" },
];

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

function makeEmptyNewJobOrderForm(): NewJobOrderForm {
  return {
    name: "",
    type: "SITE",
    startDate: "",
    endDate: "",
    status: "ACTIVE",
    description: "",
  };
}

function makeEmptyBudget(): BudgetForm {
  return {
    personnel: "",
    equipment: "",
    materials: "",
    professionalServices: "",
    thirdPartyServices: "",
    misc: "",
    revenue: "",
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
    case "NATIONAL_HOLIDAY":
      return "Festività Nazionale";
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
    case "COMPLETED":
      return "Concluso";
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

function parseAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = trimmed.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function CommessePage() {
  const router = useRouter();
  const [rows, setRows] = useState<EditableJobOrderRow[]>([]);
  const [filters, setFilters] = useState<JobFilters>(getEmptyFilters());
  const [sortKey, setSortKey] = useState<JobSortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newJobOrderForm, setNewJobOrderForm] = useState<NewJobOrderForm>(makeEmptyNewJobOrderForm());
  const [newBudget, setNewBudget] = useState<BudgetForm>(makeEmptyBudget());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
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

  async function persistRows(nextRows: EditableJobOrderRow[], successMessage: string) {
    const payloadRows = nextRows.map((row) => ({
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

    setMessage(successMessage || `Salvataggio completato. Righe salvate: ${data.savedRows}.`);
    await loadRows();
  }

  async function deleteRow(row: EditableJobOrderRow, index: number) {
    const label = row.name || `riga ${index + 1}`;
    const confirmed = window.confirm(`Eliminare la commessa "${label}"?`);
    if (!confirmed) return;

    setSaving(true);
    setSavingRowId(row.localId);
    setMessage("");
    setError("");

    try {
      const updated = rows.filter((current) => current.localId !== row.localId);
      setRows(updated);
      await persistRows(updated, "Commessa eliminata.");
      if (editingRowId === row.localId) {
        setEditingRowId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione commessa");
      await loadRows();
    } finally {
      setSaving(false);
      setSavingRowId(null);
    }
  }

  function removeUnsavedRow(localId: string) {
    setRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated;
    });
    setEditingRowId(null);
  }

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/commesse");

      if (!data.rows || data.rows.length === 0) {
        setRows([]);
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
      setEditingRowId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento commesse");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function saveRow(row: EditableJobOrderRow) {
    setSaving(true);
    setSavingRowId(row.localId);
    setMessage("");
    setError("");

    try {
      await persistRows(rows, "Commessa salvata.");
      setEditingRowId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio commessa");
    } finally {
      setSaving(false);
      setSavingRowId(null);
    }
  }

  function cancelEdit(row: EditableJobOrderRow) {
    if (!row.id) {
      removeUnsavedRow(row.localId);
      return;
    }

    setEditingRowId(null);
    void loadRows();
  }

  function openCreateModal() {
    setNewJobOrderForm(makeEmptyNewJobOrderForm());
    setNewBudget(makeEmptyBudget());
    setCreateModalOpen(true);
    setMessage("");
    setError("");
  }

  function closeCreateModal() {
    if (creating) return;
    setCreateModalOpen(false);
  }

  async function createJobOrder() {
    if (!newJobOrderForm.name.trim()) {
      setError("Il nome commessa e obbligatorio.");
      return;
    }

    setCreating(true);
    setMessage("");
    setError("");

    try {
      await safeJsonFetch("/api/commesse/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newJobOrderForm.name,
          type: newJobOrderForm.type,
          startDate: newJobOrderForm.startDate,
          status: newJobOrderForm.status,
          endDate: newJobOrderForm.endDate,
          description: newJobOrderForm.description,
          budget: newBudget,
        }),
      });

      setCreateModalOpen(false);
      setMessage("Commessa creata correttamente.");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella creazione commessa");
    } finally {
      setCreating(false);
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

  function formatDate(value: string) {
    if (!value) return "-";
    const [year, month, day] = value.split("-");
    if (!year || !month || !day) return value;
    return `${day}/${month}/${year}`;
  }

  const newBudgetPreview = {
    personnel: parseAmount(newBudget.personnel),
    equipment: parseAmount(newBudget.equipment),
    materials: parseAmount(newBudget.materials),
    professionalServices: parseAmount(newBudget.professionalServices),
    thirdPartyServices: parseAmount(newBudget.thirdPartyServices),
    misc: parseAmount(newBudget.misc),
    revenue: parseAmount(newBudget.revenue),
  };
  const newBudgetTotalCosts =
    newBudgetPreview.personnel +
    newBudgetPreview.equipment +
    newBudgetPreview.materials +
    newBudgetPreview.professionalServices +
    newBudgetPreview.thirdPartyServices +
    newBudgetPreview.misc;
  const newBudgetMargin = newBudgetPreview.revenue - newBudgetTotalCosts;
  const newBudgetMarginPct = newBudgetPreview.revenue
    ? ((newBudgetPreview.revenue - newBudgetTotalCosts) / newBudgetPreview.revenue) * 100
    : 0;

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
              <option value="NATIONAL_HOLIDAY">{jobTypeLabel("NATIONAL_HOLIDAY")}</option>
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
              <option value="COMPLETED">{statusLabel("COMPLETED")}</option>
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
          <div className="commesse-list-toolbar-actions">
            <div className="mobile-table-meta commesse-table-meta">
              Righe visibili: <strong>{visibleRows.length}</strong> su {rows.length}
            </div>
            <button type="button" className="button" onClick={openCreateModal} disabled={loading || saving}>
              Crea nuova commessa
            </button>
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
                <th className="commesse-header-cell commesse-actions-header">Menu Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.length === 0 ? (
                <tr>
                  <td className="commesse-body-cell commesse-empty-cell" colSpan={7}>
                    Nessuna commessa trovata.
                  </td>
                </tr>
              ) : null}
              {visibleRows.map((row, index) => {
                const isEditing = editingRowId === row.localId;

                return (
                  <tr key={row.localId}>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => setRowValue(row.localId, { name: e.target.value })}
                          className="commesse-table-input"
                          placeholder="Nome commessa"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value commesse-table-value-strong">
                          {row.name || "-"}
                        </span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <select
                          value={row.type}
                          onChange={(e) => setRowValue(row.localId, { type: e.target.value as JobTypeValue | "" })}
                          className="commesse-table-input"
                          disabled={loading || saving}
                        >
                          <option value="">Seleziona tipologia</option>
                          <option value="SITE">{jobTypeLabel("SITE")}</option>
                          <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                          <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                          <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                          <option value="RAIN">{jobTypeLabel("RAIN")}</option>
                          <option value="NATIONAL_HOLIDAY">{jobTypeLabel("NATIONAL_HOLIDAY")}</option>
                          <option value="OTHER">{jobTypeLabel("OTHER")}</option>
                        </select>
                      ) : (
                        <span className="commesse-table-value">{row.type ? jobTypeLabel(row.type as JobTypeValue) : "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="date"
                          value={row.startDate}
                          onChange={(e) => setRowValue(row.localId, { startDate: e.target.value })}
                          className="commesse-table-input"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value">{formatDate(row.startDate)}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <select
                          value={row.status}
                          onChange={(e) =>
                            setRowValue(row.localId, { status: e.target.value as ResourceStatusValue | "" })
                          }
                          className="commesse-table-input"
                          disabled={loading || saving}
                        >
                          <option value="">Seleziona stato</option>
                          <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                          <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                          <option value="ENDED">{statusLabel("ENDED")}</option>
                          <option value="COMPLETED">{statusLabel("COMPLETED")}</option>
                        </select>
                      ) : (
                        <span className="commesse-table-value">{row.status ? statusLabel(row.status as ResourceStatusValue) : "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="date"
                          value={row.endDate}
                          onChange={(e) => setRowValue(row.localId, { endDate: e.target.value })}
                          className="commesse-table-input"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value">{formatDate(row.endDate)}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => setRowValue(row.localId, { description: e.target.value })}
                          className="commesse-table-input"
                          placeholder="Descrizione"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value">{row.description || "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell commesse-actions-cell">
                      <div className="commesse-row-actions">
                        <button
                          className="open-sheet-link-button"
                          type="button"
                          disabled={!row.id || isEditing}
                          onClick={() => row.id && router.push(`/commesse/${row.id}`)}
                        >
                          Apri Scheda
                        </button>
                        {isEditing ? (
                          <>
                            <button
                              className="button commesse-save-row-button"
                              type="button"
                              onClick={() => void saveRow(row)}
                              disabled={saving || loading}
                            >
                              {savingRowId === row.localId ? "Salvo..." : "Salva"}
                            </button>
                            <button
                              type="button"
                              className="mobile-button-secondary commesse-cancel-row-button"
                              onClick={() => cancelEdit(row)}
                              disabled={saving}
                            >
                              Annulla
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="icon-action-button"
                            aria-label="Modifica commessa"
                            title="Modifica"
                            onClick={() => setEditingRowId(row.localId)}
                          >
                            ✎
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => row.id ? void deleteRow(row, index) : removeUnsavedRow(row.localId)}
                          className="icon-action-button icon-action-button-danger"
                          aria-label="Elimina commessa"
                          title={`Elimina riga ${index + 1}`}
                          disabled={saving}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
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
                <div className="commesse-row-actions">
                  {editingRowId === row.localId ? null : (
                    <button
                      type="button"
                      className="icon-action-button"
                      aria-label="Modifica commessa"
                      title="Modifica"
                      onClick={() => setEditingRowId(row.localId)}
                    >
                      ✎
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => row.id ? void deleteRow(row, index) : removeUnsavedRow(row.localId)}
                    className="icon-action-button icon-action-button-danger"
                    aria-label="Elimina commessa"
                    title={`Elimina riga ${index + 1}`}
                    disabled={saving}
                  >
                    🗑
                  </button>
                </div>
              </div>
              {editingRowId === row.localId ? (
                <div className="mobile-data-card-grid">
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Nome Commessa</span>
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => setRowValue(row.localId, { name: e.target.value })}
                      className="mobile-data-input"
                      placeholder="Nome commessa"
                      disabled={loading || saving}
                    />
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Tipologia</span>
                    <select
                      value={row.type}
                      onChange={(e) => setRowValue(row.localId, { type: e.target.value as JobTypeValue | "" })}
                      className="mobile-data-select"
                      disabled={loading || saving}
                    >
                      <option value="">Seleziona tipologia</option>
                      <option value="SITE">{jobTypeLabel("SITE")}</option>
                      <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                      <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                      <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                      <option value="RAIN">{jobTypeLabel("RAIN")}</option>
                      <option value="NATIONAL_HOLIDAY">{jobTypeLabel("NATIONAL_HOLIDAY")}</option>
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
                      disabled={loading || saving}
                    >
                      <option value="">Seleziona stato</option>
                      <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                      <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                      <option value="ENDED">{statusLabel("ENDED")}</option>
                      <option value="COMPLETED">{statusLabel("COMPLETED")}</option>
                    </select>
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Data Inizio</span>
                    <input
                      type="date"
                      value={row.startDate}
                      onChange={(e) => setRowValue(row.localId, { startDate: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
                    />
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Data Fine</span>
                    <input
                      type="date"
                      value={row.endDate}
                      onChange={(e) => setRowValue(row.localId, { endDate: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
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
                      disabled={loading || saving}
                    />
                  </label>
                </div>
              ) : (
                <div className="mobile-data-card-grid">
                  <div className="mobile-data-field"><span className="mobile-data-label">Tipologia</span><strong>{row.type ? jobTypeLabel(row.type as JobTypeValue) : "-"}</strong></div>
                  <div className="mobile-data-field"><span className="mobile-data-label">Stato</span><strong>{row.status ? statusLabel(row.status as ResourceStatusValue) : "-"}</strong></div>
                  <div className="mobile-data-field"><span className="mobile-data-label">Data Inizio</span><strong>{formatDate(row.startDate)}</strong></div>
                  <div className="mobile-data-field"><span className="mobile-data-label">Data Fine</span><strong>{formatDate(row.endDate)}</strong></div>
                  <div className="mobile-data-field mobile-data-field-full"><span className="mobile-data-label">Descrizione</span><strong>{row.description || "-"}</strong></div>
                </div>
              )}
              <div className="mobile-data-actions">
                <button
                  className="open-sheet-link-button"
                  type="button"
                  disabled={!row.id || editingRowId === row.localId}
                  onClick={() => row.id && router.push(`/commesse/${row.id}`)}
                >
                  Apri Scheda
                </button>
                {editingRowId === row.localId ? (
                  <>
                    <button
                      className="button"
                      type="button"
                      onClick={() => void saveRow(row)}
                      disabled={saving || loading}
                    >
                      {savingRowId === row.localId ? "Salvo..." : "Salva"}
                    </button>
                    <button
                      className="mobile-button-secondary"
                      type="button"
                      onClick={() => cancelEdit(row)}
                      disabled={saving}
                    >
                      Annulla
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
          {visibleRows.length === 0 ? (
            <article className="card mobile-data-card">
              <strong>Nessuna commessa trovata.</strong>
            </article>
          ) : null}
        </div>

        {createModalOpen ? (
          <div className="commesse-create-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-job-order-title">
            <div className="commesse-create-modal">
              <div className="commesse-create-modal-head">
                <div>
                  <p className="job-dashboard-kicker">GiGEST</p>
                  <h2 id="create-job-order-title" className="job-sheet-panel-title">Crea nuova commessa</h2>
                </div>
                <button type="button" className="mobile-button-secondary" onClick={closeCreateModal} disabled={creating}>
                  Chiudi
                </button>
              </div>

              <div className="commesse-create-modal-body">
                <div className="job-sheet-panel">
                  <h3 className="job-sheet-panel-title">Dati Commessa</h3>
                  <div className="job-sheet-form-grid">
                    <label className="job-sheet-field job-sheet-field-wide">
                      <span>Commessa</span>
                      <input
                        className="job-dashboard-head-input"
                        value={newJobOrderForm.name}
                        onChange={(e) => setNewJobOrderForm((current) => ({ ...current, name: e.target.value }))}
                        placeholder="Nome commessa"
                      />
                    </label>
                    <label className="job-sheet-field">
                      <span>Tipologia</span>
                      <select
                        className="job-dashboard-head-input"
                        value={newJobOrderForm.type}
                        onChange={(e) => setNewJobOrderForm((current) => ({ ...current, type: e.target.value as JobTypeValue }))}
                      >
                        <option value="SITE">{jobTypeLabel("SITE")}</option>
                        <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                        <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                        <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                        <option value="RAIN">{jobTypeLabel("RAIN")}</option>
                        <option value="NATIONAL_HOLIDAY">{jobTypeLabel("NATIONAL_HOLIDAY")}</option>
                        <option value="OTHER">{jobTypeLabel("OTHER")}</option>
                      </select>
                    </label>
                    <label className="job-sheet-field">
                      <span>Stato</span>
                      <select
                        className="job-dashboard-head-input"
                        value={newJobOrderForm.status}
                        onChange={(e) => setNewJobOrderForm((current) => ({ ...current, status: e.target.value as ResourceStatusValue }))}
                      >
                        <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                        <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                        <option value="ENDED">{statusLabel("ENDED")}</option>
                        <option value="COMPLETED">{statusLabel("COMPLETED")}</option>
                      </select>
                    </label>
                    <label className="job-sheet-field">
                      <span>Data Inizio</span>
                      <input
                        type="date"
                        className="job-dashboard-head-input"
                        value={newJobOrderForm.startDate}
                        onChange={(e) => setNewJobOrderForm((current) => ({ ...current, startDate: e.target.value }))}
                      />
                    </label>
                    <label className="job-sheet-field">
                      <span>Data Fine</span>
                      <input
                        type="date"
                        className="job-dashboard-head-input"
                        value={newJobOrderForm.endDate}
                        onChange={(e) => setNewJobOrderForm((current) => ({ ...current, endDate: e.target.value }))}
                      />
                    </label>
                    <label className="job-sheet-field job-sheet-field-wide">
                      <span>Descrizione</span>
                      <textarea
                        className="job-dashboard-head-input job-dashboard-head-textarea"
                        value={newJobOrderForm.description}
                        onChange={(e) => setNewJobOrderForm((current) => ({ ...current, description: e.target.value }))}
                      />
                    </label>
                  </div>
                </div>

                <div className="job-sheet-panel">
                  <h3 className="job-sheet-panel-title">Budget Commessa</h3>
                  <div className="job-sheet-budget-list">
                    {budgetFields.map((field) => (
                      <label key={field.key} className="job-dashboard-line">
                        <span>{field.label}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newBudget[field.key]}
                          onChange={(e) => setNewBudget((current) => ({ ...current, [field.key]: e.target.value }))}
                          className="job-dashboard-amount-input"
                        />
                      </label>
                    ))}
                  </div>
                  <div className="job-dashboard-divider" />
                  <div className="job-dashboard-summary-list">
                    <div className="job-dashboard-summary-row">
                      <span>Totale Budget costi</span>
                      <strong>{formatCurrency(newBudgetTotalCosts)}</strong>
                    </div>
                    <div className="job-dashboard-summary-row">
                      <span>Primo Margine Previsto</span>
                      <div className="job-dashboard-summary-values">
                        <strong>{formatCurrency(newBudgetMargin)}</strong>
                        <span>{formatPercent(newBudgetMarginPct)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="commesse-create-modal-actions">
                <button type="button" className="mobile-button-secondary" onClick={closeCreateModal} disabled={creating}>
                  Annulla
                </button>
                <button type="button" className="button" onClick={() => void createJobOrder()} disabled={creating}>
                  {creating ? "Creo..." : "Crea commessa"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
