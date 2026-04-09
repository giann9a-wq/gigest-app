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

type ExternalResourceOption = {
  id: string;
  name: string;
};

type InternalEditableRow = {
  localId: string;
  resourceValue: string;
  jobOrderId: string;
  hours: string;
  activityDescription: string;
};

type ExternalEditableRow = {
  localId: string;
  externalResourceId: string;
  jobOrderId: string;
  days: string;
  activityDescription: string;
};

function todayAsInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function makeEmptyInternalRow(): InternalEditableRow {
  return {
    localId: crypto.randomUUID(),
    resourceValue: "",
    jobOrderId: "",
    hours: "",
    activityDescription: "",
  };
}

function makeEmptyExternalRow(): ExternalEditableRow {
  return {
    localId: crypto.randomUUID(),
    externalResourceId: "",
    jobOrderId: "",
    days: "",
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

function sumNumericStrings(values: string[]) {
  return values.reduce((sum, value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? sum + numericValue : sum;
  }, 0);
}

export default function DiarioPage() {
  const router = useRouter();
  const [referenceDate, setReferenceDate] = useState(todayAsInputValue());
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [externalResources, setExternalResources] = useState<ExternalResourceOption[]>([]);
  const [internalRows, setInternalRows] = useState<InternalEditableRow[]>([
    makeEmptyInternalRow(),
    makeEmptyInternalRow(),
    makeEmptyInternalRow(),
  ]);
  const [externalRows, setExternalRows] = useState<ExternalEditableRow[]>([
    makeEmptyExternalRow(),
    makeEmptyExternalRow(),
  ]);
  const [externalResourceDraft, setExternalResourceDraft] = useState("");
  const [showExternalResourceManager, setShowExternalResourceManager] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingExternalResource, setSavingExternalResource] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function setInternalRowValue(localId: string, patch: Partial<InternalEditableRow>) {
    setInternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function setExternalRowValue(localId: string, patch: Partial<ExternalEditableRow>) {
    setExternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function addInternalRow() {
    setInternalRows((current) => [...current, makeEmptyInternalRow()]);
  }

  function addExternalRow() {
    setExternalRows((current) => [...current, makeEmptyExternalRow()]);
  }

  function duplicateInternalRow(localId: string) {
    setInternalRows((current) => {
      const sourceRow = current.find((row) => row.localId === localId);
      if (!sourceRow) return current;
      return [...current, { ...sourceRow, localId: crypto.randomUUID() }];
    });
  }

  function duplicateExternalRow(localId: string) {
    setExternalRows((current) => {
      const sourceRow = current.find((row) => row.localId === localId);
      if (!sourceRow) return current;
      return [...current, { ...sourceRow, localId: crypto.randomUUID() }];
    });
  }

  function removeInternalRow(localId: string) {
    setInternalRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyInternalRow()];
    });
  }

  function removeExternalRow(localId: string) {
    setExternalRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyExternalRow()];
    });
  }

  async function loadOptions() {
    const data = await safeJsonFetch("/api/diario/options");
    setResources(data.resources ?? []);
    setJobOrders(data.jobOrders ?? []);
    setExternalResources(data.externalResources ?? []);
  }

  async function loadRows(date: string) {
    setLoadingRows(true);

    try {
      const data = await safeJsonFetch(`/api/diario/batch?date=${date}`);

      setInternalRows(
        !data.internalRows || data.internalRows.length === 0
          ? [makeEmptyInternalRow(), makeEmptyInternalRow(), makeEmptyInternalRow()]
          : data.internalRows.map((row: any) => ({
              localId: crypto.randomUUID(),
              resourceValue: row.resourceValue ?? "",
              jobOrderId: row.jobOrderId ?? "",
              hours: row.hours?.toString() ?? "",
              activityDescription: row.activityDescription ?? "",
            }))
      );

      setExternalRows(
        !data.externalRows || data.externalRows.length === 0
          ? [makeEmptyExternalRow(), makeEmptyExternalRow()]
          : data.externalRows.map((row: any) => ({
              localId: crypto.randomUUID(),
              externalResourceId: row.externalResourceId ?? "",
              jobOrderId: row.jobOrderId ?? "",
              days: row.days?.toString() ?? "",
              activityDescription: row.activityDescription ?? "",
            }))
      );
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
      const data = await safeJsonFetch("/api/diario/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceDate,
          internalRows: internalRows.map((row) => ({
            resourceValue: row.resourceValue,
            jobOrderId: row.jobOrderId,
            hours: row.hours,
            activityDescription: row.activityDescription,
          })),
          externalRows: externalRows.map((row) => ({
            externalResourceId: row.externalResourceId,
            jobOrderId: row.jobOrderId,
            days: row.days,
            activityDescription: row.activityDescription,
          })),
        }),
      });

      setMessage(`Salvataggio completato. Interne: ${data.savedInternalRows}. Esterne: ${data.savedExternalRows}.`);
      await loadRows(referenceDate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddExternalResource() {
    if (!externalResourceDraft.trim()) return;

    setSavingExternalResource(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/diario/external-resources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: externalResourceDraft }),
      });

      setExternalResources((current) =>
        [...current, data.resource].sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }))
      );
      setExternalResourceDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio risorsa esterna");
    } finally {
      setSavingExternalResource(false);
    }
  }

  async function handleDeleteExternalResource(id: string) {
    setError("");

    try {
      await safeJsonFetch(`/api/diario/external-resources?id=${id}`, { method: "DELETE" });
      setExternalResources((current) => current.filter((resource) => resource.id !== id));
      setExternalRows((current) =>
        current.map((row) => (row.externalResourceId === id ? { ...row, externalResourceId: "" } : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella rimozione risorsa esterna");
    }
  }

  const totalInternalHours = useMemo(() => sumNumericStrings(internalRows.map((row) => row.hours)), [internalRows]);
  const totalExternalDays = useMemo(() => sumNumericStrings(externalRows.map((row) => row.days)), [externalRows]);

  const completedInternalRows = useMemo(
    () =>
      internalRows.filter(
        (row) => row.resourceValue.trim() && row.jobOrderId.trim() && row.hours.trim() && row.activityDescription.trim()
      ).length,
    [internalRows]
  );

  const completedExternalRows = useMemo(
    () =>
      externalRows.filter(
        (row) => row.externalResourceId.trim() && row.jobOrderId.trim() && row.days.trim() && row.activityDescription.trim()
      ).length,
    [externalRows]
  );

  return (
    <div className="diary-page">
      <section className="card diary-shell">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Inserimento Operativo</p>
            <h1 className="mobile-section-title">Diario del cantiere</h1>
            <p className="mobile-section-subtitle">
              Scegli il giorno, compila le risorse interne ed esterne e salva tutto insieme.
            </p>
          </div>
        </div>

        <div className="diary-topbar">
          <article className="card diary-date-card">
            <label className="mobile-data-field">
              <span className="mobile-data-label">Giorno operativo</span>
              <input type="date" value={referenceDate} onChange={(e) => setReferenceDate(e.target.value)} className="diary-date-input" />
            </label>
            <div className="muted">Stai compilando il diario del {formatDisplayDate(referenceDate)}.</div>
          </article>

          <article className="card diary-summary-card">
            <div className="diary-summary-grid diary-summary-grid-wide">
              <div className="diary-summary-item">
                <span className="mobile-data-label">Interne</span>
                <strong className="diary-summary-value">{completedInternalRows}/{internalRows.length}</strong>
              </div>
              <div className="diary-summary-item">
                <span className="mobile-data-label">Ore Interne</span>
                <strong className="diary-summary-value">{totalInternalHours.toFixed(1)}</strong>
              </div>
              <div className="diary-summary-item">
                <span className="mobile-data-label">Esterne</span>
                <strong className="diary-summary-value">{completedExternalRows}/{externalRows.length}</strong>
              </div>
              <div className="diary-summary-item">
                <span className="mobile-data-label">Giornate Esterne</span>
                <strong className="diary-summary-value">{totalExternalDays.toFixed(1)}</strong>
              </div>
            </div>

            <div className="diary-quick-actions">
              <button className="button" type="button" onClick={() => router.push("/risorse")}>Vedi risorse</button>
              <button className="button" type="button" onClick={() => router.push("/commesse")}>Vedi commesse</button>
              <button className="mobile-button-secondary" type="button" onClick={() => router.push("/dashboard-commessa")}>Dashboard commessa</button>
            </div>
          </article>
        </div>

        {message ? <div className="scad-success">{message}</div> : null}
        {error ? <div className="scad-error">{error}</div> : null}

        <DiarySection
          title="Risorse Interne"
          subtitle="Personale e mezzi interni caricati a ore sulla commessa."
          rows={internalRows}
          resources={resources}
          jobOrders={jobOrders}
          loading={loading}
          loadingRows={loadingRows}
          onAddRow={addInternalRow}
          onDuplicateRow={duplicateInternalRow}
          onRemoveRow={removeInternalRow}
          renderDesktopRow={(row, index) => (
            <tr key={row.localId}>
              <td className="diary-body-cell">
                <select value={row.resourceValue} onChange={(e) => setInternalRowValue(row.localId, { resourceValue: e.target.value })} className="diary-table-input" disabled={loading || loadingRows}>
                  <option value="">Seleziona risorsa</option>
                  {resources.map((resource) => <option key={resource.value} value={resource.value}>{resource.label}</option>)}
                </select>
              </td>
              <td className="diary-body-cell">
                <select value={row.jobOrderId} onChange={(e) => setInternalRowValue(row.localId, { jobOrderId: e.target.value })} className="diary-table-input" disabled={loading || loadingRows}>
                  <option value="">Seleziona commessa</option>
                  {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
                </select>
              </td>
              <td className="diary-body-cell">
                <input type="number" step="0.1" min="0.1" value={row.hours} onChange={(e) => setInternalRowValue(row.localId, { hours: e.target.value })} className="diary-table-input" placeholder="0.0" disabled={loadingRows} />
              </td>
              <td className="diary-body-cell">
                <input type="text" value={row.activityDescription} onChange={(e) => setInternalRowValue(row.localId, { activityDescription: e.target.value })} className="diary-table-input" placeholder="Descrizione lavoro" disabled={loadingRows} />
              </td>
              <td className="diary-body-cell diary-header-cell-tiny">
                <button type="button" onClick={() => removeInternalRow(row.localId)} className="diary-remove-button" title={`Rimuovi riga ${index + 1}`}>&times;</button>
              </td>
            </tr>
          )}
          renderMobileRow={(row, index) => (
            <article key={row.localId} className="card diary-row-card">
              <div className="diary-row-card-head">
                <div><div className="mobile-data-label">Risorse Interne</div><strong>Riga {index + 1}</strong></div>
                <button type="button" onClick={() => removeInternalRow(row.localId)} className="mobile-danger-button" title={`Rimuovi riga ${index + 1}`}>&times;</button>
              </div>
              <div className="diary-row-grid">
                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Risorsa</span>
                  <select value={row.resourceValue} onChange={(e) => setInternalRowValue(row.localId, { resourceValue: e.target.value })} className="mobile-data-select" disabled={loading || loadingRows}>
                    <option value="">Seleziona risorsa</option>
                    {resources.map((resource) => <option key={resource.value} value={resource.value}>{resource.label}</option>)}
                  </select>
                </label>
                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Commessa</span>
                  <select value={row.jobOrderId} onChange={(e) => setInternalRowValue(row.localId, { jobOrderId: e.target.value })} className="mobile-data-select" disabled={loading || loadingRows}>
                    <option value="">Seleziona commessa</option>
                    {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
                  </select>
                </label>
                <label className="mobile-data-field">
                  <span className="mobile-data-label">Ore</span>
                  <input type="number" step="0.1" min="0.1" value={row.hours} onChange={(e) => setInternalRowValue(row.localId, { hours: e.target.value })} className="mobile-data-input" placeholder="0.0" disabled={loadingRows} />
                </label>
                <label className="mobile-data-field mobile-data-field-full">
                  <span className="mobile-data-label">Descrizione</span>
                  <textarea value={row.activityDescription} onChange={(e) => setInternalRowValue(row.localId, { activityDescription: e.target.value })} className="mobile-data-input diary-row-textarea" placeholder="Descrivi l'attivita svolta" disabled={loadingRows} />
                </label>
              </div>
              <div className="diary-row-actions">
                <button type="button" className="mobile-button-secondary" onClick={() => duplicateInternalRow(row.localId)} disabled={loadingRows}>Duplica riga</button>
              </div>
            </article>
          )}
          headerLabels={["Risorsa", "Commessa", "Ore", "Descrizione", ""]}
        />

        <section className="diary-section diary-section-external">
          <div className="diary-section-head">
            <div>
              <h2 className="diary-section-title">Risorse Esterne</h2>
              <p className="diary-section-subtitle">Caricamenti a giornate per collaboratori o fornitori esterni.</p>
            </div>
            <button type="button" className="mobile-button-secondary diary-manage-button" onClick={() => setShowExternalResourceManager((current) => !current)}>Modifica elenco</button>
          </div>

          {showExternalResourceManager ? (
            <div className="diary-external-manager">
              <div className="diary-external-manager-form">
                <input value={externalResourceDraft} onChange={(e) => setExternalResourceDraft(e.target.value)} className="diary-table-input" placeholder="Nuova risorsa esterna" />
                <button type="button" className="button" onClick={handleAddExternalResource} disabled={savingExternalResource || !externalResourceDraft.trim()}>{savingExternalResource ? "Salvataggio..." : "Aggiungi voce"}</button>
              </div>
              <div className="diary-external-chip-list">
                {externalResources.length === 0 ? (
                  <p className="muted">Nessuna risorsa esterna disponibile.</p>
                ) : (
                  externalResources.map((resource) => (
                    <div key={resource.id} className="diary-external-chip">
                      <span>{resource.name}</span>
                      <button type="button" className="diary-chip-remove" onClick={() => handleDeleteExternalResource(resource.id)} title={`Rimuovi ${resource.name}`}>&times;</button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : null}

          <DiarySection
            title=""
            subtitle=""
            rows={externalRows}
            resources={resources}
            jobOrders={jobOrders}
            loading={loading}
            loadingRows={loadingRows}
            hideHeader
            onAddRow={addExternalRow}
            onDuplicateRow={duplicateExternalRow}
            onRemoveRow={removeExternalRow}
            renderDesktopRow={(row, index) => (
              <tr key={row.localId}>
                <td className="diary-body-cell">
                  <select value={row.externalResourceId} onChange={(e) => setExternalRowValue(row.localId, { externalResourceId: e.target.value })} className="diary-table-input" disabled={loading || loadingRows}>
                    <option value="">Seleziona risorsa esterna</option>
                    {externalResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                  </select>
                </td>
                <td className="diary-body-cell">
                  <select value={row.jobOrderId} onChange={(e) => setExternalRowValue(row.localId, { jobOrderId: e.target.value })} className="diary-table-input" disabled={loading || loadingRows}>
                    <option value="">Seleziona commessa</option>
                    {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
                  </select>
                </td>
                <td className="diary-body-cell">
                  <input type="number" step="0.1" min="0.1" value={row.days} onChange={(e) => setExternalRowValue(row.localId, { days: e.target.value })} className="diary-table-input" placeholder="0.0" disabled={loadingRows} />
                </td>
                <td className="diary-body-cell">
                  <input type="text" value={row.activityDescription} onChange={(e) => setExternalRowValue(row.localId, { activityDescription: e.target.value })} className="diary-table-input" placeholder="Descrizione attivita" disabled={loadingRows} />
                </td>
                <td className="diary-body-cell diary-header-cell-tiny">
                  <button type="button" onClick={() => removeExternalRow(row.localId)} className="diary-remove-button" title={`Rimuovi riga ${index + 1}`}>&times;</button>
                </td>
              </tr>
            )}
            renderMobileRow={(row, index) => (
              <article key={row.localId} className="card diary-row-card">
                <div className="diary-row-card-head">
                  <div><div className="mobile-data-label">Risorse Esterne</div><strong>Riga {index + 1}</strong></div>
                  <button type="button" onClick={() => removeExternalRow(row.localId)} className="mobile-danger-button" title={`Rimuovi riga ${index + 1}`}>&times;</button>
                </div>
                <div className="diary-row-grid">
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Risorsa</span>
                    <select value={row.externalResourceId} onChange={(e) => setExternalRowValue(row.localId, { externalResourceId: e.target.value })} className="mobile-data-select" disabled={loading || loadingRows}>
                      <option value="">Seleziona risorsa esterna</option>
                      {externalResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                    </select>
                  </label>
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Commessa</span>
                    <select value={row.jobOrderId} onChange={(e) => setExternalRowValue(row.localId, { jobOrderId: e.target.value })} className="mobile-data-select" disabled={loading || loadingRows}>
                      <option value="">Seleziona commessa</option>
                      {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
                    </select>
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Giornate</span>
                    <input type="number" step="0.1" min="0.1" value={row.days} onChange={(e) => setExternalRowValue(row.localId, { days: e.target.value })} className="mobile-data-input" placeholder="0.0" disabled={loadingRows} />
                  </label>
                  <label className="mobile-data-field mobile-data-field-full">
                    <span className="mobile-data-label">Descrizione</span>
                    <textarea value={row.activityDescription} onChange={(e) => setExternalRowValue(row.localId, { activityDescription: e.target.value })} className="mobile-data-input diary-row-textarea" placeholder="Descrivi l'attivita svolta" disabled={loadingRows} />
                  </label>
                </div>
                <div className="diary-row-actions">
                  <button type="button" className="mobile-button-secondary" onClick={() => duplicateExternalRow(row.localId)} disabled={loadingRows}>Duplica riga</button>
                </div>
              </article>
            )}
            headerLabels={["Risorsa", "Commessa", "Giornate", "Descrizione", ""]}
          />
        </section>

        <div className="diary-footer-actions" style={{ marginTop: 18 }}>
          <div className="mobile-toolbar-actions">
            <button className="button" type="button" onClick={handleSave} disabled={saving || loading}>{saving ? "Salvataggio..." : "Salva diario"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}

type DiarySectionProps<T extends { localId: string }> = {
  title: string;
  subtitle: string;
  rows: T[];
  resources: ResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  headerLabels: [string, string, string, string, string];
  hideHeader?: boolean;
  onAddRow: () => void;
  onDuplicateRow: (localId: string) => void;
  onRemoveRow: (localId: string) => void;
  renderDesktopRow: (row: T, index: number) => React.ReactNode;
  renderMobileRow: (row: T, index: number) => React.ReactNode;
};

function DiarySection<T extends { localId: string }>({
  title,
  subtitle,
  rows,
  headerLabels,
  hideHeader,
  onAddRow,
  renderDesktopRow,
  renderMobileRow,
}: DiarySectionProps<T>) {
  return (
    <section className={hideHeader ? "" : "diary-section"}>
      {!hideHeader ? (
        <div className="diary-section-head">
          <div>
            <h2 className="diary-section-title">{title}</h2>
            <p className="diary-section-subtitle">{subtitle}</p>
          </div>
        </div>
      ) : null}

      <div className="diary-table-shell">
        <table className="diary-table">
          <thead>
            <tr>
              <th className="diary-header-cell">{headerLabels[0]}</th>
              <th className="diary-header-cell">{headerLabels[1]}</th>
              <th className="diary-header-cell diary-header-cell-small">{headerLabels[2]}</th>
              <th className="diary-header-cell">{headerLabels[3]}</th>
              <th className="diary-header-cell diary-header-cell-tiny">{headerLabels[4]}</th>
            </tr>
          </thead>
          <tbody>{rows.map(renderDesktopRow)}</tbody>
        </table>
      </div>

      <div className="diary-mobile-list">{rows.map(renderMobileRow)}</div>

      <div className="diary-footer-actions diary-subsection-actions">
        <button type="button" onClick={onAddRow} className="mobile-button-success" aria-label="Aggiungi riga">+</button>
      </div>
    </section>
  );
}
