"use client";

import { useEffect, useMemo, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";

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
                              <a key={document.id} href={`/api/documentale/bolle/documenti/${document.id}`} target="_blank" rel="noreferrer">
                                {document.fileName}
                                {formatFileSize(document.sizeBytes) ? ` (${formatFileSize(document.sizeBytes)})` : ""}
                              </a>
                            ))}
                          </div>
                        </td>
                        <td>
                          {row.validationStatus === "PENDING" ? (
                            <button type="button" className="button" onClick={() => void validateDeliveryNote(row.id)} disabled={savingId === row.id}>
                              {savingId === row.id ? "Validazione..." : "Valida"}
                            </button>
                          ) : (
                            <span className="muted">Validata</span>
                          )}
                        </td>
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
                        <button type="button" className="button" onClick={() => openScan(scan)}>
                          Apri
                        </button>
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
                  <input value={scanForm.supplier} onChange={(event) => setScanForm((current) => ({ ...current, supplier: event.target.value }))} />
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
    </div>
  );
}
