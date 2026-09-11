"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type JobOrderOption = { id: string; name: string; status: string };
type PhaseOption = { id: string; name: string; jobOrderId: string };
type AuthorOption = { id: string; name: string };
type PhotoItem = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  viewUrl: string;
  downloadUrl: string;
};
type PhotoUploadRow = {
  id: string;
  jobOrder: { id: string; name: string };
  phase: { id: string; name: string };
  author: AuthorOption;
  note: string;
  source: "MANUAL" | "WHATSAPP";
  mediaCount: number;
  createdAt: string;
  canDelete: boolean;
  photos: PhotoItem[];
};
type RepositoryResponse = {
  rows: PhotoUploadRow[];
  options: { jobOrders: JobOrderOption[]; phases: PhaseOption[]; authors: AuthorOption[] };
};
type MockReply = {
  type: "text" | "buttons" | "list";
  body: string;
  options?: Array<{ id: string; title: string }> | { rows?: Array<{ id: string; title: string }> };
};
type MockSession = {
  id: string;
  status: string;
  mediaCount: number;
  jobOrder: { id: string; name: string } | null;
  phase: { id: string; name: string } | null;
  note: string | null;
  expiresAt: string;
} | null;

async function safeJsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Errore server");
  return data;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("it-IT", { dateStyle: "medium", timeStyle: "short" });
}

function formatFileSize(value: number) {
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toLocaleString("it-IT", { maximumFractionDigits: 1 })} MB`;
}

export function PhotoRepositoryPanel() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PhotoUploadRow[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [phases, setPhases] = useState<PhaseOption[]>([]);
  const [authors, setAuthors] = useState<AuthorOption[]>([]);
  const [jobOrderId, setJobOrderId] = useState("");
  const [phaseId, setPhaseId] = useState("");
  const [authorId, setAuthorId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [noteSearch, setNoteSearch] = useState("");
  const [quick, setQuick] = useState<"" | "today" | "7d">("");
  const [view, setView] = useState<"grid" | "timeline">("grid");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadJobOrderId, setUploadJobOrderId] = useState("");
  const [uploadPhaseId, setUploadPhaseId] = useState("");
  const [newPhaseName, setNewPhaseName] = useState("");
  const [uploadNote, setUploadNote] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<{ photo: PhotoItem; batch: PhotoUploadRow } | null>(null);
  const [deletingId, setDeletingId] = useState("");
  const [mockAvailable, setMockAvailable] = useState(false);
  const [showMock, setShowMock] = useState(false);
  const [mockPhone, setMockPhone] = useState("");
  const [mockSession, setMockSession] = useState<MockSession>(null);
  const [mockReplies, setMockReplies] = useState<MockReply[]>([]);
  const [mockText, setMockText] = useState("");
  const [mockPhoto, setMockPhoto] = useState<File | null>(null);
  const [mockRunning, setMockRunning] = useState(false);

  const filteredPhases = useMemo(
    () => phases.filter((phase) => !jobOrderId || phase.jobOrderId === jobOrderId),
    [phases, jobOrderId]
  );
  const uploadPhases = useMemo(
    () => phases.filter((phase) => phase.jobOrderId === uploadJobOrderId),
    [phases, uploadJobOrderId]
  );

  async function loadData(quickOverride = quick) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (jobOrderId) params.set("jobOrderId", jobOrderId);
      if (phaseId) params.set("phaseId", phaseId);
      if (authorId) params.set("authorId", authorId);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (noteSearch.trim()) params.set("note", noteSearch.trim());
      if (quickOverride) params.set("quick", quickOverride);
      const data = (await safeJsonFetch(`/api/documentale/foto?${params.toString()}`)) as RepositoryResponse;
      setRows(data.rows ?? []);
      setJobOrders(data.options?.jobOrders ?? []);
      setPhases(data.options?.phases ?? []);
      setAuthors(data.options?.authors ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento delle fotografie");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData("");
    void fetch("/api/integrations/whatsapp/mock")
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setMockAvailable(true);
        setMockPhone(data.phone ?? "");
        setMockSession(data.session ?? null);
      })
      .catch(() => undefined);
  }, []);

  async function runMock(form: FormData) {
    setMockRunning(true);
    setError("");
    try {
      const data = await safeJsonFetch("/api/integrations/whatsapp/mock", { method: "POST", body: form });
      setMockPhone(data.phone ?? mockPhone);
      setMockSession(data.session ?? null);
      setMockReplies((current) => [...current, ...(data.replies ?? [])]);
      if (!data.session && (data.replies ?? []).some((reply: MockReply) => reply.body.includes("Caricamento completato"))) {
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulazione WhatsApp fallita");
    } finally {
      setMockRunning(false);
    }
  }

  function sendMockInteractive(id: string) {
    const form = new FormData();
    form.set("type", "interactive");
    form.set("interactiveId", id);
    void runMock(form);
  }

  function mockReplyOptions(reply: MockReply) {
    if (Array.isArray(reply.options)) return reply.options;
    return reply.options?.rows ?? [];
  }

  function selectQuick(value: "" | "today" | "7d") {
    setQuick(value);
    setDateFrom("");
    setDateTo("");
    void loadData(value);
  }

  function clearFilters() {
    setJobOrderId("");
    setPhaseId("");
    setAuthorId("");
    setDateFrom("");
    setDateTo("");
    setNoteSearch("");
    setQuick("");
    setTimeout(() => void loadData(""), 0);
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!uploadJobOrderId || !uploadPhaseId || selectedFiles.length === 0) {
      setError("Seleziona commessa, fase e almeno una fotografia.");
      return;
    }
    if (uploadPhaseId === "__new" && !newPhaseName.trim()) {
      setError("Inserisci il nome della nuova fase.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.set("jobOrderId", uploadJobOrderId);
      if (uploadPhaseId === "__new") form.set("phaseName", newPhaseName.trim());
      else form.set("phaseId", uploadPhaseId);
      form.set("note", uploadNote.trim());
      selectedFiles.forEach((file) => form.append("photos", file));
      const data = await safeJsonFetch("/api/documentale/foto", { method: "POST", body: form });
      setMessage(`${data.mediaCount} fotografie archiviate correttamente.`);
      setUploadPhaseId("");
      setNewPhaseName("");
      setUploadNote("");
      setSelectedFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setShowUpload(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caricamento fallito");
    } finally {
      setUploading(false);
    }
  }

  async function deletePhoto(photo: PhotoItem) {
    if (!window.confirm(`Eliminare definitivamente “${photo.filename}”?`)) return;
    setDeletingId(photo.id);
    setError("");
    setMessage("");
    try {
      await safeJsonFetch(`/api/documentale/foto/${photo.id}`, { method: "DELETE" });
      setPreview(null);
      setMessage("Fotografia eliminata e operazione registrata nell’audit.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eliminazione fallita");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <div className="photo-repository">
      <section className="card photo-repository-toolbar">
        <div className="photo-quick-filters" aria-label="Filtri rapidi fotografie">
          <button className={quick === "" ? "active" : ""} type="button" onClick={() => selectQuick("")}>Tutte</button>
          <button className={quick === "today" ? "active" : ""} type="button" onClick={() => selectQuick("today")}>Oggi</button>
          <button className={quick === "7d" ? "active" : ""} type="button" onClick={() => selectQuick("7d")}>Ultimi 7 giorni</button>
        </div>
        <div className="photo-toolbar-actions">
          <div className="photo-view-toggle" aria-label="Modalità visualizzazione">
            <button type="button" className={view === "grid" ? "active" : ""} onClick={() => setView("grid")}>Griglia</button>
            <button type="button" className={view === "timeline" ? "active" : ""} onClick={() => setView("timeline")}>Timeline</button>
          </div>
          <button type="button" className="button" onClick={() => setShowUpload((current) => !current)}>
            {showUpload ? "Chiudi caricamento" : "+ Carica fotografie"}
          </button>
          {mockAvailable ? (
            <button type="button" className="mobile-button-secondary" onClick={() => setShowMock((current) => !current)}>
              {showMock ? "Chiudi simulatore" : "Simula WhatsApp"}
            </button>
          ) : null}
        </div>
      </section>

      {showUpload ? (
        <form className="card photo-upload-form" onSubmit={submitUpload}>
          <div className="dashboard-card-head">
            <div>
              <strong>Nuovo batch fotografico</strong>
              <p className="muted">Utile anche per collaudare il repository prima del collegamento del numero WhatsApp.</p>
            </div>
            <span className="dashboard-pill">Origine: manuale</span>
          </div>
          <div className="photo-upload-fields">
            <label>
              <span>Commessa</span>
              <select value={uploadJobOrderId} onChange={(event) => { setUploadJobOrderId(event.target.value); setUploadPhaseId(""); }} required>
                <option value="">Seleziona commessa</option>
                {jobOrders.filter((jobOrder) => jobOrder.status === "ACTIVE").map((jobOrder) => <option key={jobOrder.id} value={jobOrder.id}>{jobOrder.name}</option>)}
              </select>
            </label>
            <label>
              <span>Fase</span>
              <select value={uploadPhaseId} onChange={(event) => setUploadPhaseId(event.target.value)} required disabled={!uploadJobOrderId}>
                <option value="">Seleziona fase</option>
                {uploadPhases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
                <option value="__new">+ Nuova fase</option>
              </select>
            </label>
            {uploadPhaseId === "__new" ? (
              <label>
                <span>Nome nuova fase</span>
                <input value={newPhaseName} onChange={(event) => setNewPhaseName(event.target.value)} maxLength={100} required />
              </label>
            ) : null}
            <label className="photo-upload-note">
              <span>Nota opzionale</span>
              <input value={uploadNote} onChange={(event) => setUploadNote(event.target.value)} placeholder="Es. Pareti piano primo completate" />
            </label>
            <label className="photo-file-picker">
              <span>Fotografie</span>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                multiple
                onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                required
              />
              <small>{selectedFiles.length ? `${selectedFiles.length} file selezionati` : "Massimo 20 file, 15 MB ciascuno"}</small>
            </label>
          </div>
          <div className="photo-upload-submit">
            <button type="submit" className="button" disabled={uploading}>{uploading ? "Archiviazione..." : "Archivia batch"}</button>
          </div>
        </form>
      ) : null}

      {showMock ? (
        <section className="card whatsapp-mock-panel">
          <div className="dashboard-card-head">
            <div>
              <strong>Simulatore workflow WhatsApp</strong>
              <p className="muted">Invia una foto e usa le risposte interattive esattamente come nella conversazione reale.</p>
            </div>
            <span className="dashboard-pill">{mockSession ? mockSession.status : "NUOVA SESSIONE"}</span>
          </div>
          <div className="whatsapp-mock-layout">
            <div className="whatsapp-mock-controls">
              <span className="whatsapp-mock-phone">Numero test: {mockPhone}</span>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!mockPhoto) return;
                  const form = new FormData();
                  form.set("type", "image");
                  form.set("photo", mockPhoto);
                  void runMock(form);
                }}
              >
                <label>
                  <span>Fotografia simulata</span>
                  <input type="file" accept="image/*" onChange={(event) => setMockPhoto(event.target.files?.[0] ?? null)} />
                </label>
                <button className="button" type="submit" disabled={!mockPhoto || mockRunning}>Invia foto</button>
              </form>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!mockText.trim()) return;
                  const form = new FormData();
                  form.set("type", "text");
                  form.set("text", mockText.trim());
                  setMockText("");
                  void runMock(form);
                }}
              >
                <label>
                  <span>Messaggio testuale</span>
                  <input value={mockText} onChange={(event) => setMockText(event.target.value)} placeholder="Nota, ricerca oppure ANNULLA" />
                </label>
                <button className="mobile-button-secondary" type="submit" disabled={!mockText.trim() || mockRunning}>Invia testo</button>
              </form>
            </div>
            <div className="whatsapp-mock-chat" aria-live="polite">
              {mockReplies.length === 0 ? <p className="muted">La conversazione simulata apparirà qui.</p> : null}
              {mockReplies.map((reply, index) => (
                <article key={`${index}-${reply.body}`} className="whatsapp-mock-message">
                  <p>{reply.body}</p>
                  {mockReplyOptions(reply).length ? (
                    <div>
                      {mockReplyOptions(reply).map((option) => (
                        <button key={option.id} type="button" onClick={() => sendMockInteractive(option.id)} disabled={mockRunning}>
                          {option.title}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="card photo-repository-filters">
        <label>
          <span>Commessa</span>
          <select value={jobOrderId} onChange={(event) => { setJobOrderId(event.target.value); setPhaseId(""); }}>
            <option value="">Tutte</option>
            {jobOrders.map((jobOrder) => <option key={jobOrder.id} value={jobOrder.id}>{jobOrder.name}</option>)}
          </select>
        </label>
        <label>
          <span>Fase</span>
          <select value={phaseId} onChange={(event) => setPhaseId(event.target.value)}>
            <option value="">Tutte</option>
            {filteredPhases.map((phase) => <option key={phase.id} value={phase.id}>{phase.name}</option>)}
          </select>
        </label>
        <label>
          <span>Autore</span>
          <select value={authorId} onChange={(event) => setAuthorId(event.target.value)}>
            <option value="">Tutti</option>
            {authors.map((author) => <option key={author.id} value={author.id}>{author.name}</option>)}
          </select>
        </label>
        <label>
          <span>Da data</span>
          <input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setQuick(""); }} />
        </label>
        <label>
          <span>A data</span>
          <input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setQuick(""); }} />
        </label>
        <label>
          <span>Ricerca nota</span>
          <input value={noteSearch} onChange={(event) => setNoteSearch(event.target.value)} placeholder="Cerca nel testo" />
        </label>
        <div className="documentale-filter-actions">
          <button type="button" className="button" onClick={() => void loadData()} disabled={loading}>Applica</button>
          <button type="button" className="mobile-button-secondary" onClick={clearFilters}>Pulisci</button>
        </div>
      </section>

      {message ? <div className="scad-success">{message}</div> : null}
      {error ? <div className="scad-error">{error}</div> : null}

      <section className={`photo-batches photo-batches-${view}`}>
        {loading ? (
          <div className="card photo-empty-state">Caricamento repository fotografico...</div>
        ) : rows.length === 0 ? (
          <div className="card photo-empty-state">
            <span aria-hidden="true">▧</span>
            <strong>Nessuna fotografia trovata</strong>
            <p>Carica il primo batch oppure modifica i filtri di ricerca.</p>
          </div>
        ) : (
          rows.map((batch) => (
            <article key={batch.id} className="card photo-batch-card">
              <header className="photo-batch-head">
                <div>
                  <span className="photo-batch-date">{formatDateTime(batch.createdAt)}</span>
                  <h3>{batch.jobOrder.name}</h3>
                </div>
                <span className={`photo-source photo-source-${batch.source.toLowerCase()}`}>
                  {batch.source === "WHATSAPP" ? "WhatsApp" : "Manuale"}
                </span>
              </header>
              <div className="photo-batch-meta">
                <span><strong>Fase:</strong> {batch.phase.name}</span>
                <span><strong>Autore:</strong> {batch.author.name}</span>
                <span><strong>Foto:</strong> {batch.mediaCount}</span>
              </div>
              {batch.note ? <p className="photo-batch-note">{batch.note}</p> : null}
              <div className="photo-grid">
                {batch.photos.map((photo) => (
                  <figure key={photo.id} className="photo-tile">
                    <button type="button" onClick={() => setPreview({ photo, batch })} aria-label={`Apri ${photo.filename}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.viewUrl} alt={batch.note || `${batch.jobOrder.name}, ${batch.phase.name}`} loading="lazy" />
                    </button>
                    <figcaption>
                      <span title={photo.filename}>{photo.filename}</span>
                      <small>{formatFileSize(photo.sizeBytes)}</small>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </article>
          ))
        )}
      </section>

      {preview ? (
        <div className="photo-preview-backdrop" role="dialog" aria-modal="true" onClick={() => setPreview(null)}>
          <section className="photo-preview-modal" onClick={(event) => event.stopPropagation()}>
            <header>
              <div>
                <strong>{preview.batch.jobOrder.name} · {preview.batch.phase.name}</strong>
                <p>{preview.photo.filename}</p>
              </div>
              <button type="button" className="icon-action-button" onClick={() => setPreview(null)} aria-label="Chiudi">×</button>
            </header>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.photo.viewUrl} alt={preview.batch.note || preview.photo.filename} />
            <footer>
              <a className="mobile-button-secondary" href={preview.photo.downloadUrl}>Scarica originale</a>
              {preview.batch.canDelete ? (
                <button type="button" className="ui-danger-button photo-preview-delete-button" onClick={() => void deletePhoto(preview.photo)} disabled={deletingId === preview.photo.id}>
                  {deletingId === preview.photo.id ? "Eliminazione..." : "Elimina"}
                </button>
              ) : null}
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}
