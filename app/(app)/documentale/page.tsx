"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { PdfViewerModal } from "@/components/pdf-viewer-modal";

type JobOrderOption = {
  id: string;
  name: string;
  type?: string;
};

type DeliveryNoteDocument = {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
};

type DeliveryNoteDocumentRow = {
  id: string;
  jobOrderId: string;
  jobOrderName: string;
  supplier: string;
  description: string;
  usageDate: string;
  validationStatus: "PENDING" | "VALIDATED";
  validationStatusLabel: string;
  validatedAt: string | null;
  documents: DeliveryNoteDocument[];
};

type ScannedDeliveryNoteRow = {
  id: string;
  fromEmail: string;
  subject: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status: "NEW";
  statusLabel: string;
  receivedAt: string;
  importedAt: string;
};

type ScanFormState = {
  jobOrderId: string;
  usageDate: string;
  supplier: string;
  description: string;
};

type DeliveryNoteEditFormState = ScanFormState;

type PdfPreviewState = {
  title: string;
  url: string;
  subtitle?: string;
};

type DocumentaleTab = "bolle" | "scansioni";

async function safeJsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data;
}

function todayAsInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("it-IT");
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatFileSize(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

function emptyScanForm(): ScanFormState {
  return {
    jobOrderId: "",
    usageDate: todayAsInputValue(),
    supplier: "",
    description: "",
  };
}

export default function DocumentalePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const source = searchParams.get("source") || "";
  const initialTab = searchParams.get("tab") === "scansioni" ? "scansioni" : "bolle";
  const showReturnToDiary = source === "diario-bolle";
  const [activeTab, setActiveTab] = useState<DocumentaleTab>(initialTab);
  const [rows, setRows] = useState<DeliveryNoteDocumentRow[]>([]);
  const [scanRows, setScanRows] = useState<ScannedDeliveryNoteRow[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [supplier, setSupplier] = useState("");
  const [jobOrderId, setJobOrderId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [scansLoading, setScansLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [selectedScan, setSelectedScan] = useState<ScannedDeliveryNoteRow | null>(null);
  const [scanForm, setScanForm] = useState<ScanFormState>(emptyScanForm());
  const [editingDeliveryNoteId, setEditingDeliveryNoteId] = useState("");
  const [deliveryNoteEditForm, setDeliveryNoteEditForm] = useState<DeliveryNoteEditFormState>(emptyScanForm());
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const scanFormComplete = useMemo(
    () =>
      Boolean(
        scanForm.jobOrderId.trim() &&
          scanForm.usageDate.trim() &&
          scanForm.supplier.trim() &&
          scanForm.description.trim()
      ),
    [scanForm]
  );

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      if (supplier.trim()) params.set("supplier", supplier.trim());
      if (jobOrderId) params.set("jobOrderId", jobOrderId);
      if (status) params.set("status", status);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const data = await safeJsonFetch(`/api/documentale/bolle?${params.toString()}`);
      setRows(data.rows ?? []);
      setJobOrders((current) => (data.jobOrders?.length ? data.jobOrders : current));
      setSuppliers(data.suppliers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento bolle");
    } finally {
      setLoading(false);
    }
  }

  async function loadScans() {
    setScansLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/documentale/scansioni");
      setScanRows(data.rows ?? []);
      setJobOrders((current) => (data.jobOrders?.length ? data.jobOrders : current));
      if (data.suppliers?.length) {
        setSuppliers(data.suppliers);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento scansioni");
    } finally {
      setScansLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
    void loadScans();
  }, []);

  function selectTab(tab: DocumentaleTab) {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "scansioni") {
      params.set("tab", "scansioni");
    } else {
      params.delete("tab");
    }
    router.replace(`/documentale${params.toString() ? `?${params.toString()}` : ""}` as Route);
  }

  async function validateDeliveryNote(id: string) {
    setSavingId(id);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/documentale/bolle/${id}/valida`, { method: "POST" });
      setMessage("Bolla validata.");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella validazione");
    } finally {
      setSavingId("");
    }
  }

  function startEditDeliveryNote(row: DeliveryNoteDocumentRow) {
    setEditingDeliveryNoteId(row.id);
    setDeliveryNoteEditForm({
      jobOrderId: row.jobOrderId,
      usageDate: row.usageDate,
      supplier: row.supplier,
      description: row.description,
    });
    setError("");
    setMessage("");
  }

  function cancelEditDeliveryNote() {
    setEditingDeliveryNoteId("");
    setDeliveryNoteEditForm(emptyScanForm());
  }

  async function updateDeliveryNote(id: string) {
    const complete = Boolean(
      deliveryNoteEditForm.jobOrderId.trim() &&
        deliveryNoteEditForm.usageDate.trim() &&
        deliveryNoteEditForm.supplier.trim() &&
        deliveryNoteEditForm.description.trim()
    );

    if (!complete) {
      setError("Compila tutti i campi obbligatori");
      return;
    }

    setSavingId(id);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/documentale/bolle/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deliveryNoteEditForm),
      });
      setMessage("Bolla aggiornata.");
      cancelEditDeliveryNote();
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella modifica bolla");
    } finally {
      setSavingId("");
    }
  }

  async function deleteDeliveryNote(row: DeliveryNoteDocumentRow) {
    const confirmed = window.confirm(`Eliminare la bolla "${row.supplier}" del ${formatDate(row.usageDate)}?`);
    if (!confirmed) return;

    setSavingId(row.id);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/documentale/bolle/${row.id}`, { method: "DELETE" });
      setMessage("Bolla eliminata.");
      if (editingDeliveryNoteId === row.id) {
        cancelEditDeliveryNote();
      }
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore eliminazione bolla");
    } finally {
      setSavingId("");
    }
  }

  async function syncScans() {
    setSyncing(true);
    setError("");
    setMessage("");

    try {
      const data = await safeJsonFetch("/api/integrations/gmail/scansioni/sync", { method: "POST" });
      setMessage(`Sync completata. Importate: ${data.imported}. Saltate: ${data.skipped}. Errori: ${data.errors}.`);
      await loadScans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella sync Gmail");
    } finally {
      setSyncing(false);
    }
  }

  function openScan(scan: ScannedDeliveryNoteRow) {
    setSelectedScan(scan);
    setScanForm(emptyScanForm());
    setError("");
    setMessage("");
  }

  async function insertScan() {
    if (!selectedScan || !scanFormComplete) {
      setError("Compila tutti i campi obbligatori");
      return;
    }

    setSavingId(selectedScan.id);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/documentale/scansioni/${selectedScan.id}/inserisci`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scanForm),
      });
      setMessage("Bolla inserita in stato Da Validare.");
      setSelectedScan(null);
      setScanForm(emptyScanForm());
      await Promise.all([loadScans(), loadRows()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'inserimento bolla");
    } finally {
      setSavingId("");
    }
  }

  async function rejectScan(scan: ScannedDeliveryNoteRow) {
    const confirmed = window.confirm(`Rifiutare la scansione "${scan.fileName}"? Non ricomparira nelle nuove scansioni.`);
    if (!confirmed) return;

    setSavingId(scan.id);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/documentale/scansioni/${scan.id}/rifiuta`, { method: "POST" });
      setMessage("Scansione rifiutata.");
      if (selectedScan?.id === scan.id) {
        setSelectedScan(null);
      }
      await loadScans();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel rifiuto scansione");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="documentale-page">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Documentale</p>
          <h1 className="dashboard-title">Documentale</h1>
          <p className="dashboard-subtitle">Consulta, inserisci e valida le bolle caricate dai cantieri.</p>
        </div>
        {showReturnToDiary ? (
          <button type="button" className="mobile-button-secondary" onClick={() => router.push("/diario?open=bolle" as Route)}>
            Torna al diario
          </button>
        ) : null}
      </section>

      <section className="documentale-tabs">
        <button
          type="button"
          className={`documentale-tab ${activeTab === "bolle" ? "documentale-tab-active" : ""}`}
          onClick={() => selectTab("bolle")}
        >
          Bolle di Cantiere
        </button>
        <button
          type="button"
          className={`documentale-tab ${activeTab === "scansioni" ? "documentale-tab-active" : ""}`}
          onClick={() => selectTab("scansioni")}
        >
          Bolle da inserire
          {scanRows.length > 0 ? <span className="documentale-tab-badge">{scanRows.length}</span> : null}
        </button>
      </section>

      {message ? <div className="scad-success">{message}</div> : null}
      {error ? <div className="scad-error">{error}</div> : null}

      {activeTab === "bolle" ? (
        <>
          <section className="card documentale-filters">
            <label>
              <span>Fornitore</span>
              <input
                list="documentale-suppliers"
                value={supplier}
                onChange={(event) => setSupplier(event.target.value)}
                placeholder="Cerca fornitore"
              />
            </label>
            <datalist id="documentale-suppliers">
              {suppliers.map((item) => (
                <option key={item} value={item} />
              ))}
            </datalist>
            <label>
              <span>Commessa</span>
              <select value={jobOrderId} onChange={(event) => setJobOrderId(event.target.value)}>
                <option value="">Tutte</option>
                {jobOrders.map((jobOrder) => (
                  <option key={jobOrder.id} value={jobOrder.id}>
                    {jobOrder.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Stato</span>
              <select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="">Tutti</option>
                <option value="PENDING">Da validare</option>
                <option value="VALIDATED">Validata</option>
              </select>
            </label>
            <label>
              <span>Da data</span>
              <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </label>
            <label>
              <span>A data</span>
              <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </label>
            <div className="documentale-filter-actions">
              <button type="button" className="button" onClick={() => void loadRows()} disabled={loading}>
                Cerca
              </button>
              <button
                type="button"
                className="mobile-button-secondary"
                onClick={() => {
                  setSupplier("");
                  setJobOrderId("");
                  setStatus("");
                  setDateFrom("");
                  setDateTo("");
                  setTimeout(() => void loadRows(), 0);
                }}
              >
                Pulisci
              </button>
            </div>
          </section>

          <section className="card documentale-results">
            <div className="dashboard-card-head">
              <strong>Bolle di Cantiere</strong>
              <span className="dashboard-pill">{rows.length} risultati</span>
            </div>
            <div className="documentale-table-wrap">
              <table className="documentale-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Fornitore</th>
                    <th>Commessa</th>
                    <th>Descrizione</th>
                    <th>Stato</th>
                    <th>Allegati</th>
                    <th>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7}>Caricamento bolle...</td></tr>
                  ) : rows.length === 0 ? (
                    <tr><td colSpan={7}>Nessuna bolla trovata.</td></tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.id}>
                        {editingDeliveryNoteId === row.id ? (
                          <>
                            <td>
                              <input
                                type="date"
                                value={deliveryNoteEditForm.usageDate}
                                onChange={(event) =>
                                  setDeliveryNoteEditForm((current) => ({ ...current, usageDate: event.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <input
                                list="documentale-suppliers"
                                value={deliveryNoteEditForm.supplier}
                                onChange={(event) =>
                                  setDeliveryNoteEditForm((current) => ({ ...current, supplier: event.target.value }))
                                }
                              />
                            </td>
                            <td>
                              <select
                                value={deliveryNoteEditForm.jobOrderId}
                                onChange={(event) =>
                                  setDeliveryNoteEditForm((current) => ({ ...current, jobOrderId: event.target.value }))
                                }
                              >
                                <option value="">Seleziona commessa</option>
                                {jobOrders.map((jobOrder) => (
                                  <option key={jobOrder.id} value={jobOrder.id}>
                                    {jobOrder.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                value={deliveryNoteEditForm.description}
                                onChange={(event) =>
                                  setDeliveryNoteEditForm((current) => ({ ...current, description: event.target.value }))
                                }
                              />
                            </td>
                            <td>{row.validationStatusLabel}</td>
                            <td>{row.documents.length} file</td>
                            <td>
                              <div className="documentale-row-actions">
                                <button type="button" className="button" onClick={() => void updateDeliveryNote(row.id)} disabled={savingId === row.id}>
                                  Salva
                                </button>
                                <button type="button" className="mobile-button-secondary" onClick={cancelEditDeliveryNote}>
                                  Annulla
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{formatDate(row.usageDate)}</td>
                            <td><strong>{row.supplier}</strong></td>
                            <td>{row.jobOrderName}</td>
                            <td>{row.description}</td>
                            <td>
                              <span className={`delivery-note-status delivery-note-status-${row.validationStatus.toLowerCase()}`}>
                                {row.validationStatusLabel}
                              </span>
                            </td>
                            <td>
                              <div className="delivery-note-documents">
                                {row.documents.length === 0 ? <span className="muted">Nessun allegato</span> : null}
                                {row.documents.map((document) => (
                                  <button
                                    key={document.id}
                                    type="button"
                                    className="document-link-button"
                                    onClick={() =>
                                      setPdfPreview({
                                        title: document.fileName,
                                        url: `/api/documentale/bolle/documenti/${document.id}`,
                                        subtitle: `${row.supplier} - ${formatDate(row.usageDate)}`,
                                      })
                                    }
                                  >
                                    {document.fileName}
                                    {formatFileSize(document.sizeBytes) ? ` (${formatFileSize(document.sizeBytes)})` : ""}
                                  </button>
                                ))}
                              </div>
                            </td>
                            <td>
                              <div className="documentale-row-actions">
                                {row.validationStatus === "PENDING" ? (
                                  <button type="button" className="button" onClick={() => void validateDeliveryNote(row.id)} disabled={savingId === row.id}>
                                    {savingId === row.id ? "Validazione..." : "Valida"}
                                  </button>
                                ) : (
                                  <span className="muted">Validata</span>
                                )}
                                <button
                                  type="button"
                                  className="icon-action-button"
                                  aria-label="Modifica bolla"
                                  title="Modifica"
                                  onClick={() => startEditDeliveryNote(row)}
                                >
                                  ✎
                                </button>
                                <button
                                  type="button"
                                  className="icon-action-button icon-action-button-danger"
                                  aria-label="Elimina bolla"
                                  title="Elimina"
                                  onClick={() => void deleteDeliveryNote(row)}
                                  disabled={savingId === row.id}
                                >
                                  🗑
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        <section className="card documentale-results">
          <div className="dashboard-card-head">
            <strong>Bolle da inserire</strong>
            <div className="documentale-filter-actions">
              <span className="dashboard-pill">{scanRows.length} nuove</span>
              <button type="button" className="mobile-button-secondary" onClick={() => void syncScans()} disabled={syncing}>
                {syncing ? "Sync..." : "Sincronizza Gmail"}
              </button>
            </div>
          </div>
          <div className="documentale-table-wrap">
            <table className="documentale-table documentale-scans-table">
              <thead>
                <tr>
                  <th>Ricezione</th>
                  <th>File</th>
                  <th>Mittente</th>
                  <th>Oggetto</th>
                  <th>Stato</th>
                  <th>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {scansLoading ? (
                  <tr><td colSpan={6}>Caricamento scansioni...</td></tr>
                ) : scanRows.length === 0 ? (
                  <tr><td colSpan={6}>Nessuna nuova scansione da inserire.</td></tr>
                ) : (
                  scanRows.map((scan) => (
                    <tr key={scan.id}>
                      <td>{formatDateTime(scan.receivedAt)}</td>
                      <td>
                        <strong>{scan.fileName}</strong>
                        {formatFileSize(scan.sizeBytes) ? <small>{formatFileSize(scan.sizeBytes)}</small> : null}
                      </td>
                      <td>{scan.fromEmail}</td>
                      <td>{scan.subject || "-"}</td>
                      <td><span className="delivery-note-status delivery-note-status-pending">{scan.statusLabel}</span></td>
                      <td>
                        <div className="documentale-row-actions">
                        <button type="button" className="button" onClick={() => openScan(scan)}>
                          Apri
                        </button>
                          <button type="button" className="mobile-button-secondary" onClick={() => void rejectScan(scan)} disabled={savingId === scan.id}>
                            Rifiuta
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedScan ? (
        <div className="documentale-scan-modal-backdrop" role="dialog" aria-modal="true">
          <section className="documentale-scan-modal">
            <header className="diary-print-dialog-head">
              <div>
                <p className="dashboard-kicker">Bolle da inserire</p>
                <h2>{selectedScan.fileName}</h2>
                <p>{selectedScan.fromEmail} - {formatDateTime(selectedScan.receivedAt)}</p>
              </div>
              <button type="button" className="mobile-button-secondary" onClick={() => setSelectedScan(null)}>
                Chiudi
              </button>
            </header>
            <div className="documentale-scan-modal-body">
              <iframe
                className="documentale-pdf-viewer"
                src={`/api/documentale/scansioni/${selectedScan.id}/documento`}
                title={`Scansione ${selectedScan.fileName}`}
              />
              <aside className="documentale-scan-form">
                <datalist id="documentale-suppliers">
                  {suppliers.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
                <label>
                  <span>Commessa</span>
                  <select value={scanForm.jobOrderId} onChange={(event) => setScanForm((current) => ({ ...current, jobOrderId: event.target.value }))}>
                    <option value="">Seleziona commessa</option>
                    {jobOrders.map((jobOrder) => (
                      <option key={jobOrder.id} value={jobOrder.id}>
                        {jobOrder.name}{jobOrder.type ? ` (${jobOrder.type})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Data</span>
                  <input type="date" value={scanForm.usageDate} onChange={(event) => setScanForm((current) => ({ ...current, usageDate: event.target.value }))} />
                </label>
                <label>
                  <span>Fornitore</span>
                  <input
                    list="documentale-suppliers"
                    value={scanForm.supplier}
                    onChange={(event) => setScanForm((current) => ({ ...current, supplier: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Descrizione</span>
                  <textarea value={scanForm.description} onChange={(event) => setScanForm((current) => ({ ...current, description: event.target.value }))} />
                </label>
                <button type="button" className="button" onClick={() => void insertScan()} disabled={!scanFormComplete || savingId === selectedScan.id}>
                  {savingId === selectedScan.id ? "Inserimento..." : "Inserisci"}
                </button>
              </aside>
            </div>
          </section>
        </div>
      ) : null}

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
