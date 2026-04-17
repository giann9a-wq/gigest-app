"use client";

type PdfViewerModalProps = {
  title: string;
  url: string;
  subtitle?: string;
  onClose: () => void;
};

export function PdfViewerModal({ title, url, subtitle, onClose }: PdfViewerModalProps) {
  return (
    <div className="pdf-viewer-modal-backdrop" role="dialog" aria-modal="true">
      <section className="pdf-viewer-modal">
        <header className="pdf-viewer-modal-head">
          <div>
            <p className="dashboard-kicker">Documento</p>
            <h2>{title}</h2>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button type="button" className="mobile-button-secondary" onClick={onClose}>
            Chiudi
          </button>
        </header>
        <iframe className="pdf-viewer-modal-frame" src={url} title={title} />
      </section>
    </div>
  );
}
