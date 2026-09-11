"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ResourceTabs } from "@/components/layout/resource-tabs";

type ResourceOption = {
  value: string;
  label: string;
  type: "PERSON" | "EQUIPMENT";
  status: string;
};

type JobOrderOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type LoadingRow = {
  id: string;
  referenceDate: string;
  resourceType: "PERSON" | "EQUIPMENT";
  personId: string | null;
  equipmentId: string | null;
  personLabel: string;
  equipmentLabel: string;
  resourceLabel: string;
  jobOrderId: string;
  jobOrderLabel: string;
  jobOrderType: string;
  hours: number;
  activityDescription: string;
  createdAt: string;
  updatedAt: string;
};

type EditableLoadingRow = LoadingRow & {
  isSaving?: boolean;
  isDeleting?: boolean;
};

type SortKey =
  | "referenceDate"
  | "resourceLabel"
  | "jobOrderLabel"
  | "hours"
  | "activityDescription"
  | "updatedAt";
type SortDirection = "asc" | "desc";

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

function formatDateTime(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "it", { sensitivity: "base" });
}

function sortArrow(direction: SortDirection) {
  return direction === "asc" ? "↑" : "↓";
}

function ResourceMultiSelect({
  options,
  selectedValues,
  onChange,
  disabled,
}: {
  options: ResourceOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedLabels = options
    .filter((option) => selectedValues.includes(option.value))
    .map((option) => option.label);
  const summary =
    selectedLabels.length === 0
      ? "Seleziona risorse"
      : selectedLabels.length === 1
        ? selectedLabels[0]
        : `${selectedLabels.length} risorse selezionate`;
  const allSelected = options.length > 0 && selectedValues.length === options.length;

  function toggleValue(value: string) {
    onChange(
      selectedValues.includes(value)
        ? selectedValues.filter((item) => item !== value)
        : [...selectedValues, value]
    );
  }

  return (
    <div className="stats-multi caricamenti-resource-picker" ref={containerRef}>
      <span>Risorse</span>
      <button
        type="button"
        className="stats-multi-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        disabled={disabled}
      >
        <span className="stats-multi-summary">{summary}</span>
        <span className="stats-multi-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="stats-multi-menu">
          <label className="stats-multi-option caricamenti-resource-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => onChange(allSelected ? [] : options.map((option) => option.value))}
            />
            <span>{allSelected ? "Deseleziona tutte" : "Seleziona tutte"}</span>
          </label>
          {options.map((option) => (
            <label key={option.value} className="stats-multi-option">
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                onChange={() => toggleValue(option.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function CaricamentiPage() {
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [rows, setRows] = useState<EditableLoadingRow[]>([]);
  const [editingRowId, setEditingRowId] = useState("");
  const [canManageLoadings, setCanManageLoadings] = useState(false);
  const [selectedResourceValues, setSelectedResourceValues] = useState<string[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("referenceDate");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [loadingRows, setLoadingRows] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      setError("");

      try {
        const data = await safeJsonFetch("/api/caricamenti/options");
        setResources(data.resources ?? []);
        setJobOrders(data.jobOrders ?? []);
        setCanManageLoadings(Boolean(data.canManageLoadings));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore caricamento opzioni");
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, []);

  async function loadRows() {
    if (selectedResourceValues.length === 0) {
      setRows([]);
      setMessage("");
      return;
    }

    setLoadingRows(true);
    setError("");
    setMessage("");

    const params = new URLSearchParams();
    selectedResourceValues.forEach((value) => params.append("resourceValue", value));
    if (selectedJobOrderId) params.set("jobOrderId", selectedJobOrderId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    try {
      const data = await safeJsonFetch(`/api/caricamenti?${params.toString()}`);
      setRows((data.rows ?? []) as EditableLoadingRow[]);
      setEditingRowId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento caricamenti");
    } finally {
      setLoadingRows(false);
    }
  }

  function setRowValue(id: string, patch: Partial<EditableLoadingRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  async function handleSaveRow(row: EditableLoadingRow) {
    setRowValue(row.id, { isSaving: true });
    setError("");
    setMessage("");

    try {
      const data = await safeJsonFetch(`/api/caricamenti/${row.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceDate: row.referenceDate,
          jobOrderId: row.jobOrderId,
          hours: row.hours,
          activityDescription: row.activityDescription,
        }),
      });

      setRows((current) =>
        current.map((currentRow) =>
          currentRow.id === row.id ? ({ ...(data.row as EditableLoadingRow), isSaving: false }) : currentRow
        )
      );
      setEditingRowId("");
      setMessage("Caricamento aggiornato correttamente.");
    } catch (err) {
      setRowValue(row.id, { isSaving: false });
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    }
  }

  async function handleDeleteRow(id: string) {
    setRowValue(id, { isDeleting: true });
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/caricamenti/${id}`, {
        method: "DELETE",
      });

      setRows((current) => current.filter((row) => row.id !== id));
      setEditingRowId("");
      setMessage("Caricamento eliminato correttamente.");
    } catch (err) {
      setRowValue(id, { isDeleting: false });
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  }

  const selectedResourceLabels = useMemo(
    () => resources.filter((item) => selectedResourceValues.includes(item.value)).map((item) => item.label),
    [resources, selectedResourceValues]
  );

  const visibleRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case "referenceDate":
          result = compareText(a.referenceDate, b.referenceDate);
          break;
        case "resourceLabel":
          result = compareText(a.resourceLabel, b.resourceLabel);
          break;
        case "jobOrderLabel":
          result = compareText(a.jobOrderLabel, b.jobOrderLabel);
          break;
        case "hours":
          result = a.hours - b.hours;
          break;
        case "activityDescription":
          result = compareText(a.activityDescription, b.activityDescription);
          break;
        case "updatedAt":
          result = compareText(a.updatedAt, b.updatedAt);
          break;
      }

      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, sortDirection, sortKey]);

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection(nextKey === "referenceDate" || nextKey === "updatedAt" ? "desc" : "asc");
  }

  function renderSortHeader(label: string, key: SortKey) {
    return (
      <button type="button" className="caricamenti-sort-button" onClick={() => toggleSort(key)}>
        {label} {sortKey === key ? sortArrow(sortDirection) : ""}
      </button>
    );
  }

  function handleExportExcel() {
    if (selectedResourceValues.length === 0) return;

    const params = new URLSearchParams();
    selectedResourceValues.forEach((value) => params.append("resourceValue", value));
    if (selectedJobOrderId) params.set("jobOrderId", selectedJobOrderId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    window.location.href = `/api/caricamenti/export?${params.toString()}`;
  }

  return (
    <div className="grid gap-4">
      <div className="card">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Caricamenti</h1>
            <p className="muted" style={{ margin: 0 }}>
              Seleziona una o più risorse e consulta o modifica tutti i caricamenti già presenti.
            </p>
          </div>
        </div>

        <ResourceTabs current="loadings" />

        <div className="stats-filter-bar" style={{ marginTop: 20 }}>
          <ResourceMultiSelect
            options={resources}
            selectedValues={selectedResourceValues}
            onChange={(values) => {
              setSelectedResourceValues(values);
              setRows([]);
              setEditingRowId("");
              setMessage("");
            }}
            disabled={loadingOptions}
          />

          <label className="report-control">
            <span>Commessa</span>
            <select
              value={selectedJobOrderId}
              onChange={(e) => setSelectedJobOrderId(e.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Tutte</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </label>

          <label className="report-control">
            <span>Dal</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>

          <label className="report-control">
            <span>Al</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>

          <button
            type="button"
            className="button"
            onClick={loadRows}
            disabled={loadingOptions || selectedResourceValues.length === 0}
          >
            Applica filtri
          </button>

          <button
            type="button"
            className="report-print-btn"
            onClick={() => {
              setSelectedResourceValues([]);
              setSelectedJobOrderId("");
              setFromDate("");
              setToDate("");
              setRows([]);
              setEditingRowId("");
              setMessage("");
              setError("");
            }}
          >
            Azzera filtri
          </button>
        </div>

        {selectedResourceLabels.length > 0 ? (
          <div style={{ marginTop: 18, marginBottom: 12, fontWeight: 700, color: "#7c2d12" }}>
            Risorse selezionate: {selectedResourceLabels.join(", ")}
          </div>
        ) : null}

        {message ? <div className="scad-success">{message}</div> : null}
        {error ? <div className="scad-error">{error}</div> : null}

        <div className="scad-table-tools" style={{ marginTop: 18 }}>
          <div className="muted">
            Righe visibili: <strong>{visibleRows.length}</strong>
          </div>
          <button
            type="button"
            className="report-print-btn"
            onClick={handleExportExcel}
            disabled={selectedResourceValues.length === 0 || loadingRows}
          >
            Export Excel
          </button>
        </div>

        <div className="scad-table-wrap">
          <table className="scad-table caricamenti-table">
            <thead>
              <tr>
                <th>{renderSortHeader("Data", "referenceDate")}</th>
                <th>{renderSortHeader("Risorsa", "resourceLabel")}</th>
                <th>{renderSortHeader("Commessa", "jobOrderLabel")}</th>
                <th>{renderSortHeader("Ore", "hours")}</th>
                <th>{renderSortHeader("Descrizione lavoro", "activityDescription")}</th>
                <th>{renderSortHeader("Ultimo aggiornamento", "updatedAt")}</th>
                {canManageLoadings ? <th>Azioni</th> : null}
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr>
                  <td colSpan={canManageLoadings ? 7 : 6} className="stats-empty-cell">
                    Caricamento...
                  </td>
                </tr>
              ) : selectedResourceValues.length === 0 ? (
                <tr>
                  <td colSpan={canManageLoadings ? 7 : 6} className="stats-empty-cell">
                    Seleziona una o più risorse e premi Applica filtri per visualizzare i caricamenti
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={canManageLoadings ? 7 : 6} className="stats-empty-cell">
                    Nessun caricamento trovato per i filtri selezionati
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "row-dark" : "row-light"}>
                    <td>
                      {editingRowId === row.id ? (
                        <input
                          className="scad-table-filter-input"
                          type="date"
                          value={row.referenceDate}
                          onChange={(e) => setRowValue(row.id, { referenceDate: e.target.value })}
                          disabled={row.isSaving || row.isDeleting}
                        />
                      ) : (
                        formatDate(row.referenceDate)
                      )}
                    </td>
                    <td>{row.resourceLabel}</td>
                    <td>
                      {editingRowId === row.id ? (
                        <select
                          className="scad-table-filter-input"
                          value={row.jobOrderId}
                          onChange={(e) =>
                            setRowValue(row.id, {
                              jobOrderId: e.target.value,
                              jobOrderLabel: jobOrders.find((item) => item.id === e.target.value)?.name ?? "",
                              jobOrderType: jobOrders.find((item) => item.id === e.target.value)?.type ?? "",
                            })
                          }
                          disabled={row.isSaving || row.isDeleting}
                        >
                          <option value="">Seleziona commessa</option>
                          {jobOrders.map((jobOrder) => (
                            <option key={jobOrder.id} value={jobOrder.id}>
                              {jobOrder.name} ({jobOrder.type})
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{row.jobOrderLabel}</span>
                      )}
                    </td>
                    <td>
                      {editingRowId === row.id ? (
                        <input
                          className="scad-table-filter-input"
                          type="number"
                          step="0.1"
                          min="0.1"
                          value={String(row.hours)}
                          onChange={(e) => setRowValue(row.id, { hours: Number(e.target.value) })}
                          disabled={row.isSaving || row.isDeleting}
                        />
                      ) : (
                        row.hours
                      )}
                    </td>
                    <td>
                      {editingRowId === row.id ? (
                        <input
                          className="scad-table-filter-input"
                          type="text"
                          value={row.activityDescription}
                          onChange={(e) => setRowValue(row.id, { activityDescription: e.target.value })}
                          disabled={row.isSaving || row.isDeleting}
                        />
                      ) : (
                        row.activityDescription || "-"
                      )}
                    </td>
                    <td>{formatDateTime(row.updatedAt)}</td>
                    {canManageLoadings ? (
                      <td>
                        <div className="scad-table-actions">
                          {editingRowId === row.id ? (
                            <>
                              <button
                                type="button"
                                className="scad-small-btn"
                                onClick={() => handleSaveRow(row)}
                                disabled={row.isSaving || row.isDeleting}
                              >
                                {row.isSaving ? "Salvataggio..." : "Salva"}
                              </button>
                              <button
                                type="button"
                                className="scad-danger-btn"
                                onClick={() => handleDeleteRow(row.id)}
                                disabled={row.isSaving || row.isDeleting}
                              >
                                {row.isDeleting ? "Eliminazione..." : "Elimina"}
                              </button>
                              <button
                                type="button"
                                className="scad-small-btn"
                                onClick={() => loadRows()}
                                disabled={row.isSaving || row.isDeleting}
                              >
                                Annulla
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="caricamenti-edit-button"
                              onClick={() => setEditingRowId(row.id)}
                              aria-label="Modifica caricamento"
                              title="Modifica caricamento"
                            >
                              Modifica
                            </button>
                          )}
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
