"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type RecentSession = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  rowCount: number;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export function InvoiceImportPanel({
  recentSessions,
}: {
  recentSessions: RecentSession[];
}) {
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleUpload() {
    if (!selectedFile) {
      setError("Seleziona prima un file .xls da importare.");
      return;
    }

    setError("");
    setSummary(null);

    const formData = new FormData();
    formData.set("file", selectedFile);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/import-fatture", {
          method: "POST",
          body: formData,
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Errore durante il parsing del file");
        }

        setSummary(data.summary ?? null);
        router.push(`/admin/import-fatture/${data.sessionId}`);
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
            <h2 style={{ margin: 0 }}>Upload file gestionale</h2>
            <p className="mobile-section-subtitle">
              Carica il partitario fatture `.xls`, crea una nuova sessione di staging e passa subito alla validazione con assegnazione manuale commessa.
            </p>
          </div>
        </div>

        <div className="cost-import-form">
          <label className="mobile-data-field">
            <span className="mobile-data-label">File Excel `.xls`</span>
            <input
              type="file"
              accept=".xls,application/vnd.ms-excel"
              className="admin-password-input"
              onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
              disabled={isPending}
            />
          </label>

          <button
            type="button"
            className="button"
            onClick={handleUpload}
            disabled={isPending || !selectedFile}
          >
            {isPending ? "Parsing in corso..." : "Carica e valida"}
          </button>
        </div>

        {error ? <div className="scad-error">{error}</div> : null}
        {summary ? (
          <div className="admin-note">
            Parsing completato. Fatture lette: <strong>{String(summary.parsedRows ?? 0)}</strong>
          </div>
        ) : null}
      </section>

      <section className="card">
        <div className="mobile-section-header">
          <div>
            <h2 style={{ margin: 0 }}>Sessioni recenti</h2>
          </div>
        </div>

        {recentSessions.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nessuna import session fatture ancora presente.
          </p>
        ) : (
          <>
            <div className="scad-table-wrap cost-import-session-table-wrap">
              <table className="scad-table cost-import-session-table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Data</th>
                    <th>Righe</th>
                    <th>Stato</th>
                    <th>Azione</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSessions.map((session) => (
                    <tr key={session.id}>
                      <td>
                        <strong>{session.fileName}</strong>
                      </td>
                      <td>{formatDateTime(session.uploadedAt)}</td>
                      <td>{session.rowCount}</td>
                      <td>
                        <span className="admin-request-badge">{session.status}</span>
                      </td>
                      <td>
                        <Link href={`/admin/import-fatture/${session.id}`} className="mobile-button-secondary">
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
                    <span>{formatDateTime(session.uploadedAt)}</span>
                    <span>{session.rowCount} righe</span>
                  </div>
                  <div className="admin-request-actions">
                    <Link href={`/admin/import-fatture/${session.id}`} className="mobile-button-secondary">
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
