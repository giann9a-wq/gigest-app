"use client";

import { useState } from "react";

type ImportErrorRow = {
  rowNumber: number;
  error: string;
};

export function ImportPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<ImportErrorRow[]>([]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file) {
      setError("Seleziona un file Excel prima di avviare l'import.");
      setMessage("");
      setErrors([]);
      return;
    }

    setLoading(true);
    setMessage("");
    setError("");
    setErrors([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/admin/import-massivo", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Import non riuscito.");
        setErrors(Array.isArray(data.errors) ? data.errors : []);
        return;
      }

      setMessage(
        data.rejectedRows > 0
          ? `Import completato con scarti. Righe importate: ${data.importedRows}. Righe rifiutate: ${data.rejectedRows}.`
          : `Import completato. Righe importate: ${data.importedRows}.`
      );
      setErrors(Array.isArray(data.errors) ? data.errors : []);
      setFile(null);
      const form = event.currentTarget;
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import non riuscito.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="mobile-section-header">
        <div>
          <h2 style={{ margin: 0 }}>Carica file Excel</h2>
          <p className="mobile-section-subtitle">
            Verranno importate solo righe con risorsa e commessa riconosciute dal dominio corrente.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="admin-password-form">
        <input
          type="file"
          accept=".xlsx,.xls"
          className="admin-password-input"
          onChange={(event) => setFile(event.target.files?.[0] ?? null)}
        />
        <button type="submit" className="button" disabled={loading}>
          {loading ? "Import in corso..." : "Importa file"}
        </button>
      </form>

      {message ? <div className="scad-success">{message}</div> : null}
      {error ? <div className="scad-error">{error}</div> : null}

      {errors.length > 0 ? (
        <div className="admin-request-list" style={{ marginTop: 12 }}>
          {errors.map((item) => (
            <article key={`${item.rowNumber}-${item.error}`} className="card admin-request-card">
              <strong>Riga {item.rowNumber}</strong>
              <div className="muted">{item.error}</div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
