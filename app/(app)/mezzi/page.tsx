"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ResourceTabs } from "@/components/layout/resource-tabs";

type EquipmentTypeValue = "VEHICLE" | "EQUIPMENT";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";
type EquipmentSortKey = "nameDescription" | "type" | "status" | "hourlyCost";
type SortDirection = "asc" | "desc";

type EditableEquipmentRow = {
  localId: string;
  id?: string;
  nameDescription: string;
  type: EquipmentTypeValue | "";
  purchaseDate: string;
  status: ResourceStatusValue | "";
  isVisibleInDiary: boolean;
  hourlyCost: string;
};

type EquipmentFilters = {
  nameDescription: string;
  type: EquipmentTypeValue | "";
  status: ResourceStatusValue | "";
  hourlyCost: string;
};

function makeEmptyRow(): EditableEquipmentRow {
  return {
    localId: crypto.randomUUID(),
    nameDescription: "",
    type: "",
    purchaseDate: "",
    status: "",
    isVisibleInDiary: true,
    hourlyCost: "",
  };
}

function getEmptyFilters(): EquipmentFilters {
  return {
    nameDescription: "",
    type: "",
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

function equipmentTypeLabel(type: EquipmentTypeValue) {
  switch (type) {
    case "VEHICLE":
      return "Mezzo";
    case "EQUIPMENT":
      return "Attrezzatura";
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

function compareNumberString(a: string, b: string) {
  return Number(a || 0) - Number(b || 0);
}

function equipmentTypeRank(type: EquipmentTypeValue | "") {
  if (type === "VEHICLE") return 0;
  if (type === "EQUIPMENT") return 1;
  return 2;
}

function sortArrow(direction: SortDirection) {
  return direction === "asc" ? "\u2191" : "\u2193";
}

export default function MezziPage() {
  const router = useRouter();

  const [rows, setRows] = useState<EditableEquipmentRow[]>([
    makeEmptyRow(),
    makeEmptyRow(),
    makeEmptyRow(),
  ]);
  const [filters, setFilters] = useState<EquipmentFilters>(getEmptyFilters());
  const [sortKey, setSortKey] = useState<EquipmentSortKey>("type");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setRowValue(localId: string, patch: Partial<EditableEquipmentRow>) {
    setRows((current) => current.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }

  function setFilterValue<K extends keyof EquipmentFilters>(key: K, value: EquipmentFilters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleSort(nextKey: EquipmentSortKey) {
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

  async function persistRows(nextRows: EditableEquipmentRow[], successMessage: string) {
    const payloadRows = nextRows.map((row) => ({
      id: row.id,
      nameDescription: row.nameDescription,
      type: row.type,
      purchaseDate: row.purchaseDate,
      status: row.status,
      isVisibleInDiary: row.isVisibleInDiary,
      hourlyCost: row.hourlyCost,
    }));

    const data = await safeJsonFetch("/api/risorse/mezzi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows: payloadRows }),
    });

    setMessage(successMessage || `Salvataggio completato. Righe salvate: ${data.savedRows}.`);
    await loadRows();
  }

  async function deleteRow(row: EditableEquipmentRow, index: number) {
    const label = row.nameDescription || `riga ${index + 1}`;
    const confirmed = window.confirm(`Eliminare "${label}"?`);
    if (!confirmed) return;

    setSaving(true);
    setSavingRowId(row.localId);
    setMessage("");
    setError("");

    try {
      const updated = rows.filter((current) => current.localId !== row.localId);
      const nextRows = updated.length > 0 ? updated : [makeEmptyRow()];
      setRows(nextRows);
      await persistRows(nextRows, "Elemento eliminato.");
      if (editingRowId === row.localId) {
        setEditingRowId(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione");
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
      const data = await safeJsonFetch("/api/risorse/mezzi");

      if (!data.rows || data.rows.length === 0) {
        setRows([makeEmptyRow(), makeEmptyRow(), makeEmptyRow()]);
      } else {
        setRows(
          data.rows.map((row: any) => ({
            localId: crypto.randomUUID(),
            id: row.id,
            nameDescription: row.nameDescription ?? "",
            type: row.type ?? "",
            purchaseDate: row.purchaseDate ?? "",
            status: row.status ?? "",
            isVisibleInDiary: row.isVisibleInDiary ?? true,
            hourlyCost: row.hourlyCost?.toString() ?? "",
          }))
        );
      }
      setEditingRowId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento mezzi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows();
  }, []);

  async function saveRow(row: EditableEquipmentRow) {
    setSaving(true);
    setSavingRowId(row.localId);
    setMessage("");
    setError("");

    try {
      await persistRows(rows, "Elemento salvato.");
      setEditingRowId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
      setSavingRowId(null);
    }
  }

  function cancelEdit(row: EditableEquipmentRow) {
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
        matchesFilter(row.nameDescription, filters.nameDescription) &&
        (filters.type ? row.type === filters.type : true) &&
        (filters.status ? row.status === filters.status : true) &&
        (filters.hourlyCost ? matchesFilter(String(row.hourlyCost), filters.hourlyCost) : true)
      );
    });

    return [...filtered].sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case "nameDescription":
          result = compareText(a.nameDescription, b.nameDescription);
          break;
        case "type":
          result = equipmentTypeRank(a.type) - equipmentTypeRank(b.type) || compareText(a.nameDescription, b.nameDescription);
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

  function renderSortLabel(label: string, key: EquipmentSortKey) {
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

        <ResourceTabs current="equipment" />

        {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

        <div className="commesse-filter-bar">
          <label className="report-control commesse-filter-name">
            <span>Mezzo / Attrezzatura</span>
            <input
              value={filters.nameDescription}
              onChange={(e) => setFilterValue("nameDescription", e.target.value)}
              placeholder="Filtra nome"
            />
          </label>

          <label className="report-control">
            <span>Tipologia</span>
            <select
              value={filters.type}
              onChange={(e) => setFilterValue("type", e.target.value as EquipmentTypeValue | "")}
            >
              <option value="">Tutte</option>
              <option value="VEHICLE">{equipmentTypeLabel("VEHICLE")}</option>
              <option value="EQUIPMENT">{equipmentTypeLabel("EQUIPMENT")}</option>
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
          <table className="commesse-table mezzi-table">
            <colgroup>
              <col className="mezzi-col-name" />
              <col className="mezzi-col-type" />
              <col className="mezzi-col-status" />
              <col className="mezzi-col-cost" />
              <col className="mezzi-col-action" />
            </colgroup>
            <thead>
              <tr>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("nameDescription")} className="commesse-sort-button">
                    {renderSortLabel("Mezzo / Attrezzatura", "nameDescription")}
                  </button>
                </th>
                <th className="commesse-header-cell">
                  <button type="button" onClick={() => toggleSort("type")} className="commesse-sort-button">
                    {renderSortLabel("Tipologia", "type")}
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
                          value={row.nameDescription}
                          onChange={(e) => setRowValue(row.localId, { nameDescription: e.target.value })}
                          className="commesse-table-input"
                          placeholder="Nome"
                          disabled={loading || saving}
                        />
                      ) : (
                        <span className="commesse-table-value commesse-table-value-strong">{row.nameDescription || "-"}</span>
                      )}
                    </td>
                    <td className="commesse-body-cell">
                      {isEditing ? (
                        <select
                          value={row.type}
                          onChange={(e) => setRowValue(row.localId, { type: e.target.value as EquipmentTypeValue | "" })}
                          className="commesse-table-input"
                          disabled={loading || saving}
                        >
                          <option value="">Seleziona tipologia</option>
                          <option value="VEHICLE">{equipmentTypeLabel("VEHICLE")}</option>
                          <option value="EQUIPMENT">{equipmentTypeLabel("EQUIPMENT")}</option>
                        </select>
                      ) : (
                        <span className="commesse-table-value">{row.type ? equipmentTypeLabel(row.type as EquipmentTypeValue) : "-"}</span>
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
                          onClick={() => row.id && router.push(`/mezzi/${row.id}`)}
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
                            aria-label="Modifica"
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
                          aria-label="Elimina"
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
                  <div className="mobile-data-label">Elemento</div>
                  <strong>{row.nameDescription || `Riga ${index + 1}`}</strong>
                </div>
              </div>

              {editingRowId === row.localId ? (
                <div className="mobile-data-card-grid">
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Nome</span>
                    <input
                      type="text"
                      value={row.nameDescription}
                      onChange={(e) => setRowValue(row.localId, { nameDescription: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
                    />
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Tipologia</span>
                    <select
                      value={row.type}
                      onChange={(e) => setRowValue(row.localId, { type: e.target.value as EquipmentTypeValue | "" })}
                      className="mobile-data-select"
                      disabled={loading || saving}
                    >
                      <option value="">Seleziona</option>
                      <option value="VEHICLE">{equipmentTypeLabel("VEHICLE")}</option>
                      <option value="EQUIPMENT">{equipmentTypeLabel("EQUIPMENT")}</option>
                    </select>
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Stato</span>
                    <select
                      value={row.status}
                      onChange={(e) => setRowValue(row.localId, { status: e.target.value as ResourceStatusValue | "" })}
                      className="mobile-data-select"
                      disabled={loading || saving}
                    >
                      <option value="">Seleziona</option>
                      <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                      <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                      <option value="ENDED">{statusLabel("ENDED")}</option>
                    </select>
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Data acquisto</span>
                    <input
                      type="date"
                      value={row.purchaseDate}
                      onChange={(e) => setRowValue(row.localId, { purchaseDate: e.target.value })}
                      className="mobile-data-input"
                      disabled={loading || saving}
                    />
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
                </div>
              ) : (
                <div className="mobile-data-card-grid">
                  <div className="mobile-data-field">
                    <span className="mobile-data-label">Tipologia</span>
                    <strong>{row.type ? equipmentTypeLabel(row.type as EquipmentTypeValue) : "-"}</strong>
                  </div>
                  <div className="mobile-data-field">
                    <span className="mobile-data-label">Stato</span>
                    <strong>{row.status ? statusLabel(row.status as ResourceStatusValue) : "-"}</strong>
                  </div>
                  <div className="mobile-data-field">
                    <span className="mobile-data-label">Data acquisto</span>
                    <strong>{row.purchaseDate || "-"}</strong>
                  </div>
                  <div className="mobile-data-field">
                    <span className="mobile-data-label">Costo Orario</span>
                    <strong>{row.hourlyCost || "-"}</strong>
                  </div>
                </div>
              )}

              <div className="mobile-data-actions">
                <button
                  className="open-sheet-link-button"
                  type="button"
                  disabled={!row.id || editingRowId === row.localId}
                  onClick={() => row.id && router.push(`/mezzi/${row.id}`)}
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
