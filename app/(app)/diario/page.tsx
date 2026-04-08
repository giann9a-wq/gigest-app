"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type ResourceOption = {
  value: string;
  label: string;
  type: "PERSON" | "EQUIPMENT";
};

type JobOrderOption = {
  id: string;
  name: string;
  type: string;
};

type EditableRow = {
  localId: string;
  resourceValue: string;
  jobOrderId: string;
  hours: string;
  activityDescription: string;
};

function todayAsInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeEmptyRow(): EditableRow {
  return {
    localId: crypto.randomUUID(),
    resourceValue: "",
    jobOrderId: "",
    hours: "",
    activityDescription: "",
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

function formatDisplayDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

export default function DiarioPage() {
  const router = useRouter();
  const [referenceDate, setReferenceDate] = useState(todayAsInputValue());
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [rows, setRows] = useState<EditableRow[]>([makeEmptyRow(), makeEmptyRow(), makeEmptyRow()]);

  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setRowValue(localId: string, patch: Partial<EditableRow>) {
    setRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((current) => [...current, makeEmptyRow()]);
  }

  function duplicateRow(localId: string) {
    setRows((current) => {
      const sourceRow = current.find((row) => row.localId === localId);
      if (!sourceRow) return current;

      return [
        ...current,
        {
          ...sourceRow,
          localId: crypto.randomUUID(),
        },
      ];
    });
  }

  function removeRow(localId: string) {
    setRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyRow()];
    });
  }

  async function loadOptions() {
    const data = await safeJsonFetch("/api/diario/options");
    setResources(data.resources ?? []);
    setJobOrders(data.jobOrders ?? []);
  }

  async function loadRows(date: string) {
    setLoadingRows(true);

    try {
      const data = await safeJsonFetch(`/api/diario/batch?date=${date}`);

      if (!data.rows || data.rows.length === 0) {
        setRows([makeEmptyRow(), makeEmptyRow(), makeEmptyRow()]);
      } else {
        setRows(
          data.rows.map((row: any) => ({
            localId: crypto.randomUUID(),
            resourceValue: row.resourceValue ?? "",
            jobOrderId: row.jobOrderId ?? "",
            hours: row.hours?.toString() ?? "",
            activityDescription: row.activityDescription ?? "",
          }))
        );
      }
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError("");

      try {
        await loadOptions();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento opzioni");
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, []);

  useEffect(() => {
    async function refreshRows() {
      setError("");

      try {
        await loadRows(referenceDate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento attivita");
      }
    }

    void refreshRows();
  }, [referenceDate]);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const payloadRows = rows.map((row) => ({
        resourceValue: row.resourceValue,
        jobOrderId: row.jobOrderId,
        hours: row.hours,
        activityDescription: row.activityDescription,
      }));

      const data = await safeJsonFetch("/api/diario/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceDate,
          rows: payloadRows,
        }),
      });

      setMessage(`Salvataggio completato. Righe salvate: ${data.savedRows}.`);
      await loadRows(referenceDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  const totalHours = useMemo(
    () =>
      rows.reduce((sum, row) => {
        const numericHours = Number(row.hours);
        return Number.isFinite(numericHours) ? sum + numericHours : sum;
      }, 0),
    [rows]
  );

  const completedRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.resourceValue.trim() &&
          row.jobOrderId.trim() &&
          row.hours.trim() &&
          row.activityDescription.trim()
      ).length,
    [rows]
  );

  return (
    <div className="diary-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Inserimento Operativo</p>
            <h1 className="mobile-section-title">Diario del cantiere</h1>
            <p className="mobile-section-subtitle">
              Vista ottimizzata per mobile: scegli il giorno, compila le attivita come schede e salva senza scorrimenti orizzontali.
            </p>
          </div>
        </div>

        <div className="diary-topbar">
          <article className="card diary-date-card">
            <label className="mobile-data-field">
              <span className="mobile-data-label">Giorno operativo</span>
              <input
                type="date"
                value={referenceDate}
                onChange={(e) => setReferenceDate(e.target.value)}
                className="diary-date-input"
              />
            </label>
            <div className="muted">Stai compilando il diario del {formatDisplayDate(referenceDate)}.</div>
          </article>

          <article className="card diary-summary-card">
            <div className="diary-summary-grid">
              <div className="diary-summary-item">
                <span className="mobile-data-label">Righe</span>
                <strong className="diary-summary-value">{rows.length}</strong>
              </div>
              <div className="diary-summary-item">
                <span className="mobile-data-label">Compilate</span>
                <strong className="diary-summary-value">{completedRows}</strong>
              </div>
              <div className="diary-summary-item">
                <span className="mobile-data-label">Ore Totali</span>
                <strong className="diary-summary-value">{totalHours.toFixed(1)}</strong>
              </div>
            </div>

            <div className="diary-quick-actions">
              <button className="button" type="button" onClick={() => router.push("/risorse")}>
                Vedi risorse
              </button>
              <button className="button" type="button" onClick={() => router.push("/commesse")}>
                Vedi commesse
              </button>
              <button
                className="mobile-button-secondary"
                type="button"
                onClick={() => router.push("/statistiche-risorse-commesse")}
              >
                Statistiche
              </button>
            </div>
          </article>
        </div>

        {message ? <div className="scad-success">{message}</div> : null}
        {error ? <div className="scad-error">{error}</div> : null}

        <div className="diary-table-shell">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headerCell}>Risorsa</th>
                <th style={headerCell}>Commessa</th>
                <th style={headerCellSmall}>Ore</th>
                <th style={headerCell}>Descrizione Lavoro</th>
                <th style={headerCellTiny}></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.localId}>
                  <td style={bodyCell}>
                    <select
                      value={row.resourceValue}
                      onChange={(e) => setRowValue(row.localId, { resourceValue: e.target.value })}
                      style={inputStyle}
                      disabled={loading || loadingRows}
                    >
                      <option value="">Seleziona risorsa</option>
                      {resources.map((resource) => (
                        <option key={resource.value} value={resource.value}>
                          {resource.label}
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={bodyCell}>
                    <select
                      value={row.jobOrderId}
                      onChange={(e) => setRowValue(row.localId, { jobOrderId: e.target.value })}
                      style={inputStyle}
                      disabled={loading || loadingRows}
                    >
                      <option value="">Seleziona commessa</option>
                      {jobOrders.map((job) => (
                        <option key={job.id} value={job.id}>
                          {job.name} ({job.type})
                        </option>
                      ))}
                    </select>
                  </td>

                  <td style={bodyCell}>
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={row.hours}
                      onChange={(e) => setRowValue(row.localId, { hours: e.target.value })}
                      style={inputStyle}
                      placeholder="0.0"
                      disabled={loadingRows}
                    />
                  </td>

                  <td style={bodyCell}>
                    <input
                      type="text"
                      value={row.activityDescription}
                      onChange={(e) =>
                        setRowValue(row.localId, { activityDescription: e.target.value })
                      }
                      style={inputStyle}
                      placeholder="Descrizione lavoro"
                      disabled={loadingRows}
                    />
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

        <div className="diary-mobile-list">
          {rows.map((row, index) => (
            <article key={row.localId} className="card diary-row-card">
              <div className="diary-row-card-head">
                <div>
                  <div className="mobile-data-label">Attivita</div>
                  <strong>Riga {index + 1}</strong>
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

              <div className="diary-row-grid">
                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Risorsa</span>
                  <select
                    value={row.resourceValue}
                    onChange={(e) => setRowValue(row.localId, { resourceValue: e.target.value })}
                    className="mobile-data-select"
                    disabled={loading || loadingRows}
                  >
                    <option value="">Seleziona risorsa</option>
                    {resources.map((resource) => (
                      <option key={resource.value} value={resource.value}>
                        {resource.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Commessa</span>
                  <select
                    value={row.jobOrderId}
                    onChange={(e) => setRowValue(row.localId, { jobOrderId: e.target.value })}
                    className="mobile-data-select"
                    disabled={loading || loadingRows}
                  >
                    <option value="">Seleziona commessa</option>
                    {jobOrders.map((job) => (
                      <option key={job.id} value={job.id}>
                        {job.name} ({job.type})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="mobile-data-field">
                  <span className="mobile-data-label">Ore</span>
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={row.hours}
                    onChange={(e) => setRowValue(row.localId, { hours: e.target.value })}
                    className="mobile-data-input"
                    placeholder="0.0"
                    disabled={loadingRows}
                  />
                </label>

                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Descrizione Lavoro</span>
                  <textarea
                    value={row.activityDescription}
                    onChange={(e) =>
                      setRowValue(row.localId, { activityDescription: e.target.value })
                    }
                    className="mobile-data-input diary-row-textarea"
                    placeholder="Descrivi l'attivita svolta"
                    disabled={loadingRows}
                  />
                </label>
              </div>

              <div className="diary-row-actions">
                <button
                  type="button"
                  className="mobile-button-secondary"
                  onClick={() => duplicateRow(row.localId)}
                  disabled={loadingRows}
                >
                  Duplica riga
                </button>
              </div>
            </article>
          ))}
        </div>

        <div className="diary-footer-actions" style={{ marginTop: 18 }}>
          <button
            type="button"
            onClick={addRow}
            className="mobile-button-success"
            aria-label="Aggiungi riga"
          >
            +
          </button>

          <div className="mobile-toolbar-actions">
            <button className="button" type="button" onClick={handleSave} disabled={saving || loading}>
              {saving ? "Salvataggio..." : "Salva diario"}
            </button>
          </div>
        </div>
      </section>
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

const headerCellSmall: React.CSSProperties = {
  ...headerCell,
  width: 110,
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
