"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type EquipmentTypeValue = "VEHICLE" | "EQUIPMENT";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";
type EquipmentSortKey =
  | "nameDescription"
  | "type"
  | "purchaseDate"
  | "status"
  | "hourlyCost";
type SortDirection = "asc" | "desc";

type EditableEquipmentRow = {
  localId: string;
  id?: string;
  nameDescription: string;
  type: EquipmentTypeValue | "";
  purchaseDate: string;
  status: ResourceStatusValue | "";
  hourlyCost: string;
};

type EquipmentFilters = {
  nameDescription: string;
  type: EquipmentTypeValue | "";
  purchaseDate: string;
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
    hourlyCost: "",
  };
}

function getEmptyFilters(): EquipmentFilters {
  return {
    nameDescription: "",
    type: "",
    purchaseDate: "",
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

export default function MezziPage() {
  const router = useRouter();
  const [rows, setRows] = useState<EditableEquipmentRow[]>([
    makeEmptyRow(),
    makeEmptyRow(),
    makeEmptyRow(),
  ]);
  const [filters, setFilters] = useState<EquipmentFilters>(getEmptyFilters());
  const [sortKey, setSortKey] = useState<EquipmentSortKey>("nameDescription");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setRowValue(localId: string, patch: Partial<EditableEquipmentRow>) {
    setRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
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
            hourlyCost: row.hourlyCost?.toString() ?? "",
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento mezzi");
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
        nameDescription: row.nameDescription,
        type: row.type,
        purchaseDate: row.purchaseDate,
        status: row.status,
        hourlyCost: row.hourlyCost,
      }));

      await safeJsonFetch("/api/risorse/mezzi", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ rows: payloadRows }),
      });

      setMessage("Salvataggio completato.");
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
        matchesFilter(row.nameDescription, filters.nameDescription) &&
        (filters.type ? row.type === filters.type : true) &&
        matchesFilter(row.purchaseDate, filters.purchaseDate) &&
        (filters.status ? row.status === filters.status : true) &&
        matchesFilter(row.hourlyCost, filters.hourlyCost)
      );
    });

    return [...filtered].sort((a, b) => {
      let result = 0;

      switch (sortKey) {
        case "nameDescription":
          result = compareText(a.nameDescription, b.nameDescription);
          break;
        case "type":
          result = compareText(a.type, b.type);
          break;
        case "purchaseDate":
          result = compareText(a.purchaseDate, b.purchaseDate);
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
  }, [filters, rows, sortDirection, sortKey]);

  function renderSortLabel(label: string, key: EquipmentSortKey) {
    if (sortKey !== key) return label;
    return `${label} ${sortDirection === "asc" ? "↑" : "↓"}`;
  }

  return (
    <div className="grid gap-4">
      <div className="card">
        <h1 style={{ marginTop: 0 }}>Mezzi e Attrezzature</h1>

        <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
          <button className="button" type="button" onClick={() => router.push("/risorse")}>
            Personale
          </button>
          <button className="button" type="button">
            Mezzi e Attrezzature
          </button>
        </div>

        {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
        {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

        <div style={tableToolsWrapStyle}>
          <div style={{ color: "#6b7280", fontSize: 14 }}>
            Righe visibili: <strong>{visibleRows.length}</strong> su {rows.length}
          </div>
          <button type="button" style={secondaryButtonStyle} onClick={() => setFilters(getEmptyFilters())}>
            Azzera filtri
          </button>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("nameDescription")} style={headerButtonStyle}>
                    {renderSortLabel("Attrezzatura", "nameDescription")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("type")} style={headerButtonStyle}>
                    {renderSortLabel("Tipologia", "type")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("purchaseDate")} style={headerButtonStyle}>
                    {renderSortLabel("Data Acquisto", "purchaseDate")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("status")} style={headerButtonStyle}>
                    {renderSortLabel("Stato", "status")}
                  </button>
                </th>
                <th style={headerCell}>
                  <button type="button" onClick={() => toggleSort("hourlyCost")} style={headerButtonStyle}>
                    {renderSortLabel("Costo Orario", "hourlyCost")}
                  </button>
                </th>
                <th style={headerCell}>Apri Scheda</th>
                <th style={headerCellTiny}></th>
              </tr>
              <tr>
                <th style={filterHeaderCell}>
                  <input
                    value={filters.nameDescription}
                    onChange={(e) => setFilterValue("nameDescription", e.target.value)}
                    placeholder="Filtra nome"
                    style={filterInputStyle}
                  />
                </th>
                <th style={filterHeaderCell}>
                  <select
                    value={filters.type}
                    onChange={(e) => setFilterValue("type", e.target.value as EquipmentTypeValue | "")}
                    style={filterInputStyle}
                  >
                    <option value="">Tutte</option>
                    <option value="VEHICLE">{equipmentTypeLabel("VEHICLE")}</option>
                    <option value="EQUIPMENT">{equipmentTypeLabel("EQUIPMENT")}</option>
                  </select>
                </th>
                <th style={filterHeaderCell}>
                  <input
                    value={filters.purchaseDate}
                    onChange={(e) => setFilterValue("purchaseDate", e.target.value)}
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
                    value={filters.hourlyCost}
                    onChange={(e) => setFilterValue("hourlyCost", e.target.value)}
                    placeholder="Filtra costo"
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
                      value={row.nameDescription}
                      onChange={(e) => setRowValue(row.localId, { nameDescription: e.target.value })}
                      style={inputStyle}
                      placeholder="Nome mezzo / attrezzatura"
                      disabled={loading}
                    />
                  </td>

                  <td style={bodyCell}>
                    <select
                      value={row.type}
                      onChange={(e) =>
                        setRowValue(row.localId, { type: e.target.value as EquipmentTypeValue | "" })
                      }
                      style={inputStyle}
                      disabled={loading}
                    >
                      <option value="">Seleziona tipologia</option>
                      <option value="VEHICLE">{equipmentTypeLabel("VEHICLE")}</option>
                      <option value="EQUIPMENT">{equipmentTypeLabel("EQUIPMENT")}</option>
                    </select>
                  </td>

                  <td style={bodyCell}>
                    <input
                      type="date"
                      value={row.purchaseDate}
                      onChange={(e) => setRowValue(row.localId, { purchaseDate: e.target.value })}
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
                      type="number"
                      step="0.01"
                      min="0"
                      value={row.hourlyCost}
                      onChange={(e) => setRowValue(row.localId, { hourlyCost: e.target.value })}
                      style={inputStyle}
                      placeholder="0.00"
                      disabled={loading}
                    />
                  </td>

                  <td style={bodyCell}>
                    <button
                      className="button"
                      type="button"
                      disabled={!row.id}
                      onClick={() => row.id && router.push(`/mezzi/${row.id}`)}
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

const tableToolsWrapStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
  marginBottom: 14,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid #f08a54",
  background: "#fff7f2",
  color: "#9a3f12",
  borderRadius: 10,
  padding: "0.55rem 0.9rem",
  cursor: "pointer",
  fontWeight: 600,
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
