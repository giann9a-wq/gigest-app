"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";

type PersonForm = {
  fullName: string;
  roleDescription: string;
  hireDate: string;
  contacts: string;
  status: ResourceStatusValue | "";
};

type CostRow = {
  localId: string;
  id?: string;
  hourlyCost: string;
  validFrom: string;
  validTo: string;
};

function makeEmptyCostRow(): CostRow {
  return {
    localId: crypto.randomUUID(),
    hourlyCost: "",
    validFrom: "",
    validTo: "",
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

export default function SchedaPersonalePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [person, setPerson] = useState<PersonForm>({
    fullName: "",
    roleDescription: "",
    hireDate: "",
    contacts: "",
    status: "ACTIVE",
  });

  const [costRows, setCostRows] = useState<CostRow[]>([makeEmptyCostRow()]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setCostRow(localId: string, patch: Partial<CostRow>) {
    setCostRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function addCostRow() {
    setCostRows((current) => [...current, makeEmptyCostRow()]);
  }

  function removeCostRow(localId: string) {
    setCostRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyCostRow()];
    });
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch(`/api/risorse/personale/${params.id}`);

      setPerson({
        fullName: data.person.fullName ?? "",
        roleDescription: data.person.roleDescription ?? "",
        hireDate: data.person.hireDate ?? "",
        contacts: data.person.contacts ?? "",
        status: data.person.status ?? "ACTIVE",
      });

      if (!data.costHistory || data.costHistory.length === 0) {
        setCostRows([makeEmptyCostRow()]);
      } else {
        setCostRows(
          data.costHistory.map((row: any) => ({
            localId: crypto.randomUUID(),
            id: row.id,
            hourlyCost: row.hourlyCost?.toString() ?? "",
            validFrom: row.validFrom ?? "",
            validTo: row.validTo ?? "",
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento scheda");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function handleSave() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await safeJsonFetch(`/api/risorse/personale/${params.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          person,
          costHistory: costRows.map((row) => ({
            id: row.id,
            hourlyCost: row.hourlyCost,
            validFrom: row.validFrom,
            validTo: row.validTo,
          })),
        }),
      });

      setMessage("Scheda personale salvata correttamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Scheda Personale</h1>
        <button className="button" type="button" onClick={() => router.push("/risorse")}>
          Chiudi
        </button>
      </div>

      {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
      {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 0, marginBottom: 24 }}>
        <div style={labelCell}>Nome e Cognome</div>
        <div style={valueCell}>
          <input style={inputStyle} value={person.fullName} onChange={(e) => setPerson({ ...person, fullName: e.target.value })} />
        </div>

        <div style={labelCell}>Mansione</div>
        <div style={valueCell}>
          <input style={inputStyle} value={person.roleDescription} onChange={(e) => setPerson({ ...person, roleDescription: e.target.value })} />
        </div>

        <div style={labelCell}>Data Assunzione</div>
        <div style={valueCell}>
          <input type="date" style={inputStyle} value={person.hireDate} onChange={(e) => setPerson({ ...person, hireDate: e.target.value })} />
        </div>

        <div style={labelCell}>Contatti</div>
        <div style={valueCell}>
          <input style={inputStyle} value={person.contacts} onChange={(e) => setPerson({ ...person, contacts: e.target.value })} />
        </div>

        <div style={labelCell}>Stato</div>
        <div style={valueCell}>
          <select style={inputStyle} value={person.status} onChange={(e) => setPerson({ ...person, status: e.target.value as ResourceStatusValue })}>
            <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
            <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
            <option value="ENDED">{statusLabel("ENDED")}</option>
          </select>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={headerCell}>Costo Orario</th>
              <th style={headerCell}>Valido dal</th>
              <th style={headerCell}>Valido fino al</th>
              <th style={headerCellTiny}></th>
            </tr>
          </thead>
          <tbody>
            {costRows.map((row) => (
              <tr key={row.localId}>
                <td style={bodyCell}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    style={inputStyle}
                    value={row.hourlyCost}
                    onChange={(e) => setCostRow(row.localId, { hourlyCost: e.target.value })}
                  />
                </td>
                <td style={bodyCell}>
                  <input
                    type="date"
                    style={inputStyle}
                    value={row.validFrom}
                    onChange={(e) => setCostRow(row.localId, { validFrom: e.target.value })}
                  />
                </td>
                <td style={bodyCell}>
                  <input
                    type="date"
                    style={inputStyle}
                    value={row.validTo}
                    onChange={(e) => setCostRow(row.localId, { validTo: e.target.value })}
                  />
                </td>
                <td style={bodyCellTiny}>
                  <button type="button" onClick={() => removeCostRow(row.localId)} style={removeButtonStyle}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
        <button type="button" onClick={addCostRow} style={plusButtonStyle}>
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
  );
}

const labelCell: React.CSSProperties = {
  border: "1px solid #d1d5db",
  padding: "12px 14px",
  fontWeight: 700,
  background: "#fafafa",
};

const valueCell: React.CSSProperties = {
  border: "1px solid #d1d5db",
  padding: "8px 10px",
  background: "white",
};

const headerCell: React.CSSProperties = {
  background: "#f97316",
  color: "white",
  textAlign: "left",
  padding: "12px 10px",
  fontWeight: 700,
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