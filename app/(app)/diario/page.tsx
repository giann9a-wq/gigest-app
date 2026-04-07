"use client";

import { useEffect, useState } from "react";
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

    init();
  }, []);

  useEffect(() => {
    async function refreshRows() {
      setError("");

      try {
        await loadRows(referenceDate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento attività");
      }
    }

    refreshRows();
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

  return (
    <div className="grid gap-4">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Diario del cantiere</h1>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "240px 1fr 1fr",
            gap: 16,
            alignItems: "end",
            marginBottom: 24,
          }}
        >
          <label>
            <div style={{ marginBottom: 8, fontWeight: 700 }}>Seleziona Giorno</div>
            <input
              type="date"
              value={referenceDate}
              onChange={(e) => setReferenceDate(e.target.value)}
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #d1d5db",
              }}
            />
          </label>

          <div style={{ display: "flex", gap: 12 }}>
            <button className="button" type="button" onClick={() => router.push("/risorse")}>
              Vedi risorse
            </button>
            <button className="button" type="button" onClick={() => router.push("/commesse")}>
              Vedi commesse
            </button>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              className="button"
              type="button"
              onClick={() => router.push("/statistiche-risorse-commesse")}
            >
              Statistiche per Risorsa / Commessa
            </button>
          </div>
        </div>

        {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

        <div style={{ overflowX: "auto" }}>
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

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 18,
          }}
        >
          <button type="button" onClick={addRow} style={plusButtonStyle}>
            +
          </button>

          <div style={{ display: "flex", gap: 12 }}>
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

const plusButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: "999px",
  border: "none",
  background: "#22c55e",
  color: "white",
  fontSize: 28,
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
