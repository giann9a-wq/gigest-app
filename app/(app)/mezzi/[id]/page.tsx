"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PdfViewerModal } from "@/components/pdf-viewer-modal";

type EquipmentTypeValue = "VEHICLE" | "EQUIPMENT";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";
type ActiveTab = "costs" | "maintenance";

type EquipmentForm = {
  nameDescription: string;
  type: EquipmentTypeValue | "";
  purchaseDate: string;
  status: ResourceStatusValue | "";
};

type CostRow = {
  localId: string;
  id?: string;
  hourlyCost: string;
  validFrom: string;
  validTo: string;
};

type MaintenanceRow = {
  localId: string;
  id?: string;
  interventionType: string;
  interventionDate: string;
  nextIntervention: string;
  cost: string;
  notes: string;
  documents: {
    id: string;
    fileName: string;
    filePath: string;
  }[];
};

type PdfPreviewState = {
  title: string;
  url: string;
  subtitle?: string;
};

function makeEmptyCostRow(): CostRow {
  return {
    localId: crypto.randomUUID(),
    hourlyCost: "",
    validFrom: "",
    validTo: "",
  };
}

function makeEmptyMaintenanceRow(): MaintenanceRow {
  return {
    localId: crypto.randomUUID(),
    interventionType: "",
    interventionDate: "",
    nextIntervention: "",
    cost: "",
    notes: "",
    documents: [],
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

export default function SchedaMezzoPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>("costs");

  const [equipment, setEquipment] = useState<EquipmentForm>({
    nameDescription: "",
    type: "EQUIPMENT",
    purchaseDate: "",
    status: "ACTIVE",
  });

  const [costRows, setCostRows] = useState<CostRow[]>([makeEmptyCostRow()]);
  const [maintenanceRows, setMaintenanceRows] = useState<MaintenanceRow[]>([makeEmptyMaintenanceRow()]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);

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

  function setMaintenanceRow(localId: string, patch: Partial<MaintenanceRow>) {
    setMaintenanceRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function addMaintenanceRow() {
    setMaintenanceRows((current) => [...current, makeEmptyMaintenanceRow()]);
  }

  function removeMaintenanceRow(localId: string) {
    setMaintenanceRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyMaintenanceRow()];
    });
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [equipmentData, maintenanceData] = await Promise.all([
        safeJsonFetch(`/api/risorse/mezzi/${params.id}`),
        safeJsonFetch(`/api/risorse/mezzi/${params.id}/maintenance`),
      ]);

      setEquipment({
        nameDescription: equipmentData.equipment.nameDescription ?? "",
        type: equipmentData.equipment.type ?? "EQUIPMENT",
        purchaseDate: equipmentData.equipment.purchaseDate ?? "",
        status: equipmentData.equipment.status ?? "ACTIVE",
      });

        if (!equipmentData.costHistory || equipmentData.costHistory.length === 0) {
        setCostRows([makeEmptyCostRow()]);
        } else {
        setCostRows(
            equipmentData.costHistory.map((row: any) => ({
            localId: crypto.randomUUID(),
            id: row.id,
            hourlyCost: row.hourlyCost?.toString() ?? "",
            validFrom: row.validFrom ?? "",
            validTo: row.validTo ?? "",
            }))
        );
        }

        if (!maintenanceData.rows || maintenanceData.rows.length === 0) {
        setMaintenanceRows([makeEmptyMaintenanceRow()]);
        } else {
        setMaintenanceRows(
            maintenanceData.rows.map((row: any) => ({
            localId: crypto.randomUUID(),
            id: row.id,
            interventionType: row.interventionType ?? "",
            interventionDate: row.interventionDate ?? "",
            nextIntervention: row.nextIntervention ?? "",
            cost: row.cost?.toString() ?? "",
            notes: row.notes ?? "",
            documents: row.documents ?? [],
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

  async function handleSaveCosts() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await safeJsonFetch(`/api/risorse/mezzi/${params.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          equipment,
          costHistory: costRows.map((row) => ({
            id: row.id,
            hourlyCost: row.hourlyCost,
            validFrom: row.validFrom,
            validTo: row.validTo,
          })),
        }),
      });

      setMessage("Scheda mezzo / attrezzatura salvata correttamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveMaintenance() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await safeJsonFetch(`/api/risorse/mezzi/${params.id}/maintenance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: maintenanceRows.map((row) => ({
            id: row.id,
            interventionType: row.interventionType,
            interventionDate: row.interventionDate,
            nextIntervention: row.nextIntervention,
            cost: row.cost,
            notes: row.notes,
          })),
        }),
      });

      setMessage("Manutenzioni salvate correttamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio manutenzioni");
    } finally {
      setSaving(false);
    }
  }

async function handleUploadDocument(maintenanceId: string, file: File) {
  setError("");
  setMessage("");

  const formData = new FormData();
  formData.append("maintenanceId", maintenanceId);
  formData.append("file", file);

  try {
    const response = await fetch(`/api/risorse/mezzi/${params.id}/maintenance/upload`, {
      method: "POST",
      body: formData,
    });

    const contentType = response.headers.get("content-type") || "";
    const rawText = await response.text();

    if (!contentType.includes("application/json")) {
      throw new Error(`Risposta non valida dal server: ${rawText.slice(0, 120)}`);
    }

    const data = JSON.parse(rawText);

    if (!response.ok) {
      throw new Error(data.error || "Errore upload documento");
    }

    setMessage("Documento caricato correttamente.");
    await loadData();
  } catch (err) {
    setError(err instanceof Error ? err.message : "Errore upload documento");
  }
}

async function handleOpenDocument(documentId: string) {
  try {
    const data = await safeJsonFetch(
      `/api/risorse/mezzi/${params.id}/maintenance/document/${documentId}`
    );
    setPdfPreview({
      title: data.fileName || "Documento manutenzione",
      url: data.url,
      subtitle: equipment.nameDescription,
    });
  } catch (err) {
    setError(err instanceof Error ? err.message : "Errore apertura documento");
  }
}



  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Scheda Mezzo / Attrezzatura</h1>
        <button className="button" type="button" onClick={() => router.push("/mezzi")}>
          Chiudi
        </button>
      </div>

      {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
      {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 0, marginBottom: 24 }}>
        <div style={labelCell}>Attrezzatura</div>
        <div style={valueCell}>
          <input
            style={inputStyle}
            value={equipment.nameDescription}
            onChange={(e) => setEquipment({ ...equipment, nameDescription: e.target.value })}
          />
        </div>

        <div style={labelCell}>Tipologia</div>
        <div style={valueCell}>
          <select
            style={inputStyle}
            value={equipment.type}
            onChange={(e) => setEquipment({ ...equipment, type: e.target.value as EquipmentTypeValue })}
          >
            <option value="VEHICLE">{equipmentTypeLabel("VEHICLE")}</option>
            <option value="EQUIPMENT">{equipmentTypeLabel("EQUIPMENT")}</option>
          </select>
        </div>

        <div style={labelCell}>Data Acquisto</div>
        <div style={valueCell}>
          <input
            type="date"
            style={inputStyle}
            value={equipment.purchaseDate}
            onChange={(e) => setEquipment({ ...equipment, purchaseDate: e.target.value })}
          />
        </div>

        <div style={labelCell}>Stato</div>
        <div style={valueCell}>
          <select
            style={inputStyle}
            value={equipment.status}
            onChange={(e) => setEquipment({ ...equipment, status: e.target.value as ResourceStatusValue })}
          >
            <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
            <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
            <option value="ENDED">{statusLabel("ENDED")}</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => setActiveTab("costs")}
          style={activeTab === "costs" ? activeTabStyle : inactiveTabStyle}
        >
          Costo Orario
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("maintenance")}
          style={activeTab === "maintenance" ? activeTabStyle : inactiveTabStyle}
        >
          Manutenzione
        </button>
      </div>

      {activeTab === "costs" ? (
        <>
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
              <button className="button" type="button" onClick={handleSaveCosts} disabled={saving || loading}>
                {saving ? "Salvataggio..." : "Salva"}
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                <tr>
                    <th style={headerCell}>Intervento di Manutenzione</th>
                    <th style={headerCell}>Data Intervento</th>
                    <th style={headerCell}>Pianifica prossimo Intervento</th>
                    <th style={headerCell}>Costo Intervento</th>
                    <th style={headerCell}>Documento</th>
                    <th style={headerCell}>Apri Documento</th>
                    <th style={headerCellTiny}></th>
                </tr>
                </thead>
              <tbody>
                {maintenanceRows.map((row) => (
                  <tr key={row.localId}>
                    <td style={bodyCell}>
                      <input
                        type="text"
                        style={inputStyle}
                        value={row.interventionType}
                        onChange={(e) => setMaintenanceRow(row.localId, { interventionType: e.target.value })}
                        placeholder="Intervento di manutenzione"
                      />
                    </td>
                    <td style={bodyCell}>
                      <input
                        type="date"
                        style={inputStyle}
                        value={row.interventionDate}
                        onChange={(e) => setMaintenanceRow(row.localId, { interventionDate: e.target.value })}
                      />
                    </td>
                    <td style={bodyCell}>
                      <input
                        type="date"
                        style={inputStyle}
                        value={row.nextIntervention}
                        onChange={(e) => setMaintenanceRow(row.localId, { nextIntervention: e.target.value })}
                      />
                    </td>
                    <td style={bodyCell}>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        style={inputStyle}
                        value={row.cost}
                        onChange={(e) => setMaintenanceRow(row.localId, { cost: e.target.value })}
                        placeholder="0.00"
                    />
                    </td>

                    <td style={bodyCell}>
                    <input
                        type="file"
                        style={inputStyle}
                        disabled={!row.id}
                        onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file && row.id) {
                            handleUploadDocument(row.id, file);
                        }
                        }}
                    />
                    </td>

                    <td style={bodyCell}>
                    {(row.documents?.length ?? 0) > 0 ? (
                        <button
                        className="button"
                        type="button"
                        onClick={() => handleOpenDocument(row.documents[0].id)}
                        >
                        Apri Documento
                        </button>
                    ) : (
                        <span className="muted">Nessuno</span>
                    )}
                    </td>

                    <td style={bodyCellTiny}>
                    <button
                        type="button"
                        onClick={() => removeMaintenanceRow(row.localId)}
                        style={removeButtonStyle}
                    >
                        ×
                    </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <button type="button" onClick={addMaintenanceRow} style={plusButtonStyle}>
              +
            </button>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="button" type="button" disabled>
                Modifica
              </button>
              <button className="button" type="button" onClick={handleSaveMaintenance} disabled={saving || loading}>
                {saving ? "Salvataggio..." : "Salva"}
              </button>
            </div>
          </div>
        </>
      )}
      {pdfPreview ? (
        <PdfViewerModal
          title={pdfPreview.title}
          subtitle={pdfPreview.subtitle}
          url={pdfPreview.url}
          onClose={() => setPdfPreview(null)}
        />
      ) : null}
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

const activeTabStyle: React.CSSProperties = {
  padding: "10px 20px",
  border: "none",
  background: "#f97316",
  color: "white",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};

const inactiveTabStyle: React.CSSProperties = {
  padding: "10px 20px",
  border: "none",
  background: "#94a3b8",
  color: "white",
  borderRadius: 8,
  fontWeight: 700,
  cursor: "pointer",
};
