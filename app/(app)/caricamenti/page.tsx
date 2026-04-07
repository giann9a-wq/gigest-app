"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function CaricamentiPage() {
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [rows, setRows] = useState<EditableLoadingRow[]>([]);
  const [selectedResourceValue, setSelectedResourceValue] = useState("");
  const [selectedJobOrderId, setSelectedJobOrderId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
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
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore caricamento opzioni");
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, []);

  async function loadRows() {
    if (!selectedResourceValue) {
      setRows([]);
      setMessage("");
      return;
    }

    setLoadingRows(true);
    setError("");
    setMessage("");

    const params = new URLSearchParams({ resourceValue: selectedResourceValue });
    if (selectedJobOrderId) params.set("jobOrderId", selectedJobOrderId);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    try {
      const data = await safeJsonFetch(`/api/caricamenti?${params.toString()}`);
      setRows((data.rows ?? []) as EditableLoadingRow[]);
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
      setMessage("Caricamento eliminato correttamente.");
    } catch (err) {
      setRowValue(id, { isDeleting: false });
      setError(err instanceof Error ? err.message : "Errore eliminazione");
    }
  }

  const selectedResourceLabel = useMemo(
    () => resources.find((item) => item.value === selectedResourceValue)?.label ?? "",
    [resources, selectedResourceValue]
  );

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
              Seleziona una risorsa alla volta e consulta o modifica tutti i caricamenti già presenti.
            </p>
          </div>
        </div>

        <div className="stats-filter-bar" style={{ marginTop: 20 }}>
          <label className="report-control">
            <span>Risorsa</span>
            <select
              value={selectedResourceValue}
              onChange={(e) => setSelectedResourceValue(e.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Seleziona risorsa</option>
              {resources.map((resource) => (
                <option key={resource.value} value={resource.value}>
                  {resource.label}
                </option>
              ))}
            </select>
          </label>

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
            disabled={loadingOptions || !selectedResourceValue}
          >
            Applica filtri
          </button>

          <button
            type="button"
            className="report-print-btn"
            onClick={() => {
              setSelectedJobOrderId("");
              setFromDate("");
              setToDate("");
              setRows([]);
              setMessage("");
              setError("");
            }}
          >
            Azzera filtri
          </button>
        </div>

        {selectedResourceLabel ? (
          <div style={{ marginTop: 18, marginBottom: 12, fontWeight: 700, color: "#7c2d12" }}>
            Risorsa selezionata: {selectedResourceLabel}
          </div>
        ) : null}

        {message ? <div className="scad-success">{message}</div> : null}
        {error ? <div className="scad-error">{error}</div> : null}

        <div className="scad-table-tools" style={{ marginTop: 18 }}>
          <div className="muted">
            Righe visibili: <strong>{rows.length}</strong>
          </div>
        </div>

        <div className="scad-table-wrap">
          <table className="scad-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Commessa</th>
                <th>Ore</th>
                <th>Descrizione lavoro</th>
                <th>Ultimo aggiornamento</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loadingRows ? (
                <tr>
                  <td colSpan={6} className="stats-empty-cell">
                    Caricamento...
                  </td>
                </tr>
              ) : !selectedResourceValue ? (
                <tr>
                  <td colSpan={6} className="stats-empty-cell">
                    Seleziona una risorsa e premi Applica filtri per visualizzare i caricamenti
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="stats-empty-cell">
                    Nessun caricamento trovato per i filtri selezionati
                  </td>
                </tr>
              ) : (
                rows.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "row-dark" : "row-light"}>
                    <td>
                      <input
                        className="scad-table-filter-input"
                        type="date"
                        value={row.referenceDate}
                        onChange={(e) => setRowValue(row.id, { referenceDate: e.target.value })}
                        disabled={row.isSaving || row.isDeleting}
                      />
                    </td>
                    <td>
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
                    </td>
                    <td>
                      <input
                        className="scad-table-filter-input"
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={String(row.hours)}
                        onChange={(e) => setRowValue(row.id, { hours: Number(e.target.value) })}
                        disabled={row.isSaving || row.isDeleting}
                      />
                    </td>
                    <td>
                      <input
                        className="scad-table-filter-input"
                        type="text"
                        value={row.activityDescription}
                        onChange={(e) => setRowValue(row.id, { activityDescription: e.target.value })}
                        disabled={row.isSaving || row.isDeleting}
                      />
                    </td>
                    <td>{formatDateTime(row.updatedAt)}</td>
                    <td>
                      <div className="scad-table-actions">
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
                      </div>
                    </td>
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
