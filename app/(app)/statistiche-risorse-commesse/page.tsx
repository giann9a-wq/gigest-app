"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { JobOrderTabs } from "@/components/layout/job-order-tabs";
import { formatCurrency, formatNumber } from "@/lib/number-format";

type StatisticsRow = {
  resourceLabel: string;
  resourceType: "PERSON" | "EQUIPMENT";
  jobOrderName: string;
  jobOrderType: string;
  totalHours: number;
  totalCost: number;
  activities: StatisticsActivity[];
};

type StatisticsActivity = {
  id: string;
  referenceDate: string;
  source: "MANUAL" | "AUTO";
  jobOrderId: string;
  jobOrderName: string;
  hours: number;
};

type StatisticsResponse = {
  rows: StatisticsRow[];
  appliedFilters: {
    from: string;
    to: string;
  };
};

type StatisticsOptionsResponse = {
  resourceOptions: string[];
  jobOrderOptions: string[];
  jobOrderRows: Array<{ id: string; name: string }>;
};

type SortKey = "resourceLabel" | "jobOrderName" | "totalHours" | "totalCost";
type SortDirection = "asc" | "desc";

type MultiSelectDropdownProps = {
  label: string;
  options: string[];
  selectedValues: string[];
  onChange: (nextValues: string[]) => void;
};

function formatHours(value: number) {
  return formatNumber(value);
}

async function safeJsonFetch(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore caricamento statistiche");
  }

  return data as StatisticsResponse;
}

async function safeOptionsFetch(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore caricamento opzioni");
  }

  return data as StatisticsOptionsResponse;
}

function downloadFile(content: string, fileName: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function MultiSelectDropdown({
  label,
  options,
  selectedValues,
  onChange,
}: MultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!containerRef.current) return;
      if (containerRef.current.contains(event.target as Node)) return;
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const summary =
    selectedValues.length === 0
      ? "Tutti"
      : selectedValues.length === 1
      ? selectedValues[0]
      : `${selectedValues.length} selezionati`;

  function toggleValue(value: string) {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter((item) => item !== value));
      return;
    }

    onChange([...selectedValues, value]);
  }

  return (
    <div className="stats-multi" ref={containerRef}>
      <span>{label}</span>
      <button type="button" className="stats-multi-trigger" onClick={() => setOpen((current) => !current)}>
        <span className="stats-multi-summary">{summary}</span>
        <span className="stats-multi-caret">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="stats-multi-menu">
          {options.length === 0 ? (
            <div className="stats-multi-empty">Nessuna opzione</div>
          ) : (
            options.map((option) => (
              <label key={option} className="stats-multi-option">
                <input
                  type="checkbox"
                  checked={selectedValues.includes(option)}
                  onChange={() => toggleValue(option)}
                />
                <span>{option}</span>
              </label>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function StatisticheRisorseCommessePage() {
  const [rows, setRows] = useState<StatisticsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selectedResources, setSelectedResources] = useState<string[]>([]);
  const [selectedJobOrders, setSelectedJobOrders] = useState<string[]>([]);
  const [resourceOptions, setResourceOptions] = useState<string[]>([]);
  const [jobOrderOptions, setJobOrderOptions] = useState<string[]>([]);
  const [jobOrderRows, setJobOrderRows] = useState<Array<{ id: string; name: string }>>([]);
  const [editingRow, setEditingRow] = useState<StatisticsRow | null>(null);
  const [savingActivityId, setSavingActivityId] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("resourceLabel");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);

      try {
        const data = await safeOptionsFetch("/api/statistiche-risorse-commesse?mode=options");
        setResourceOptions(data.resourceOptions);
        setJobOrderOptions(data.jobOrderOptions);
        setJobOrderRows(data.jobOrderRows ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore caricamento opzioni");
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, []);

  async function loadRows(targetFrom = fromDate, targetTo = toDate) {
    setLoading(true);
    setError("");
    setHasSearched(true);

    try {
      const data = await safeJsonFetch(
        `/api/statistiche-risorse-commesse?from=${targetFrom}&to=${targetTo}`
      );
      setRows(data.rows);
      setFromDate(data.appliedFilters.from);
      setToDate(data.appliedFilters.to);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  }

  function toggleSort(nextKey: SortKey) {
    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      return (
        (selectedResources.length === 0 || selectedResources.includes(row.resourceLabel)) &&
        (selectedJobOrders.length === 0 || selectedJobOrders.includes(row.jobOrderName))
      );
    });

    return [...filtered].sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case "resourceLabel":
          result = a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" });
          break;
        case "jobOrderName":
          result = a.jobOrderName.localeCompare(b.jobOrderName, "it", { sensitivity: "base" });
          break;
        case "totalHours":
          result = a.totalHours - b.totalHours;
          break;
        case "totalCost":
          result = a.totalCost - b.totalCost;
          break;
      }

      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, selectedJobOrders, selectedResources, sortDirection, sortKey]);

  const totals = useMemo(() => {
    return visibleRows.reduce(
      (acc, row) => {
        acc.totalHours += row.totalHours;
        acc.totalCost += row.totalCost;
        return acc;
      },
      { totalHours: 0, totalCost: 0 }
    );
  }, [visibleRows]);

  function renderSortLabel(label: string, key: SortKey) {
    if (sortKey !== key) return label;
    return `${label} ${sortDirection === "asc" ? "↑" : "↓"}`;
  }

  async function updateActivity(activity: StatisticsActivity, formData: FormData) {
    setSavingActivityId(activity.id);
    setError("");

    try {
      const response = await fetch("/api/statistiche-risorse-commesse", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activityId: activity.id,
          referenceDate: String(formData.get("referenceDate") ?? ""),
          jobOrderId: String(formData.get("jobOrderId") ?? ""),
          hours: String(formData.get("hours") ?? ""),
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore salvataggio caricamento");
      }

      setEditingRow(null);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore salvataggio caricamento");
    } finally {
      setSavingActivityId("");
    }
  }

  function PencilIcon() {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    );
  }

  function handleExportExcelCompat() {
    const lines = [
      ["Risorsa", "Commessa", "Totale ore", "Totale costo"].join("\t"),
      ...visibleRows.map((row) =>
        [
          row.resourceLabel,
          row.jobOrderName,
          formatHours(row.totalHours),
          formatCurrency(row.totalCost),
        ].join("\t")
      ),
    ];

    downloadFile(
      lines.join("\n"),
      "statistiche-risorse-commesse.xls",
      "application/vnd.ms-excel;charset=utf-8;"
    );
  }

  return (
    <div className="grid gap-4">
      <div className="card">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Gestione Commesse</h1>
            <p className="mobile-section-subtitle">
              Estrazione statistiche trasversali per risorsa e commessa.
            </p>
          </div>
        </div>

        <JobOrderTabs current="statistics" />

        <div className="stats-filter-bar">
          <MultiSelectDropdown
            label="Risorsa"
            options={resourceOptions}
            selectedValues={selectedResources}
            onChange={setSelectedResources}
          />

          <MultiSelectDropdown
            label="Commessa"
            options={jobOrderOptions}
            selectedValues={selectedJobOrders}
            onChange={setSelectedJobOrders}
          />

          <label className="report-control">
            <span>Dal</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </label>

          <label className="report-control">
            <span>Al</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </label>

          <button type="button" className="button" onClick={() => loadRows()}>
            Applica filtri
          </button>

          <button
            type="button"
            className="report-print-btn"
            onClick={() => {
              setSelectedResources([]);
              setSelectedJobOrders([]);
            }}
          >
            Azzera selezioni
          </button>
        </div>

        <div className="stats-toolbar">
          <div className="muted">
            Righe visibili: <strong>{visibleRows.length}</strong> | Totale ore:{" "}
            <strong>{formatHours(totals.totalHours)}</strong> | Totale costo:{" "}
            <strong>{formatCurrency(totals.totalCost)}</strong>
          </div>

          <div className="stats-export-actions">
            <button
              type="button"
              className="button"
              onClick={handleExportExcelCompat}
              disabled={loadingOptions || !hasSearched || visibleRows.length === 0}
            >
              Esporta Excel
            </button>
          </div>
        </div>

        {error ? <div className="scad-error">{error}</div> : null}

        <div style={{ overflowX: "auto" }}>
          <table className="scad-table">
            <thead>
              <tr>
                <th>
                  <button type="button" className="scad-table-sort-btn" onClick={() => toggleSort("resourceLabel")}>
                    {renderSortLabel("Risorsa", "resourceLabel")}
                  </button>
                </th>
                <th>
                  <button type="button" className="scad-table-sort-btn" onClick={() => toggleSort("jobOrderName")}>
                    {renderSortLabel("Commessa", "jobOrderName")}
                  </button>
                </th>
                <th>
                  <button type="button" className="scad-table-sort-btn" onClick={() => toggleSort("totalHours")}>
                    {renderSortLabel("Totale ore", "totalHours")}
                  </button>
                </th>
                <th>
                  <button type="button" className="scad-table-sort-btn" onClick={() => toggleSort("totalCost")}>
                    {renderSortLabel("Totale costo", "totalCost")}
                  </button>
                </th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="stats-empty-cell">
                    Caricamento...
                  </td>
                </tr>
              ) : !hasSearched ? (
                <tr>
                  <td colSpan={5} className="stats-empty-cell">
                    Seleziona i filtri e premi Applica filtri per visualizzare i dati
                  </td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="stats-empty-cell">
                    Nessun risultato per i filtri selezionati
                  </td>
                </tr>
              ) : (
                visibleRows.map((row, index) => (
                  <tr key={`${row.resourceLabel}-${row.jobOrderName}`} className={index % 2 === 0 ? "row-dark" : "row-light"}>
                    <td>{row.resourceLabel}</td>
                    <td>{row.jobOrderName}</td>
                    <td>{formatHours(row.totalHours)}</td>
                    <td>{formatCurrency(row.totalCost)}</td>
                    <td>
                      <button
                        type="button"
                        className="stats-icon-action"
                        onClick={() => setEditingRow(row)}
                        title="Modifica caricamenti"
                        aria-label="Modifica caricamenti"
                      >
                        <PencilIcon />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editingRow ? (
        <div className="stats-edit-backdrop" role="dialog" aria-modal="true">
          <section className="stats-edit-modal">
            <div className="stats-edit-head">
              <div>
                <h2>Modifica caricamenti</h2>
                <p className="muted">
                  {editingRow.resourceLabel} - {editingRow.jobOrderName}
                </p>
              </div>
              <button type="button" className="mobile-button-secondary" onClick={() => setEditingRow(null)}>
                Chiudi
              </button>
            </div>
            <div className="stats-edit-list">
              {editingRow.activities.map((activity) => (
                <form
                  key={activity.id}
                  className="stats-edit-row"
                  action={(formData) => void updateActivity(activity, formData)}
                >
                  <label>
                    <span>Data</span>
                    <input name="referenceDate" type="date" defaultValue={activity.referenceDate} />
                  </label>
                  <label>
                    <span>Ore</span>
                    <input name="hours" type="number" step="0.5" min="0.5" max="24" defaultValue={activity.hours} />
                  </label>
                  <label>
                    <span>Commessa</span>
                    <select name="jobOrderId" defaultValue={activity.jobOrderId}>
                      {jobOrderRows.map((jobOrder) => (
                        <option key={jobOrder.id} value={jobOrder.id}>
                          {jobOrder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="stats-source-pill">
                    {activity.source === "AUTO" ? "Automatico" : "Manuale"}
                  </span>
                  <button type="submit" className="button" disabled={savingActivityId === activity.id}>
                    {savingActivityId === activity.id ? "Salvataggio..." : "Salva"}
                  </button>
                </form>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
