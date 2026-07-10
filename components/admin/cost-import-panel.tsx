"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type JobOrderOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type RecentSession = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  rowCount: number;
  jobOrder: {
    id: string;
    name: string;
  };
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function CostImportPanel({
  jobOrders,
  recentSessions,
}: {
  jobOrders: JobOrderOption[];
  recentSessions: RecentSession[];
}) {
  const router = useRouter();
  const [selectedJobOrderId, setSelectedJobOrderId] = useState(jobOrders[0]?.id ?? "");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parseFile, setParseFile] = useState<File | null>(null);
  const [cleanFile, setCleanFile] = useState<File | null>(null);
  const [isParseModalOpen, setIsParseModalOpen] = useState(false);
  const [error, setError] = useState("");
  const [parseError, setParseError] = useState("");
  const [cleanImportError, setCleanImportError] = useState("");
  const [parseMessage, setParseMessage] = useState("");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [isParsingTemplate, setIsParsingTemplate] = useState(false);
  const [isImportingCleanFile, setIsImportingCleanFile] = useState(false);
  const [isPending, startTransition] = useTransition();

  function fileNameFromDisposition(disposition: string | null) {
    const match = disposition?.match(/filename="([^"]+)"/i);
    return match?.[1] ?? "costi-puliti.xlsx";
  }

  async function handleParseTemplate() {
    if (!parseFile) {
      setParseError("Seleziona il file gestionale prima di avviare il parsing.");
      return;
    }

    setIsParsingTemplate(true);
    setParseError("");
    setParseMessage("");

    try {
      const formData = new FormData();
      formData.set("file", parseFile);

      const response = await fetch("/api/admin/import-costi/parse-template", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante il parsing del file");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileNameFromDisposition(response.headers.get("Content-Disposition"));
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setParseMessage(`File pulito generato. Righe lette: ${response.headers.get("X-Parsed-Rows") ?? "-"}.`);
    } catch (parseTemplateError) {
      setParseError(parseTemplateError instanceof Error ? parseTemplateError.message : "Errore durante il parsing");
    } finally {
      setIsParsingTemplate(false);
    }
  }

  async function handleCleanImport() {
    if (!cleanFile) {
      setCleanImportError("Seleziona il file pulito confermato prima di importare.");
      return;
    }

    setIsImportingCleanFile(true);
    setCleanImportError("");
    setSummary(null);

    try {
      const formData = new FormData();
      formData.set("file", cleanFile);
      const response = await fetch("/api/admin/import-costi/clean", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore durante l'import del file pulito");
      }

      setSummary(data.summary ?? null);
      router.push(`/admin/import-costi/${data.sessionId}`);
    } catch (cleanError) {
      setCleanImportError(cleanError instanceof Error ? cleanError.message : "Errore durante l'import del file pulito");
    } finally {
      setIsImportingCleanFile(false);
    }
  }

  async function handleUpload() {
    if (!selectedJobOrderId || !selectedFile) {
      setError("Seleziona commessa e file Excel prima di avviare l'import.");
      return;
    }

    setError("");
    setSummary(null);

    const formData = new FormData();
    formData.set("jobOrderId", selectedJobOrderId);
    formData.set("file", selectedFile);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/import-costi", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Errore durante il parsing del file");
        }

        setSummary(data.summary ?? null);
        router.push(`/admin/import-costi/${data.sessionId}`);
      } catch (uploadError) {
        setError(uploadError instanceof Error ? uploadError.message : "Errore durante l'upload");
      }
    });
  }

  return (
    <div className="admin-import-placeholder">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <h2 style={{ margin: 0 }}>Parsing file gestionale</h2>
            <p className="mobile-section-subtitle">
              Carica il partitario completo, trasformalo in un Excel leggibile, assegna le commesse nel file e poi importa il tracciato pulito.
            </p>
          </div>
          <button type="button" className="button" onClick={() => setIsParseModalOpen(true)}>
            Apri parsing
          </button>
        </div>

        <div className="admin-note">
          Il file generato contiene uno sheet con una riga per costo e uno sheet con il dominio commesse. Compila
          <strong> CommessaId </strong>
          sulle righe da importare, correggi eventuali campi e ricarica qui sotto il file confermato.
        </div>

        <div className="cost-import-form">
          <label className="mobile-data-field">
            <span className="mobile-data-label">File pulito confermato</span>
            <input
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="admin-password-input"
              onChange={(event) => setCleanFile(event.target.files?.[0] ?? null)}
              disabled={isImportingCleanFile}
            />
          </label>

          <button
            type="button"
            className="button"
            onClick={handleCleanImport}
            disabled={isImportingCleanFile || !cleanFile}
          >
            {isImportingCleanFile ? "Import file pulito..." : "Importa file pulito"}
          </button>
        </div>

        {cleanImportError ? <div className="scad-error">{cleanImportError}</div> : null}
        {summary ? (
          <div className="admin-note">
            Import pulito preparato. Righe lette: <strong>{String(summary.parsedRows ?? 0)}</strong>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="mobile-section-header">
          <div>
            <h2 style={{ margin: 0 }}>Import rapido singola commessa</h2>
            <p className="mobile-section-subtitle">
              Percorso storico: carica un partitario gia riferito a una sola commessa e passa alla validazione.
            </p>
          </div>
        </div>

        <div className="cost-import-form">
          <label className="mobile-data-field">
            <span className="mobile-data-label">Commessa</span>
            <select
              className="admin-password-input"
              value={selectedJobOrderId}
              onChange={(event) => setSelectedJobOrderId(event.target.value)}
              disabled={isPending}
            >
              <option value="">Seleziona commessa</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mobile-data-field">
            <span className="mobile-data-label">File Excel `.xls` / `.xlsx`</span>
            <input
              type="file"
              accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="admin-password-input"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              disabled={isPending}
            />
          </label>

          <button type="button" className="button" onClick={handleUpload} disabled={isPending || !selectedJobOrderId || !selectedFile}>
            {isPending ? "Parsing in corso..." : "Carica e valida"}
          </button>
        </div>

        {error ? <div className="scad-error">{error}</div> : null}
        {summary ? (
          <div className="admin-note">
            Parsing completato. Righe lette: <strong>{String(summary.parsedRows ?? 0)}</strong>
          </div>
        ) : null}
      </section>

      {isParseModalOpen ? (
        <div className="cost-import-split-backdrop" role="presentation">
          <div className="cost-import-parse-modal" role="dialog" aria-modal="true" aria-labelledby="parse-cost-title">
            <div className="cost-import-split-head">
              <div>
                <p className="dashboard-kicker">Parsing</p>
                <h3 id="parse-cost-title">Genera Excel pulito</h3>
              </div>
              <button
                type="button"
                className="cost-view-modal-close"
                onClick={() => setIsParseModalOpen(false)}
                aria-label="Chiudi popup parsing"
              >
                x
              </button>
            </div>

            <div className="cost-import-parse-body">
              <label className="mobile-data-field">
                <span className="mobile-data-label">File gestionale completo</span>
                <input
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="admin-password-input"
                  onChange={(event) => setParseFile(event.target.files?.[0] ?? null)}
                  disabled={isParsingTemplate}
                />
              </label>
              {parseError ? <div className="scad-error">{parseError}</div> : null}
              {parseMessage ? <div className="admin-note">{parseMessage}</div> : null}
            </div>

            <div className="cost-import-split-actions">
              <button
                type="button"
                className="mobile-button-secondary"
                onClick={() => setIsParseModalOpen(false)}
                disabled={isParsingTemplate}
              >
                Chiudi
              </button>
              <button
                type="button"
                className="button"
                onClick={handleParseTemplate}
                disabled={isParsingTemplate || !parseFile}
              >
                {isParsingTemplate ? "Parsing..." : "Scarica Excel pulito"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="card">
        <div className="mobile-section-header">
          <div>
            <h2 style={{ margin: 0 }}>Sessioni recenti</h2>
          </div>
        </div>

        {recentSessions.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nessuna import session ancora presente.
          </p>
        ) : (
          <>
            <div className="scad-table-wrap cost-import-session-table-wrap">
              <table className="scad-table cost-import-session-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Commessa</th>
                    <th>Data</th>
                    <th>Righe</th>
                    <th>Stato</th>
                    <th>Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((session) => (
                    <tr key={session.id}>
                      <td><strong>{session.fileName}</strong></td>
                      <td>{session.jobOrder.name}</td>
                      <td>{formatDateTime(session.uploadedAt)}</td>
                      <td>{session.rowCount}</td>
                      <td><span className="admin-request-badge">{session.status}</span></td>
                      <td>
                        <Link href={`/admin/import-costi/${session.id}`} className="mobile-button-secondary">
                          Apri
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="cost-import-session-cards">
              {recentSessions.map((session) => (
                <article key={session.id} className="card admin-request-card">
                  <div className="admin-request-head">
                    <strong>{session.fileName}</strong>
                    <span className="admin-request-badge">{session.status}</span>
                  </div>
                  <div className="admin-request-meta">
                    <span>{session.jobOrder.name}</span>
                    <span>{formatDateTime(session.uploadedAt)}</span>
                    <span>{session.rowCount} righe</span>
                  </div>
                  <div className="admin-request-actions">
                    <Link href={`/admin/import-costi/${session.id}`} className="mobile-button-secondary">
                      Apri
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
