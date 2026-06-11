"use client";

import { useEffect, useMemo, useState } from "react";

type ControlsStatus = {
  runDateIso: string;
  checkedDateStartIso: string;
  checkedDateEndIso: string;
  peopleWithMissing: Array<{
    personId: string;
    fullName: string;
    recipients: string[];
    missingDates: string[];
    todayLogStatus: "SENT" | "ERROR" | null;
    todayLogError: string | null;
    todaySentAtIso: string | null;
  }>;
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(`Risposta non valida dal server: ${rawText.slice(0, 120)}`);
  }

  const data = JSON.parse(rawText);

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data as T;
}

function formatItalianDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export function DiaryReminderControls() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ControlsStatus | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadStatus() {
    setLoading(true);
    setError("");

    try {
      const data = await jsonFetch<{ status: ControlsStatus }>("/api/admin/diary-reminder/status", {
        cache: "no-store",
      });
      setStatus(data.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricando controlli");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, []);

  const people = status?.peopleWithMissing ?? [];
  const totals = useMemo(() => {
    const withRecipients = people.filter((person) => person.recipients.length > 0).length;
    const alreadySentToday = people.filter((person) => person.todayLogStatus === "SENT").length;
    return { withRecipients, alreadySentToday };
  }, [people]);

  async function sendNow(personId?: string) {
    setSending(true);
    setError("");
    setMessage("");

    try {
      const result = await jsonFetch<any>("/api/admin/diary-reminder/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(personId ? { personId } : {}),
      });

      if (result.skipped) {
        setMessage(result.reason ? `Invio non eseguito: ${result.reason}` : "Invio non eseguito.");
      } else {
        setMessage(
          `Invio completato. Inviate: ${result.sent}, saltate (gia' inviate oggi): ${result.skippedAlreadySent}, saltate (nessun destinatario): ${result.skippedNoRecipients}, saltate (nessuna anomalia): ${result.skippedNoMissingDays}, errori: ${result.errors}.`
        );
      }

      await loadStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore invio promemoria");
    } finally {
      setSending(false);
    }
  }

  return (
    <details className="admin-control-accordion-item">
      <summary className="admin-control-accordion-summary">
        <div>
          <p className="dashboard-kicker">Diario Cantiere</p>
          <h2 className="mobile-section-title">Giornate incomplete</h2>
          {status ? (
            <p className="mobile-section-subtitle">
              Finestra controllo: {formatItalianDate(status.checkedDateStartIso)} - {formatItalianDate(status.checkedDateEndIso)}. Risorse con almeno un giorno incompleto: {people.length}.
            </p>
          ) : (
            <p className="mobile-section-subtitle">Controllo ultimi 15 giorni lavorativi.</p>
          )}
        </div>
        <span className="admin-control-accordion-count">{people.length} risorse</span>
      </summary>

      <div className="admin-control-accordion-body">
        <div className="admin-diary-controls-actions">
          <button
            type="button"
            className="button"
            onClick={() => void loadStatus()}
            disabled={loading || sending}
          >
            Aggiorna
          </button>
          <button
            type="button"
            className="button"
            onClick={() => void sendNow()}
            disabled={loading || sending || totals.withRecipients === 0}
            title={totals.withRecipients === 0 ? "Nessuna risorsa con destinatari configurati" : undefined}
          >
            {sending ? "Invio..." : "Invia promemoria ora"}
          </button>
        </div>

        {message ? <div className="admin-diary-controls-message">{message}</div> : null}
        {error ? <div className="admin-diary-controls-error">{error}</div> : null}

        {loading ? (
          <div className="muted">Caricamento...</div>
        ) : people.length === 0 ? (
          <div className="muted">Nessuna risorsa con giornate incomplete nella finestra di controllo.</div>
        ) : (
          <div className="admin-diary-accordion">
            {people.map((person) => {
              const hasRecipients = person.recipients.length > 0;
              const alreadySentToday = person.todayLogStatus === "SENT";

              return (
                <details key={person.personId} className="admin-diary-accordion-item">
                  <summary className="admin-diary-accordion-summary">
                    <div className="admin-diary-accordion-title">
                      <strong>{person.fullName}</strong>
                      <span className="muted">
                        {person.missingDates.length} giorni incompleti
                        {hasRecipients ? ` - ${person.recipients.length} destinatari` : " - nessun destinatario"}
                        {alreadySentToday && person.todaySentAtIso
                          ? ` - inviato oggi (${new Date(person.todaySentAtIso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })})`
                          : ""}
                        {person.todayLogStatus === "ERROR" ? " - errore invio oggi" : ""}
                      </span>
                    </div>
                    <a className="admin-diary-link" href={`/risorse/${person.personId}`}>
                      Apri scheda
                    </a>
                  </summary>

                  <div className="admin-diary-accordion-body">
                    <div className="admin-diary-days">
                      {person.missingDates.map((iso) => (
                        <span key={iso} className="admin-diary-day-chip">
                          {formatItalianDate(iso)}
                        </span>
                      ))}
                    </div>

                    {person.todayLogStatus === "ERROR" && person.todayLogError ? (
                      <div className="admin-diary-controls-error" style={{ marginTop: 10 }}>
                        Errore invio oggi: {person.todayLogError}
                      </div>
                    ) : null}

                    <div className="admin-diary-row-actions">
                      <button
                        type="button"
                        className="button"
                        onClick={() => void sendNow(person.personId)}
                        disabled={sending || !hasRecipients || alreadySentToday}
                        title={
                          !hasRecipients
                            ? "Nessun destinatario configurato"
                            : alreadySentToday
                              ? "Gia' inviato oggi"
                              : undefined
                        }
                      >
                        Invia a questa risorsa
                      </button>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
