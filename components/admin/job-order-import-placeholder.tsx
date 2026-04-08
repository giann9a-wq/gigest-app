"use client";

import { useState } from "react";

type JobOrderOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

export function JobOrderImportPlaceholder({
  title,
  description,
  ctaLabel,
  jobOrders,
}: {
  title: string;
  description: string;
  ctaLabel: string;
  jobOrders: JobOrderOption[];
}) {
  const [selectedJobOrderId, setSelectedJobOrderId] = useState(jobOrders[0]?.id ?? "");

  return (
    <div className="admin-import-placeholder">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <h2 style={{ margin: 0 }}>{title}</h2>
            <p className="mobile-section-subtitle">{description}</p>
          </div>
        </div>

        <div className="admin-password-form">
          <label className="mobile-data-field">
            <span className="mobile-data-label">Commessa di riferimento</span>
            <select
              className="admin-password-input"
              value={selectedJobOrderId}
              onChange={(event) => setSelectedJobOrderId(event.target.value)}
            >
              {jobOrders.length === 0 ? (
                <option value="">Nessuna commessa attiva</option>
              ) : (
                jobOrders.map((jobOrder) => (
                  <option key={jobOrder.id} value={jobOrder.id}>
                    {jobOrder.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <button type="button" className="button" disabled={!selectedJobOrderId}>
            {ctaLabel}
          </button>
        </div>
      </section>

      <section className="card">
        <div className="mobile-section-header">
          <div>
            <h2 style={{ margin: 0 }}>Stato funzione</h2>
            <p className="mobile-section-subtitle">
              La selezione commessa è pronta. Appena definisci il template di import possiamo collegare upload, validazioni e scrittura dati.
            </p>
          </div>
        </div>

        <div className="admin-request-list">
          <article className="card admin-request-card">
            <strong>Commessa selezionabile</strong>
            <div className="muted">
              L&apos;import verrà agganciato alla commessa scelta prima del caricamento file.
            </div>
          </article>
          <article className="card admin-request-card">
            <strong>Template da definire</strong>
            <div className="muted">
              Appena condividi il tracciato file, predisponiamo colonne, validazioni e report scarti.
            </div>
          </article>
          <article className="card admin-request-card">
            <strong>Scrittura dati futura</strong>
            <div className="muted">
              Questa sezione sarà collegata alle voci economiche actual della dashboard commessa.
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}
