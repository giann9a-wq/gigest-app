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
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleUpload() {
    if (!selectedJobOrderId || !selectedFile) {
      setError("Seleziona commessa e file .xls prima di avviare l'import.");
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
            <h2 style={{ margin: 0 }}>Upload file gestionale</h2>
            <p className="mobile-section-subtitle">
              Carica un report partitario `.xls`, crea una nuova import session e passa subito alla validazione righe.
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
            <span className="mobile-data-label">File Excel `.xls`</span>
            <input
              type="file"
              accept=".xls,application/vnd.ms-excel"
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

      <section className="card">
        <div className="mobile-section-header">
          <div>
            <h2 style={{ margin: 0 }}>Sessioni recenti</h2>
            <p className="mobile-section-subtitle">
              Ogni reimport crea sempre una nuova sessione, così lo staging resta tracciabile e confrontabile.
            </p>
          </div>
        </div>

        {recentSessions.length === 0 ? (
          <p className="muted" style={{ margin: 0 }}>
            Nessuna import session ancora presente.
          </p>
        ) : (
          <div className="admin-request-list">
            {recentSessions.map((session) => (
              <article key={session.id} className="card admin-request-card">
                <div className="admin-request-head">
                  <div>
                    <strong>{session.fileName}</strong>
                    <div className="muted">{session.jobOrder.name}</div>
                  </div>
                  <span className="admin-request-badge">{session.status}</span>
                </div>
                <div className="admin-request-meta">
                  <span>{formatDateTime(session.uploadedAt)}</span>
                  <span>{session.rowCount} righe staging</span>
                </div>
                <div className="admin-request-actions">
                  <Link href={`/admin/import-costi/${session.id}`} className="mobile-button-secondary">
                    Apri validazione
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
