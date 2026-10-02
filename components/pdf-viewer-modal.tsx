"use client";

import type { ReactNode } from "react";

type PdfViewerModalProps = {
  title: string;
  url: string;
  subtitle?: string;
  actions?: ReactNode;
  onClose: () => void;
};

export function PdfViewerModal({ title, url, subtitle, actions, onClose }: PdfViewerModalProps) {
  return (
    <div className="pdf-viewer-modal-backdrop" role="dialog" aria-modal="true">
      <section className="pdf-viewer-modal">
        <header className="pdf-viewer-modal-head">
          <div>
            <p className="dashboard-kicker">Documento</p>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <div className="pdf-viewer-modal-actions">
            {actions}
            <button type="button" className="mobile-button-secondary" onClick={onClose}>
              Chiudi
            </button>
          </div>
        </header>
        <iframe className="pdf-viewer-modal-frame" src={url} title={title} />
      </section>
    </div>
  );
}
