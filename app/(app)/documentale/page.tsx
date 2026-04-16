"use client";

import { useEffect, useState } from "react";

type JobOrderOption = {
  id: string;
  name: string;
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

async function safeJsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("it-IT");
}

function formatFileSize(value: number | null) {
  if (!value) return "";
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

export default function DocumentalePage() {
  const [rows, setRows] = useState<DeliveryNoteDocumentRow[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [supplier, setSupplier] = useState("");
  const [jobOrderId, setJobOrderId] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
      setJobOrders(data.jobOrders ?? []);
      setSuppliers(data.suppliers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento bolle");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

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

  return (
    <div className="documentale-page">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Documentale</p>
          <h1 className="dashboard-title">Documentale</h1>
          <p className="dashboard-subtitle">Consulta e valida le bolle caricate dai cantieri.</p>
        </div>
      </section>

      <section className="documentale-tabs">
        <button type="button" className="documentale-tab documentale-tab-active">
          Bolle di Cantiere
        </button>
      </section>

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

      {message ? <div className="scad-success">{message}</div> : null}
      {error ? <div className="scad-error">{error}</div> : null}

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
                <tr>
                  <td colSpan={7}>Caricamento bolle...</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nessuna bolla trovata.</td>
                </tr>
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
                          <a
                            key={document.id}
                            href={`/api/documentale/bolle/documenti/${document.id}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {document.fileName}
                            {formatFileSize(document.sizeBytes) ? ` (${formatFileSize(document.sizeBytes)})` : ""}
                          </a>
                        ))}
                      </div>
                    </td>
                    <td>
                      {row.validationStatus === "PENDING" ? (
                        <button
                          type="button"
                          className="button"
                          onClick={() => void validateDeliveryNote(row.id)}
                          disabled={savingId === row.id}
                        >
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
    </div>
  );
}
