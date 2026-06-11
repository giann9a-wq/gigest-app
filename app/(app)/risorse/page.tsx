"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ResourceTabs } from "@/components/layout/resource-tabs";

type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";
type PersonSortKey = "fullName" | "roleDescription" | "contacts" | "status" | "hourlyCost";
type SortDirection = "asc" | "desc";

type EditablePersonRow = {
  localId: string;
  id?: string;
  fullName: string;
  roleDescription: string;
  contacts: string;
  status: ResourceStatusValue | "";
  hourlyCost: string;
};

type PersonFilters = {
  fullName: string;
  roleDescription: string;
  contacts: string;
  status: ResourceStatusValue | "";
  hourlyCost: string;
};

function makeEmptyRow(): EditablePersonRow {
  return {
    localId: crypto.randomUUID(),
    fullName: "",
    roleDescription: "",
    contacts: "",
    status: "",
    hourlyCost: "",
  };
}

function getEmptyFilters(): PersonFilters {
  return {
    fullName: "",
    roleDescription: "",
    contacts: "",
    status: "",
    hourlyCost: "",
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

function compareNumberString(a: string, b: string) {
  const aNumber = Number(a || 0);
  const bNumber = Number(b || 0);
  return aNumber - bNumber;
}

function sortArrow(direction: SortDirection) {
  return direction === "asc" ? "\u2191" : "\u2193";
}

export default function RisorsePage() {
  const router = useRouter();

  const [rows, setRows] = useState<EditablePersonRow[]>([
    makeEmptyRow(),
    makeEmptyRow(),
    makeEmptyRow(),
  ]);
  const [filters, setFilters] = useState<PersonFilters>(getEmptyFilters());
  const [sortKey, setSortKey] = useState<PersonSortKey>("fullName");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setRowValue(localId: string, patch: Partial<EditablePersonRow>) {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }

  function setFilterValue<K extends keyof PersonFilters>(key: K, value: PersonFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(nextKey: PersonSortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function addRow() {
    const nextRow = makeEmptyRow();
    setRows((current) => [...current, nextRow]);
    setEditingRowId(nextRow.localId);
  }

  async function persistRows(nextRows: EditablePersonRow[], successMessage: string) {
    const payloadRows = nextRows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      roleDescription: row.roleDescription,
      contacts: row.contacts,
      status: row.status,
      hourlyCost: row.hourlyCost,
    }));

    const data = await safeJsonFetch("/api/risorse/personale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payloadRows }),
    });

    setMessage(successMessage || `Salvataggio completato. Righe salvate: ${data.savedRows}.`);
    await loadRows();
  }

  async function deleteRow(row: EditablePersonRow, index: number) {
    const label = row.fullName || `riga ${index + 1}`;
    const confirmed = window.confirm(`Eliminare la risorsa "${label}"?`);
    if (!confirmed) return;

    setSaving(true);
    setSavingRowId(row.localId);
    setMessage("");
    setError("");

    try {
      const updated = rows.filter((current) => current.localId !== row.localId);
      const nextRows = updated.length > 0 ? updated : [makeEmptyRow()];
      setRows(nextRows);
      await persistRows(nextRows, "Risorsa eliminata.");
      if (editingRowId === row.localId) {
        setEditingRowId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione risorsa");
      await loadRows();
    } finally {
      setSaving(false);
      setSavingRowId(null);
    }
  }

  function removeUnsavedRow(localId: string) {
    setRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyRow()];
    });
    setEditingRowId(null);
  }

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/risorse/personale");

      if (!data.rows || data.rows.length === 0) {
        setRows([makeEmptyRow(), makeEmptyRow(), makeEmptyRow()]);
      } else {
        setRows(
          data.rows.map((row: any) => ({
            localId: crypto.randomUUID(),
            id: row.id,
            fullName: row.fullName ?? "",
            roleDescription: row.roleDescription ?? "",
            contacts: row.contacts ?? "",
            status: row.status ?? "",
            hourlyCost: row.hourlyCost?.toString() ?? "",
          }))
        );
      }
      setEditingRowId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento risorse");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function saveRow(row: EditablePersonRow) {
    setSaving(true);
    setSavingRowId(row.localId);
    setMessage("");
    setError("");

    try {
      await persistRows(rows, "Risorsa salvata.");
      setEditingRowId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio risorsa");
    } finally {
      setSaving(false);
      setSavingRowId(null);
    }
  }

  function cancelEdit(row: EditablePersonRow) {
    if (!row.id) {
      removeUnsavedRow(row.localId);
      return;
    }

    setEditingRowId(null);
    void loadRows();
  }

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      return (
        matchesFilter(row.fullName, filters.fullName) &&
        matchesFilter(row.roleDescription, filters.roleDescription) &&
        matchesFilter(row.contacts, filters.contacts) &&
        (filters.status ? row.status === filters.status : true) &&
        (filters.hourlyCost ? matchesFilter(String(row.hourlyCost), filters.hourlyCost) : true)
      );
    });

    return [...filtered].sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case "fullName":
          result = compareText(a.fullName, b.fullName);
          break;
        case "roleDescription":
          result = compareText(a.roleDescription, b.roleDescription);
          break;
        case "contacts":
          result = compareText(a.contacts, b.contacts);
          break;
        case "status":
          result = compareText(a.status, b.status);
          break;
        case "hourlyCost":
          result = compareNumberString(a.hourlyCost, b.hourlyCost);
          break;
      }

      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, filters, sortKey, sortDirection]);

  function renderSortLabel(label: string, key: PersonSortKey) {
    if (sortKey !== key) return label;
    return `${label} ${sortArrow(sortDirection)}`;
  }

  return (
    <div className="grid gap-4">
      <div className="card commesse-page-card">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Gestione Risorse</h1>
          </div>
        </div>

        <ResourceTabs current="people" />

        {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

        <div className="commesse-filter-bar">
          <label className="report-control commesse-filter-name">
            <span>Nome e Cognome</span>
            <input
              value={filters.fullName}
              onChange={(e) => setFilterValue("fullName", e.target.value)}
              placeholder="Filtra nome"
            />
          </label>

          <label className="report-control">
            <span>Mansione</span>
            <input
              value={filters.roleDescription}
              onChange={(e) => setFilterValue("roleDescription", e.target.value)}
              placeholder="Filtra mansione"
            />
          </label>

          <label className="report-control">
            <span>Contatti</span>
            <input
              value={filters.contacts}
              onChange={(e) => setFilterValue("contacts", e.target.value)}
              placeholder="Filtra contatti"
            />
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
            <span>Costo Orario</span>
            <input
              value={filters.hourlyCost}
              onChange={(e) => setFilterValue("hourlyCost", e.target.value)}
              placeholder="Filtra costo"
            />
          </label>

          <button type="button" className="report-print-btn" onClick={() => setFilters(getEmptyFilters())}>
            Azzera filtri
          </button>
        </div>

        <div className="mobile-toolbar">
          <div className="mobile-table-meta commesse-table-meta">
            Righe visibili: <strong>{visibleRows.length}</strong> su {rows.length}
          </div>
        </div>

        <div className="mobile-table-shell commesse-table-shell">
          <table className="commesse-table risorse-table">
            <colgroup>
              <col className="risorse-col-name" />
              <col className="risorse-col-role" />
              <col className="risorse-col-contacts" />
              <col className="risorse-col-status" />
              <col className="risorse-col-cost" />
              <col className="risorse-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("fullName")} className="commesse-sort-button">
                    {renderSortLabel("Nome e Cognome", "fullName")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("roleDescription")} className="commesse-sort-button">
                    {renderSortLabel("Mansione", "roleDescription")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("contacts")} className="commesse-sort-button">
                    {renderSortLabel("Contatti", "contacts")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("status")} className="commesse-sort-button">
                    {renderSortLabel("Stato", "status")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("hourlyCost")} className="commesse-sort-button">
                    {renderSortLabel("Costo Orario", "hourlyCost")}
                  </button>
                </th>
                <th className="commesse-header-cell commesse-actions-header">Menu Azioni</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => {
                const isEditing = editingRowId === row.localId;

                return (
                  <tr key={row.localId}>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.fullName}
                          onChange={(e) => setRowValue(row.localId, { fullName: e.target.value })}
                          className="commesse-table-input"
                          placeholder="Nome e Cognome"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value commesse-table-value-strong">{row.fullName || "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.roleDescription}
                          onChange={(e) => setRowValue(row.localId, { roleDescription: e.target.value })}
                          className="commesse-table-input"
                          placeholder="Mansione"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value">{row.roleDescription || "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="text"
                          value={row.contacts}
                          onChange={(e) => setRowValue(row.localId, { contacts: e.target.value })}
                          className="commesse-table-input"
                          placeholder="Telefono / Email"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value">{row.contacts || "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <select
                          value={row.status}
                          onChange={(e) => setRowValue(row.localId, { status: e.target.value as ResourceStatusValue | "" })}
                          className="commesse-table-input"
                          disabled={loading || saving}
                        >
                          <option value="">Seleziona stato</option>
                          <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                          <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                          <option value="ENDED">{statusLabel("ENDED")}</option>
                        </select>
                      ) : (
                        <span className="commesse-table-value">{row.status ? statusLabel(row.status as ResourceStatusValue) : "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={row.hourlyCost}
                          onChange={(e) => setRowValue(row.localId, { hourlyCost: e.target.value })}
                          className="commesse-table-input"
                          placeholder="0.00"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value">{row.hourlyCost || "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell commesse-actions-cell">
                      <div className="commesse-row-actions">
                        <button
                          className="open-sheet-link-button"
                          type="button"
                          disabled={!row.id || isEditing}
                          onClick={() => row.id && router.push(`/risorse/${row.id}`)}
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
                            aria-label="Modifica risorsa"
                            title="Modifica"
                            onClick={() => setEditingRowId(row.localId)}
                            disabled={loading || !row.id}
                          >
                            ✎
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => (row.id ? void deleteRow(row, index) : removeUnsavedRow(row.localId))}
                          className="icon-action-button icon-action-button-danger"
                          aria-label="Elimina risorsa"
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
                  <div className="mobile-data-label">Risorsa</div>
                  <strong>{row.fullName || `Riga ${index + 1}`}</strong>
                </div>
              </div>

              {editingRowId === row.localId ? (
                <div className="mobile-data-card-grid">
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Nome e Cognome</span>
                    <input
                      type="text"
                      value={row.fullName}
                      onChange={(e) => setRowValue(row.localId, { fullName: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
                    />
                  </label>
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Mansione</span>
                    <input
                      type="text"
                      value={row.roleDescription}
                      onChange={(e) => setRowValue(row.localId, { roleDescription: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
                    />
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Stato</span>
                    <select
                      value={row.status}
                      onChange={(e) => setRowValue(row.localId, { status: e.target.value as ResourceStatusValue | "" })}
                      className="mobile-data-select"
                      disabled={loading || saving}
                    >
                      <option value="">Seleziona stato</option>
                      <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                      <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                      <option value="ENDED">{statusLabel("ENDED")}</option>
                    </select>
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Costo Orario</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.hourlyCost}
                      onChange={(e) => setRowValue(row.localId, { hourlyCost: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
                    />
                  </label>
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Contatti</span>
                    <input
                      type="text"
                      value={row.contacts}
                      onChange={(e) => setRowValue(row.localId, { contacts: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
                    />
                  </label>
                </div>
              ) : (
                <div className="mobile-data-card-grid">
                  <div className="mobile-data-field">
                    <span className="mobile-data-label">Mansione</span>
                    <strong>{row.roleDescription || "-"}</strong>
                  </div>
                  <div className="mobile-data-field">
                    <span className="mobile-data-label">Stato</span>
                    <strong>{row.status ? statusLabel(row.status as ResourceStatusValue) : "-"}</strong>
                  </div>
                  <div className="mobile-data-field">
                    <span className="mobile-data-label">Costo Orario</span>
                    <strong>{row.hourlyCost || "-"}</strong>
                  </div>
                  <div className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Contatti</span>
                    <strong>{row.contacts || "-"}</strong>
                  </div>
                </div>
              )}

              <div className="mobile-data-actions">
                <button
                  className="open-sheet-link-button"
                  type="button"
                  disabled={!row.id || editingRowId === row.localId}
                  onClick={() => row.id && router.push(`/risorse/${row.id}`)}
                >
                  Apri Scheda
                </button>
                {editingRowId === row.localId ? (
                  <>
                    <button className="button" type="button" onClick={() => void saveRow(row)} disabled={saving || loading}>
                      {savingRowId === row.localId ? "Salvo..." : "Salva"}
                    </button>
                    <button className="mobile-button-secondary" type="button" onClick={() => cancelEdit(row)} disabled={saving}>
                      Annulla
                    </button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <div className="mobile-footer-actions" style={{ marginTop: 18 }}>
          <button type="button" onClick={addRow} className="mobile-button-success" aria-label="Aggiungi riga">
            +
          </button>
        </div>
      </div>
    </div>
  );
}
