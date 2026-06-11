"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { PdfViewerModal } from "@/components/pdf-viewer-modal";

type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";
type ActiveTab = "costs" | "training";

type PersonForm = {
  fullName: string;
  roleDescription: string;
  hireDate: string;
  contacts: string;
  diaryReminderRecipientsRaw: string;
  isPartTime: boolean;
  partTimeHours: string;
  diaryAutoFillEnabled: boolean;
  diaryAutoFillJobOrderId: string;
  excludeFromChecks: boolean;
  status: ResourceStatusValue | "";
};

type JobOrderOption = {
  id: string;
  name: string;
};

type CostRow = {
  localId: string;
  id?: string;
  hourlyCost: string;
  validFrom: string;
  validTo: string;
};

type TrainingRow = {
  localId: string;
  id?: string;
  course: string;
  description: string;
  trainingDate: string;
  mandatory: boolean;
  expiresAt: string;
  isRecurring: boolean;
  recurrenceMonths: string;
  pendingAttachment: File | null;
  documents: {
    id: string;
    fileName: string;
  }[];
};

type PdfPreviewState = {
  title: string;
  url: string;
  subtitle?: string;
};

type AutoFitTextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

function AutoFitTextarea({ value, style, ...props }: AutoFitTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;

    element.style.height = "0px";
    element.style.height = `${element.scrollHeight}px`;
  }, [value]);

  return <textarea ref={ref} value={value} rows={1} style={{ ...textareaStyle, ...style }} {...props} />;
}

function makeEmptyCostRow(): CostRow {
  return {
    localId: crypto.randomUUID(),
    hourlyCost: "",
    validFrom: "",
    validTo: "",
  };
}

function makeEmptyTrainingRow(): TrainingRow {
  return {
    localId: crypto.randomUUID(),
    course: "",
    description: "",
    trainingDate: "",
    mandatory: false,
    expiresAt: "",
    isRecurring: false,
    recurrenceMonths: "",
    pendingAttachment: null,
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

function addMonthsToDate(baseDate: string, amountRaw: string) {
  const amount = Number(amountRaw);
  if (!baseDate || !Number.isFinite(amount) || amount <= 0) return "";

  const result = new Date(`${baseDate}T00:00:00.000Z`);
  if (Number.isNaN(result.getTime())) return "";

  result.setUTCMonth(result.getUTCMonth() + amount);

  return result.toISOString().slice(0, 10);
}

export default function SchedaPersonalePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<ActiveTab>("costs");
  const [person, setPerson] = useState<PersonForm>({
    fullName: "",
    roleDescription: "",
    hireDate: "",
    contacts: "",
    diaryReminderRecipientsRaw: "",
    isPartTime: false,
    partTimeHours: "",
    diaryAutoFillEnabled: false,
    diaryAutoFillJobOrderId: "",
    excludeFromChecks: false,
    status: "ACTIVE",
  });

  const [costRows, setCostRows] = useState<CostRow[]>([makeEmptyCostRow()]);
  const [trainingRows, setTrainingRows] = useState<TrainingRow[]>([makeEmptyTrainingRow()]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
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

  function setTrainingRow(localId: string, patch: Partial<TrainingRow>) {
    setTrainingRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function setTrainingDate(localId: string, trainingDate: string) {
    setTrainingRows((current) =>
      current.map((row) => {
        if (row.localId !== localId) return row;
        const expiresAt = row.isRecurring ? addMonthsToDate(trainingDate, row.recurrenceMonths) : "";
        const nextRow = { ...row, trainingDate };
        return expiresAt ? { ...nextRow, expiresAt } : nextRow;
      })
    );
  }

  function setTrainingRecurrence(
    localId: string,
    patch: Partial<Pick<TrainingRow, "isRecurring" | "recurrenceMonths">>
  ) {
    setTrainingRows((current) =>
      current.map((row) => {
        if (row.localId !== localId) return row;
        const nextRow = { ...row, ...patch };
        const expiresAt = nextRow.isRecurring
          ? addMonthsToDate(nextRow.trainingDate, nextRow.recurrenceMonths)
          : "";

        return {
          ...nextRow,
          expiresAt: expiresAt || nextRow.expiresAt,
        };
      })
    );
  }

  function addTrainingRow() {
    setTrainingRows((current) => [...current, makeEmptyTrainingRow()]);
  }

  function removeTrainingRow(localId: string) {
    setTrainingRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyTrainingRow()];
    });
  }

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const [data, trainingData] = await Promise.all([
        safeJsonFetch(`/api/risorse/personale/${params.id}`),
        safeJsonFetch(`/api/risorse/personale/${params.id}/training`),
      ]);

      setPerson({
        fullName: data.person.fullName ?? "",
        roleDescription: data.person.roleDescription ?? "",
        hireDate: data.person.hireDate ?? "",
        contacts: data.person.contacts ?? "",
        diaryReminderRecipientsRaw: Array.isArray(data.person.diaryReminderRecipients)
          ? (data.person.diaryReminderRecipients as string[]).join("\n")
          : "",
        isPartTime: data.person.isPartTime === true,
        partTimeHours: data.person.partTimeHours?.toString() ?? "",
        diaryAutoFillEnabled: data.person.diaryAutoFillEnabled === true,
        diaryAutoFillJobOrderId: data.person.diaryAutoFillJobOrderId ?? "",
        excludeFromChecks: data.person.excludeFromChecks === true,
        status: data.person.status ?? "ACTIVE",
      });
      setJobOrders(data.jobOrders ?? []);

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

      if (!trainingData.rows || trainingData.rows.length === 0) {
        setTrainingRows([makeEmptyTrainingRow()]);
      } else {
        setTrainingRows(
          trainingData.rows.map((row: any) => ({
            localId: crypto.randomUUID(),
            id: row.id,
            course: row.course ?? "",
            description: row.description ?? "",
            trainingDate: row.trainingDate ?? "",
            mandatory: row.mandatory === true,
            expiresAt: row.expiresAt ?? "",
            isRecurring: row.isRecurring === true,
            recurrenceMonths: row.recurrenceMonths?.toString() ?? "",
            pendingAttachment: null,
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

  async function handleSaveTraining() {
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

      const data = await safeJsonFetch(`/api/risorse/personale/${params.id}/training`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          rows: trainingRows.map((row) => ({
            clientLocalId: row.localId,
            id: row.id,
            course: row.course,
            description: row.description,
            trainingDate: row.trainingDate,
            mandatory: row.mandatory,
            expiresAt: row.expiresAt,
            isRecurring: row.isRecurring,
            recurrenceMonths: row.recurrenceMonths,
          })),
        }),
      });

      const savedIdByLocalId = new Map<string, string>(
        (data.savedRows ?? []).map((row: any) => [row.clientLocalId, row.id])
      );
      const pendingUploads = trainingRows
        .map((row) => ({
          trainingId: row.id ?? savedIdByLocalId.get(row.localId),
          file: row.pendingAttachment,
        }))
        .filter((row): row is { trainingId: string; file: File } => Boolean(row.trainingId && row.file));

      for (const upload of pendingUploads) {
        await uploadTrainingDocument(upload.trainingId, upload.file);
      }

      setMessage(
        data.calendarSyncError
          ? `Formazione salvata. Scadenza creata, ma sincronizzazione calendario non completata: ${data.calendarSyncError}`
          : pendingUploads.length > 0
          ? "Formazione salvata e documento caricato correttamente."
          : "Formazione salvata correttamente."
      );
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio formazione");
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadTrainingDocument(trainingId: string, file: File) {
    setError("");
    setMessage("");

    try {
      await uploadTrainingDocument(trainingId, file);
      setMessage("Documento formazione caricato correttamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore upload documento");
    }
  }

  async function uploadTrainingDocument(trainingId: string, file: File) {
    const formData = new FormData();
    formData.append("trainingId", trainingId);
    formData.append("file", file);

    const response = await fetch(`/api/risorse/personale/${params.id}/training/upload`, {
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
  }

  function handleOpenTrainingDocument(row: TrainingRow) {
    const document = row.documents[0];
    if (!document) return;

    setPdfPreview({
      title: document.fileName || "Documento formazione",
      url: `/api/risorse/personale/${params.id}/training/document/${document.id}`,
      subtitle: person.fullName,
    });
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

        <div style={labelCell}>Email promemoria diario</div>
        <div style={valueCell}>
          <textarea
            style={{ ...textareaStyle, minHeight: 84 }}
            value={person.diaryReminderRecipientsRaw}
            placeholder="Es: nome@azienda.it, altro@azienda.it"
            onChange={(e) => setPerson({ ...person, diaryReminderRecipientsRaw: e.target.value })}
          />
        </div>

        <div style={labelCell}>Part Time</div>
        <div style={valueCell}>
          <div style={inlineFieldGroupStyle}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={person.isPartTime}
                onChange={(e) =>
                  setPerson({
                    ...person,
                    isPartTime: e.target.checked,
                    partTimeHours: e.target.checked ? person.partTimeHours : "",
                  })
                }
              />
              <span>Part Time</span>
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="24"
              style={{ ...inputStyle, maxWidth: 140 }}
              value={person.partTimeHours}
              disabled={!person.isPartTime}
              placeholder="Ore"
              onChange={(e) => setPerson({ ...person, partTimeHours: e.target.value })}
            />
          </div>
        </div>

        <div style={labelCell}>Autocompilazione Diario</div>
        <div style={valueCell}>
          <div style={inlineFieldGroupStyle}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                checked={person.diaryAutoFillEnabled}
                onChange={(e) =>
                  setPerson({
                    ...person,
                    diaryAutoFillEnabled: e.target.checked,
                    diaryAutoFillJobOrderId: e.target.checked ? person.diaryAutoFillJobOrderId : "",
                  })
                }
              />
              <span>Autocompilazione Diario</span>
            </label>
            <select
              style={{ ...inputStyle, minWidth: 280 }}
              value={person.diaryAutoFillJobOrderId}
              disabled={!person.diaryAutoFillEnabled}
              onChange={(e) => setPerson({ ...person, diaryAutoFillJobOrderId: e.target.value })}
            >
              <option value="">Seleziona commessa</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={labelCell}>Controlli</div>
        <div style={valueCell}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={person.excludeFromChecks}
              onChange={(e) => setPerson({ ...person, excludeFromChecks: e.target.checked })}
            />
            <span>Escludi dai controlli</span>
          </label>
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
          onClick={() => setActiveTab("training")}
          style={activeTab === "training" ? activeTabStyle : inactiveTabStyle}
        >
          Formazione
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
                        x
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
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1320 }}>
              <thead>
                <tr>
                  <th style={headerCell}>Corso</th>
                  <th style={headerCell}>Descrizione</th>
                  <th style={headerCell}>Data</th>
                  <th style={headerCell}>Obbligatorio</th>
                  <th style={headerCell}>Data Scadenza</th>
                  <th style={headerCell}>Allegato PDF</th>
                  <th style={headerCell}>Apri Documento</th>
                  <th style={headerCellTiny}></th>
                </tr>
              </thead>
              <tbody>
                {trainingRows.map((row) => (
                  <tr key={row.localId}>
                    <td style={bodyCell}>
                      <AutoFitTextarea
                        value={row.course}
                        onChange={(e) => setTrainingRow(row.localId, { course: e.target.value })}
                        placeholder="Corso"
                      />
                    </td>
                    <td style={bodyCell}>
                      <AutoFitTextarea
                        value={row.description}
                        onChange={(e) => setTrainingRow(row.localId, { description: e.target.value })}
                        placeholder="Descrizione"
                      />
                    </td>
                    <td style={bodyCell}>
                      <input
                        type="date"
                        style={inputStyle}
                        value={row.trainingDate}
                        onChange={(e) => setTrainingDate(row.localId, e.target.value)}
                      />
                    </td>
                    <td style={{ ...bodyCell, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={row.mandatory}
                        onChange={(e) => setTrainingRow(row.localId, { mandatory: e.target.checked })}
                        style={{ width: 22, height: 22, cursor: "pointer" }}
                      />
                    </td>
                    <td style={bodyCell}>
                      <div style={trainingDeadlineCellStyle}>
                        <input
                          type="date"
                          style={inputStyle}
                          value={row.expiresAt}
                          onChange={(e) => setTrainingRow(row.localId, { expiresAt: e.target.value })}
                        />
                        <label style={recurringLineStyle}>
                          <input
                            type="checkbox"
                            checked={row.isRecurring}
                            onChange={(e) =>
                              setTrainingRecurrence(row.localId, {
                                isRecurring: e.target.checked,
                                recurrenceMonths: row.recurrenceMonths,
                              })
                            }
                          />
                          <span>Ricorrente ogni</span>
                          <input
                            type="number"
                            min="1"
                            step="1"
                            style={recurringMonthInputStyle}
                            value={row.recurrenceMonths}
                            onChange={(e) =>
                              setTrainingRecurrence(row.localId, { recurrenceMonths: e.target.value })
                            }
                            disabled={!row.isRecurring}
                          />
                          <span>mesi</span>
                        </label>
                      </div>
                    </td>
                    <td style={bodyCell}>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        style={inputStyle}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file && row.id) {
                            handleUploadTrainingDocument(row.id, file);
                          } else {
                            setTrainingRow(row.localId, { pendingAttachment: file ?? null });
                          }
                        }}
                      />
                      {row.pendingAttachment ? (
                        <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                          {row.pendingAttachment.name}
                        </div>
                      ) : null}
                    </td>
                    <td style={bodyCell}>
                      {(row.documents?.length ?? 0) > 0 ? (
                        <button
                          className="document-link-button"
                          type="button"
                          onClick={() => handleOpenTrainingDocument(row)}
                        >
                          Apri pdf
                        </button>
                      ) : (
                        <span className="muted">Nessuno</span>
                      )}
                    </td>
                    <td style={bodyCellTiny}>
                      <button type="button" onClick={() => removeTrainingRow(row.localId)} style={removeButtonStyle}>
                        x
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <button type="button" onClick={addTrainingRow} style={plusButtonStyle}>
              +
            </button>

            <div style={{ display: "flex", gap: 12 }}>
              <button className="button" type="button" disabled>
                Modifica
              </button>
              <button className="button" type="button" onClick={handleSaveTraining} disabled={saving || loading}>
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

const textareaStyle: React.CSSProperties = {
  ...inputStyle,
  minHeight: 38,
  resize: "none",
  lineHeight: 1.35,
  overflow: "hidden",
};

const inlineFieldGroupStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 12,
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontWeight: 700,
  color: "#1f2937",
};

const trainingDeadlineCellStyle: React.CSSProperties = {
  display: "grid",
  gap: 8,
  minWidth: 230,
};

const recurringLineStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto auto 64px auto",
  alignItems: "center",
  gap: 8,
  fontSize: 12,
  color: "#1f2937",
};

const recurringMonthInputStyle: React.CSSProperties = {
  ...inputStyle,
  padding: "6px 8px",
  minWidth: 0,
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
