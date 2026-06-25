"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type DeadlineRow = {
  id: string;
  title: string;
  description: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  isAllDay: boolean;
  recurrenceSeriesId: string | null;
  recurrenceLabel: string;
  origin: "MANUAL" | "MAINTENANCE" | "TRAINING";
  originLabel: string;
  lastSource: "GIGEST" | "GOOGLE_CALENDAR";
  maintenanceId: string | null;
  trainingId: string | null;
  canEdit: boolean;
  canDelete: boolean;
  eventKind: "DEADLINE" | "JOB_ORDER_END" | "TRAINING_DATE";
  linkedEquipment: {
    id: string;
    nameDescription: string;
  } | null;
  linkedPerson: {
    id: string;
    fullName: string;
  } | null;
  linkedJobOrder: {
    id: string;
    name: string;
    type: string;
  } | null;
};

type DeadlineFormState = {
  id: string | null;
  title: string;
  description: string;
  eventDate: string;
  isAllDay: boolean;
  startTime: string;
  endTime: string;
  recurrenceEnabled: boolean;
  recurrenceIntervalWeeks: string;
  recurrenceUntil: string;
};

type GoogleCalendarStatus = {
  connected: boolean;
  canManage: boolean;
  canConnect: boolean;
  connectedCount?: number;
  activeGoogleAccountCount?: number;
  missingAccountCount?: number;
  integration: {
    calendarName: string;
    connectedEmail: string | null;
    externalCalendarId: string;
    lastSyncedAt: string | null;
    syncStatus: string;
    syncError: string | null;
    updatedAt: string;
  } | null;
  integrations: Array<{
    calendarName: string;
    connectedEmail: string | null;
    externalCalendarId: string;
    lastSyncedAt: string | null;
    syncStatus: string;
    syncError: string | null;
    updatedAt: string;
  }>;
};

type DeadlineTableSortKey =
  | "title"
  | "description"
  | "eventDate"
  | "time"
  | "origin"
  | "linkedEquipment";

type DeadlineTableFilters = {
  title: string;
  description: string;
  eventDate: string;
  origin: "" | "MANUAL" | "MAINTENANCE" | "TRAINING";
  lastSource: "" | "GIGEST" | "GOOGLE_CALENDAR";
  linkedEquipment: string;
};

const WEEK_DAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

function toIsoDate(date: Date) {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString()
    .slice(0, 10);
}

function formatDisplayDate(value: string) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatMonthLabel(date: Date) {
  return date.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
}

function formatTimeRange(row: DeadlineRow) {
  if (row.isAllDay) return "Tutto il giorno";
  if (row.startTime && row.endTime) return `${row.startTime} - ${row.endTime}`;
  if (row.startTime) return `Dalle ${row.startTime}`;
  return "";
}

function formatEventOriginMeta(row: DeadlineRow) {
  const timeLabel = formatTimeRange(row);
  return timeLabel ? `${timeLabel} · ${row.originLabel}` : row.originLabel;
}

function getLinkedLabel(row: DeadlineRow) {
  if (row.linkedEquipment) {
    return `Mezzo: ${row.linkedEquipment.nameDescription}`;
  }

  if (row.linkedPerson) {
    return `Risorsa: ${row.linkedPerson.fullName}`;
  }

  if (row.linkedJobOrder) {
    return `Commessa: ${row.linkedJobOrder.name}`;
  }

  return "";
}

function getReadonlyBadgeLabel(row: DeadlineRow) {
  if (row.eventKind === "JOB_ORDER_END") {
    return "Fine commessa";
  }

  if (row.eventKind === "TRAINING_DATE") {
    return "Data corso";
  }

  return row.origin === "TRAINING" ? "Da formazione" : "Da manutenzione";
}

function compareDeadlineRows(a: DeadlineRow, b: DeadlineRow) {
  if (a.eventDate !== b.eventDate) {
    return a.eventDate.localeCompare(b.eventDate);
  }

  if (a.isAllDay !== b.isAllDay) {
    return a.isAllDay ? -1 : 1;
  }

  if (a.startTime !== b.startTime) {
    return a.startTime.localeCompare(b.startTime);
  }

  return a.title.localeCompare(b.title);
}

function getCalendarDays(viewDate: Date, rows: DeadlineRow[]) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const jsDay = firstDayOfMonth.getDay();
  const mondayOffset = jsDay === 0 ? 6 : jsDay - 1;
  const startDate = new Date(year, month, 1 - mondayOffset);
  const todayIso = toIsoDate(new Date());

  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);

    const iso = toIsoDate(current);

    return {
      iso,
      dayNumber: current.getDate(),
      inCurrentMonth: current.getMonth() === month,
      isToday: iso === todayIso,
      rows: rows.filter((row) => row.eventDate === iso).sort(compareDeadlineRows),
    };
  });
}

function getEmptyForm(date: string): DeadlineFormState {
  return {
    id: null,
    title: "",
    description: "",
    eventDate: date,
    isAllDay: true,
    startTime: "",
    endTime: "",
    recurrenceEnabled: false,
    recurrenceIntervalWeeks: "1",
    recurrenceUntil: date,
  };
}

function getEmptyDeadlineTableFilters(): DeadlineTableFilters {
  return {
    title: "",
    description: "",
    eventDate: "",
    origin: "",
    lastSource: "",
    linkedEquipment: "",
  };
}

export default function ScadenziarioPage() {
  const todayIso = toIsoDate(new Date());
  const autoSyncStartedRef = useRef(false);

  const [rows, setRows] = useState<DeadlineRow[]>([]);
  const [calendarStatus, setCalendarStatus] = useState<GoogleCalendarStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingCalendar, setSyncingCalendar] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [tableFilters, setTableFilters] = useState<DeadlineTableFilters>(
    getEmptyDeadlineTableFilters()
  );
  const [tableSortKey, setTableSortKey] = useState<DeadlineTableSortKey>("eventDate");
  const [tableSortDirection, setTableSortDirection] = useState<"asc" | "desc">("asc");
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [form, setForm] = useState<DeadlineFormState>(() => getEmptyForm(todayIso));

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/scadenziario", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore caricamento scadenze");
      }

      const nextRows = Array.isArray(data.rows) ? (data.rows as DeadlineRow[]) : [];
      setRows(nextRows.sort(compareDeadlineRows));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  }

  async function loadCalendarStatus() {
    setCalendarLoading(true);

    try {
      const response = await fetch("/api/google-calendar", { cache: "no-store" });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore caricamento stato Google Calendar");
      }

      const status = data as GoogleCalendarStatus;
      setCalendarStatus(status);
      return status;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
      return null;
    } finally {
      setCalendarLoading(false);
    }
  }

  useEffect(() => {
    async function initializePage() {
      const [, status] = await Promise.all([loadRows(), loadCalendarStatus()]);
      const currentCalendar = status?.integration ?? null;
      const currentCalendarHasError =
        currentCalendar?.syncStatus === "ERROR" || Boolean(currentCalendar?.syncError);

      if (
        !autoSyncStartedRef.current &&
        status?.connected &&
        status.canManage &&
        !currentCalendarHasError
      ) {
        autoSyncStartedRef.current = true;
        await handleSyncGoogleCalendar({ silent: true });
      }
    }

    void initializePage();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const calendarParam = params.get("calendar");
    const calendarMessage = params.get("calendarMessage");

    if (calendarParam === "connected") {
      setSuccessMessage("Calendario Google GiGEST collegato e sincronizzato correttamente");
      loadCalendarStatus();
      params.delete("calendar");
      params.delete("calendarMessage");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }

    if (calendarParam === "error") {
      setError(calendarMessage || "Connessione Google Calendar non riuscita");
    }

    if (calendarParam === "forbidden") {
      setError("Solo un amministratore può collegare il calendario condiviso");
    }

    if (calendarParam === "invalid-state") {
      setError("Sessione Google Calendar non valida, riprova");
    }

    if (calendarParam) {
      params.delete("calendar");
      params.delete("calendarMessage");
      const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, []);

  function resetForm(date = selectedDate) {
    setForm(getEmptyForm(date));
  }

  function openNewForm(date = selectedDate) {
    resetForm(date);
    setIsFormOpen(true);
  }

  function handleSelectDay(iso: string) {
    setSelectedDate(iso);
    setSuccessMessage("");

    setForm((current) =>
      current.id
        ? current
        : {
            ...current,
            eventDate: iso,
          }
    );
  }

  function handleEdit(row: DeadlineRow) {
    if (!row.canEdit) {
      setError("Le scadenze derivate si modificano dalla scheda origine");
      return;
    }

    setError("");
    setSuccessMessage("");
    setSelectedDate(row.eventDate);

    const [year, month] = row.eventDate.split("-");
    if (year && month) {
      setViewDate(new Date(Number(year), Number(month) - 1, 1));
    }

    setForm({
      id: row.id,
      title: row.title,
      description: row.description,
      eventDate: row.eventDate,
      isAllDay: row.isAllDay,
      startTime: row.startTime,
      endTime: row.endTime,
      recurrenceEnabled: false,
      recurrenceIntervalWeeks: "1",
      recurrenceUntil: row.eventDate,
    });
    setIsFormOpen(true);
  }

  async function handleDelete(row: DeadlineRow) {
    if (!row.canDelete) {
      setError("Le scadenze derivate si eliminano dalla scheda origine");
      return;
    }

    setError("");
    setSuccessMessage("");

    const deleteWholeSeries =
      row.recurrenceSeriesId && window.confirm(`"${row.title}" fa parte di una ricorrenza. Vuoi eliminare tutta la serie?`);
    const confirmed =
      deleteWholeSeries ||
      window.confirm(`Vuoi eliminare "${row.title}"${row.recurrenceSeriesId ? " solo per questa data" : ""}?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/scadenziario/${row.id}${deleteWholeSeries ? "?scope=series" : ""}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore eliminazione");
      }

      if (form.id === row.id) {
        resetForm(selectedDate);
        setIsFormOpen(false);
      }

      setSuccessMessage(deleteWholeSeries ? `Serie eliminata (${data.deletedCount ?? 0} eventi)` : "Scadenza eliminata");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    }
  }

  async function handleSubmit() {
    setError("");
    setSuccessMessage("");

    if (!form.title.trim()) {
      setError("Inserisci il titolo");
      return;
    }

    if (!form.eventDate) {
      setError("Inserisci la data evento");
      return;
    }

    if (!form.isAllDay && !form.startTime) {
      setError("Inserisci almeno l'ora di inizio");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(
        form.id ? `/api/scadenziario/${form.id}` : "/api/scadenziario",
        {
          method: form.id ? "PATCH" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            eventDate: form.eventDate,
            isAllDay: form.isAllDay,
            startTime: form.isAllDay ? "" : form.startTime,
            endTime: form.isAllDay ? "" : form.endTime,
            recurrenceEnabled: !form.id && form.recurrenceEnabled,
            recurrenceIntervalWeeks: form.recurrenceIntervalWeeks,
            recurrenceUntil: form.recurrenceUntil,
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore salvataggio scadenza");
      }

      setSelectedDate(form.eventDate);
      setSuccessMessage(
        form.id
          ? "Scadenza aggiornata"
          : data.createdCount && data.createdCount > 1
            ? `Ricorrenza creata: ${data.createdCount} eventi`
            : "Scadenza creata"
      );
      resetForm(form.eventDate);
      setIsFormOpen(false);
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncGoogleCalendar(options?: { silent?: boolean }) {
    setError("");
    if (!options?.silent) {
      setSuccessMessage("");
    }

    try {
      setSyncingCalendar(true);

      const response = await fetch("/api/google-calendar", {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore sincronizzazione Google Calendar");
      }

      await loadRows();
      await loadCalendarStatus();
      if (!options?.silent) {
        setSuccessMessage(
          `Sincronizzazione completata: ${data.syncedCount} eventi riallineati, ${data.importedCount} importati da Google, ${data.deletedCount} rimossi`
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setSyncingCalendar(false);
    }
  }

  function goPrevMonth() {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function goToToday() {
    const now = new Date();
    const today = toIsoDate(now);

    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(today);
    setForm((current) =>
      current.id
        ? current
        : {
            ...current,
            eventDate: today,
          }
    );
  }

  function goNextMonth() {
    setViewDate((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  function setTableFilterValue<K extends keyof DeadlineTableFilters>(
    key: K,
    value: DeadlineTableFilters[K]
  ) {
    setTableFilters((current) => ({ ...current, [key]: value }));
  }

  function toggleTableSort(nextKey: DeadlineTableSortKey) {
    if (tableSortKey === nextKey) {
      setTableSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setTableSortKey(nextKey);
    setTableSortDirection("asc");
  }

  const calendarDays = useMemo(() => getCalendarDays(viewDate, rows), [viewDate, rows]);
  const selectedDayRows = useMemo(
    () => rows.filter((row) => row.eventDate === selectedDate).sort(compareDeadlineRows),
    [rows, selectedDate]
  );
  const todayRows = useMemo(
    () => rows.filter((row) => row.eventDate === todayIso).sort(compareDeadlineRows),
    [rows, todayIso]
  );
  const upcomingRows = useMemo(
    () => rows.filter((row) => row.eventDate >= todayIso).sort(compareDeadlineRows),
    [rows, todayIso]
  );
  const filteredTableRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      const combinedOrigin = `${row.origin} ${row.lastSource}`.toLowerCase();

      return (
        row.title.toLowerCase().includes(tableFilters.title.trim().toLowerCase()) &&
        row.description.toLowerCase().includes(tableFilters.description.trim().toLowerCase()) &&
        row.eventDate.includes(tableFilters.eventDate.trim()) &&
        (tableFilters.origin ? row.origin === tableFilters.origin : true) &&
        (tableFilters.lastSource ? row.lastSource === tableFilters.lastSource : true) &&
        getLinkedLabel(row).toLowerCase().includes(tableFilters.linkedEquipment.trim().toLowerCase()) &&
        combinedOrigin.includes(
          `${tableFilters.origin} ${tableFilters.lastSource}`.trim().toLowerCase()
        )
      );
    });

    return [...filtered].sort((a, b) => {
      let result = 0;

      switch (tableSortKey) {
        case "title":
          result = a.title.localeCompare(b.title, "it", { sensitivity: "base" });
          break;
        case "description":
          result = a.description.localeCompare(b.description, "it", { sensitivity: "base" });
          break;
        case "eventDate":
          result = a.eventDate.localeCompare(b.eventDate);
          break;
        case "time":
          result = formatTimeRange(a).localeCompare(formatTimeRange(b), "it", {
            sensitivity: "base",
          });
          break;
        case "origin":
          result = `${a.originLabel} ${a.lastSource}`.localeCompare(
            `${b.originLabel} ${b.lastSource}`,
            "it",
            {
              sensitivity: "base",
            }
          );
          break;
        case "linkedEquipment":
          result = getLinkedLabel(a).localeCompare(getLinkedLabel(b), "it", {
            sensitivity: "base",
          });
          break;
      }

      return tableSortDirection === "asc" ? result : -result;
    });
  }, [rows, tableFilters, tableSortDirection, tableSortKey]);

  function renderTableSortLabel(label: string, key: DeadlineTableSortKey) {
    if (tableSortKey !== key) return label;
    return `${label} ${tableSortDirection === "asc" ? "↑" : "↓"}`;
  }

  const currentCalendar = calendarStatus?.integration ?? null;
  const currentCalendarHasError =
    currentCalendar?.syncStatus === "ERROR" || Boolean(currentCalendar?.syncError);
  const showConnectCalendarButton =
    calendarStatus?.canConnect && (!calendarStatus.connected || currentCalendarHasError);
  const showSyncCalendarButton =
    calendarStatus?.connected && !currentCalendarHasError && calendarStatus.canManage;

  return (
    <div className="scad-page">
      <div className="scad-page-head">
        <h1 className="scad-title">Scadenziario</h1>
        <div className="scad-head-actions">
          <button
            type="button"
            className="scad-outline-btn"
            onClick={() => openNewForm(selectedDate)}
          >
            Nuova scadenza manuale
          </button>

          {calendarLoading ? (
            <span className="scad-muted">Verifica Google Calendar...</span>
          ) : calendarStatus?.connected ? (
            <>
              <div className="scad-google-status">
                <strong>{currentCalendar?.calendarName || "Google Calendar"}</strong>
                <span className="scad-muted">
                  {currentCalendar?.connectedEmail
                    ? `Collegato come ${currentCalendar.connectedEmail}`
                    : "Collegato"}
                </span>
                {currentCalendarHasError ? (
                  <span className="scad-muted">
                    Da ricollegare: {currentCalendar?.syncError || "permesso Google non valido"}
                  </span>
                ) : null}
                <span className="scad-muted">
                  Ultima sync:{" "}
                  {currentCalendar?.lastSyncedAt
                    ? new Date(currentCalendar.lastSyncedAt).toLocaleString("it-IT")
                    : "mai"}
                </span>
              </div>

              {showSyncCalendarButton ? (
                <button
                  type="button"
                  className="scad-outline-btn"
                  onClick={() => handleSyncGoogleCalendar()}
                  disabled={syncingCalendar}
                >
                  {syncingCalendar ? "Sincronizzazione..." : "Sincronizza Google"}
                </button>
              ) : null}
              {showConnectCalendarButton ? (
                <a href="/api/google-calendar/connect" className="scad-outline-btn scad-link-btn">
                  Ricollega il mio Google Calendar
                </a>
              ) : null}
            </>
          ) : calendarStatus?.canConnect ? (
            <a href="/api/google-calendar/connect" className="scad-outline-btn scad-link-btn">
              Collega il mio Google Calendar
            </a>
          ) : (
            <span className="scad-muted">
              Il calendario condiviso non è ancora collegato
            </span>
          )}
        </div>
      </div>

      <div className="scad-main-grid">
        <section className="scad-calendar-panel">
          <div className="scad-calendar-toolbar">
            <div className="scad-calendar-nav">
              <button type="button" onClick={goPrevMonth} className="scad-small-btn">
                ←
              </button>
              <button type="button" onClick={goToToday} className="scad-small-btn">
                Oggi
              </button>
            </div>
            <div className="scad-calendar-month">{formatMonthLabel(viewDate)}</div>
            <button type="button" onClick={goNextMonth} className="scad-small-btn">
              →
            </button>
          </div>

          <div className="scad-calendar-grid">
            {WEEK_DAYS.map((day) => (
              <div key={day} className="scad-calendar-head">
                {day}
              </div>
            ))}

            {calendarDays.map((cell) => (
              <button
                key={cell.iso}
                type="button"
                onClick={() => handleSelectDay(cell.iso)}
                className={[
                  "scad-calendar-day",
                  cell.inCurrentMonth
                    ? "scad-calendar-day-current"
                    : "scad-calendar-day-other",
                  cell.isToday ? "scad-calendar-day-today" : "",
                  selectedDate === cell.iso ? "scad-calendar-day-selected" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <div className="scad-calendar-day-number">{cell.dayNumber}</div>

                <div className="scad-calendar-events">
                  {cell.rows.slice(0, 3).map((row) => (
                    <div
                      key={row.id}
                      className={[
                        "scad-calendar-event",
                        row.eventKind === "JOB_ORDER_END"
                          ? "scad-calendar-event-joborder"
                          : row.origin === "MAINTENANCE"
                          ? "scad-calendar-event-maintenance"
                          : row.origin === "TRAINING"
                          ? "scad-calendar-event-training"
                          : "scad-calendar-event-manual",
                      ].join(" ")}
                      title={row.title}
                    >
                      {row.title}
                    </div>
                  ))}

                  {cell.rows.length > 3 ? (
                    <div className="scad-calendar-more">+{cell.rows.length - 3} altre</div>
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="scad-side-panel">
          <div className="scad-side-section scad-side-section-day">
            <div className="scad-side-header">
              <h2 className="scad-section-title">Eventi del {formatDisplayDate(selectedDate)}</h2>
            </div>

            {loading ? (
              <div className="scad-muted">Caricamento...</div>
            ) : selectedDayRows.length === 0 ? (
              <div className="scad-muted">Nessun evento per il giorno selezionato</div>
            ) : (
              <div className="scad-card-list">
                {selectedDayRows.map((row) => (
                  <div key={row.id} className="scad-card">
                    <div className="scad-card-top">
                      <div className="scad-card-body">
                        <div className="scad-card-title">{row.title}</div>
                        <div className="scad-card-meta">{formatEventOriginMeta(row)}</div>
                        {row.description ? (
                          <div className="scad-card-description">{row.description}</div>
                        ) : null}
                        {row.recurrenceLabel ? (
                          <div className="scad-card-meta">{row.recurrenceLabel}</div>
                        ) : null}
                        {getLinkedLabel(row) ? (
                          <div className="scad-card-meta">{getLinkedLabel(row)}</div>
                        ) : null}
                      </div>

                      <div className="scad-card-actions">
                        {row.canEdit ? (
                          <button
                            type="button"
                            className="scad-small-btn"
                            onClick={() => handleEdit(row)}
                          >
                            Modifica
                          </button>
                        ) : (
                          <span className="scad-tag">{getReadonlyBadgeLabel(row)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {isFormOpen ? (
        <div className="scad-modal-backdrop" role="presentation" onMouseDown={() => setIsFormOpen(false)}>
          <section className="scad-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="scad-modal-head">
              <div>
                <h2 className="scad-section-title">
                  {form.id ? "Modifica scadenza manuale" : "Aggiungi scadenza manuale"}
                </h2>
                <div className="scad-muted">{formatDisplayDate(form.eventDate || selectedDate)}</div>
              </div>
              <button type="button" className="scad-small-btn" onClick={() => setIsFormOpen(false)}>
                Chiudi
              </button>
            </div>

            <div className="scad-modal-body">
              <label className="scad-field scad-field-wide">
                <span>Titolo</span>
                <input
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  className="scad-input scad-box-input"
                  placeholder="Inserisci titolo evento"
                />
              </label>

              <label className="scad-field scad-field-wide">
                <span>Descrizione</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                  className="scad-input scad-box-input scad-textarea"
                  placeholder="Dettagli opzionali"
                />
              </label>

              <label className="scad-field">
                <span>Data</span>
                <input
                  type="date"
                  value={form.eventDate}
                  onChange={(e) => setForm((current) => ({ ...current, eventDate: e.target.value }))}
                  className="scad-input scad-box-input"
                />
              </label>

              <label className="scad-field scad-field-check">
                <span>Durata</span>
                <span className="scad-checkbox-row">
                  <input
                    type="checkbox"
                    checked={form.isAllDay}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        isAllDay: e.target.checked,
                        startTime: e.target.checked ? "" : current.startTime,
                        endTime: e.target.checked ? "" : current.endTime,
                      }))
                    }
                  />
                  <span>Tutto il giorno</span>
                </span>
              </label>

              <label className="scad-field">
                <span>Ora inizio</span>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm((current) => ({ ...current, startTime: e.target.value }))}
                  className="scad-input scad-box-input"
                  disabled={form.isAllDay}
                />
              </label>

              <label className="scad-field">
                <span>Ora fine</span>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm((current) => ({ ...current, endTime: e.target.value }))}
                  className="scad-input scad-box-input"
                  disabled={form.isAllDay}
                />
              </label>

              {!form.id ? (
                <div className="scad-recurrence-box scad-field-wide">
                  <label className="scad-checkbox-row">
                    <input
                      type="checkbox"
                      checked={form.recurrenceEnabled}
                      onChange={(e) =>
                        setForm((current) => ({
                          ...current,
                          recurrenceEnabled: e.target.checked,
                          recurrenceUntil: current.recurrenceUntil || current.eventDate,
                        }))
                      }
                    />
                    <span>Ripeti automaticamente</span>
                  </label>

                  {form.recurrenceEnabled ? (
                    <div className="scad-recurrence-grid">
                      <label className="scad-field">
                        <span>Ogni</span>
                        <input
                          type="number"
                          min="1"
                          max="52"
                          value={form.recurrenceIntervalWeeks}
                          onChange={(e) =>
                            setForm((current) => ({
                              ...current,
                              recurrenceIntervalWeeks: e.target.value,
                            }))
                          }
                          className="scad-input scad-box-input"
                        />
                      </label>
                      <div className="scad-field scad-field-static">
                        <span>Periodo</span>
                        <strong>settimane</strong>
                      </div>
                      <label className="scad-field">
                        <span>Fino al</span>
                        <input
                          type="date"
                          value={form.recurrenceUntil}
                          min={form.eventDate}
                          onChange={(e) =>
                            setForm((current) => ({
                              ...current,
                              recurrenceUntil: e.target.value,
                            }))
                          }
                          className="scad-input scad-box-input"
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="scad-modal-actions">
              {form.id ? (
                <button
                  type="button"
                  className="scad-danger-btn"
                  onClick={() => {
                    const row = rows.find((item) => item.id === form.id);
                    if (row) {
                      void handleDelete(row);
                    }
                  }}
                >
                  Elimina
                </button>
              ) : (
                <span className="scad-muted">Solo le scadenze manuali sono modificabili</span>
              )}

              <div className="scad-modal-action-group">
                <button type="button" className="scad-small-btn" onClick={() => setIsFormOpen(false)}>
                  Annulla
                </button>
                <button type="button" onClick={handleSubmit} disabled={saving} className="scad-outline-btn">
                  {saving ? "Salvataggio..." : form.id ? "Aggiorna" : "Salva"}
                </button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {error ? <div className="scad-error">{error}</div> : null}
      {successMessage ? <div className="scad-success">{successMessage}</div> : null}

      <div className="scad-bottom-grid">
        <section className="scad-info-panel">
          <h3 className="scad-panel-title">Eventi di oggi</h3>

          {loading ? (
            <div className="scad-muted">Caricamento...</div>
          ) : todayRows.length === 0 ? (
            <div className="scad-muted">Nessuna scadenza prevista per oggi</div>
          ) : (
            <div className="scad-card-list">
              {todayRows.map((row) => (
                <div key={row.id} className="scad-card">
                  <div className="scad-card-title">{row.title}</div>
                  <div className="scad-card-meta">{formatEventOriginMeta(row)}</div>
                  {row.description ? (
                    <div className="scad-card-description">{row.description}</div>
                  ) : null}
                  {row.recurrenceLabel ? (
                    <div className="scad-card-meta">{row.recurrenceLabel}</div>
                  ) : null}
                  {getLinkedLabel(row) ? (
                    <div className="scad-card-meta">{getLinkedLabel(row)}</div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="scad-info-panel">
          <h3 className="scad-panel-title">Prossimi eventi</h3>

          {loading ? (
            <div className="scad-muted">Caricamento...</div>
          ) : upcomingRows.length === 0 ? (
            <div className="scad-muted">Nessuna scadenza presente</div>
          ) : (
            <div className="scad-card-list">
              {upcomingRows.slice(0, 10).map((row) => (
                <div key={row.id} className="scad-card">
                  <div className="scad-card-top">
                    <div className="scad-card-body">
                      <div className="scad-card-title">{row.title}</div>
                      <div className="scad-card-meta">
                        {formatDisplayDate(row.eventDate)} · {formatTimeRange(row)}
                      </div>
                      <div className="scad-card-meta">{row.originLabel} · {row.lastSource}</div>
                      {row.recurrenceLabel ? (
                        <div className="scad-card-meta">{row.recurrenceLabel}</div>
                      ) : null}
                      {getLinkedLabel(row) ? (
                        <div className="scad-card-meta">{getLinkedLabel(row)}</div>
                      ) : null}
                    </div>

                    {row.canEdit ? (
                      <button
                        type="button"
                        className="scad-small-btn"
                        onClick={() => handleEdit(row)}
                      >
                        Modifica
                      </button>
                    ) : (
                      <span className="scad-tag">{getReadonlyBadgeLabel(row)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="scad-table-panel">
        <h3 className="scad-panel-title">Elenco completo scadenze</h3>
        <div className="scad-table-tools">
          <div className="scad-muted">
            Righe visibili: <strong>{filteredTableRows.length}</strong> su {rows.length}
          </div>
          <button
            type="button"
            className="scad-small-btn"
            onClick={() => setTableFilters(getEmptyDeadlineTableFilters())}
          >
            Azzera filtri
          </button>
        </div>

        {loading ? (
          <div className="scad-muted">Caricamento...</div>
        ) : rows.length === 0 ? (
          <div className="scad-muted">Nessuna scadenza presente</div>
        ) : (
          <div className="scad-table-wrap">
            <table className="scad-table">
              <thead>
                <tr>
                  <th>
                    <button type="button" className="scad-table-sort-btn" onClick={() => toggleTableSort("title")}>
                      {renderTableSortLabel("Titolo", "title")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scad-table-sort-btn" onClick={() => toggleTableSort("description")}>
                      {renderTableSortLabel("Descrizione", "description")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scad-table-sort-btn" onClick={() => toggleTableSort("eventDate")}>
                      {renderTableSortLabel("Data", "eventDate")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scad-table-sort-btn" onClick={() => toggleTableSort("time")}>
                      {renderTableSortLabel("Orario", "time")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scad-table-sort-btn" onClick={() => toggleTableSort("origin")}>
                      {renderTableSortLabel("Origine", "origin")}
                    </button>
                  </th>
                  <th>
                    <button type="button" className="scad-table-sort-btn" onClick={() => toggleTableSort("linkedEquipment")}>
                      {renderTableSortLabel("Collegamento", "linkedEquipment")}
                    </button>
                  </th>
                  <th>Azioni</th>
                </tr>
                <tr>
                  <th>
                    <input
                      value={tableFilters.title}
                      onChange={(e) => setTableFilterValue("title", e.target.value)}
                      className="scad-table-filter-input"
                      placeholder="Filtra titolo"
                    />
                  </th>
                  <th>
                    <input
                      value={tableFilters.description}
                      onChange={(e) => setTableFilterValue("description", e.target.value)}
                      className="scad-table-filter-input"
                      placeholder="Filtra descrizione"
                    />
                  </th>
                  <th>
                    <input
                      value={tableFilters.eventDate}
                      onChange={(e) => setTableFilterValue("eventDate", e.target.value)}
                      className="scad-table-filter-input"
                      placeholder="AAAA-MM-GG"
                    />
                  </th>
                  <th></th>
                  <th>
                    <div className="scad-table-filter-stack">
                      <select
                        value={tableFilters.origin}
                        onChange={(e) =>
                          setTableFilterValue(
                            "origin",
                            e.target.value as "" | "MANUAL" | "MAINTENANCE" | "TRAINING"
                          )
                        }
                        className="scad-table-filter-input"
                      >
                        <option value="">Tutte le origini</option>
                        <option value="MANUAL">MANUAL</option>
                        <option value="MAINTENANCE">MAINTENANCE</option>
                        <option value="TRAINING">TRAINING</option>
                      </select>
                      <select
                        value={tableFilters.lastSource}
                        onChange={(e) =>
                          setTableFilterValue(
                            "lastSource",
                            e.target.value as "" | "GIGEST" | "GOOGLE_CALENDAR"
                          )
                        }
                        className="scad-table-filter-input"
                      >
                        <option value="">Tutte le fonti</option>
                        <option value="GIGEST">GIGEST</option>
                        <option value="GOOGLE_CALENDAR">GOOGLE_CALENDAR</option>
                      </select>
                    </div>
                  </th>
                  <th>
                    <input
                      value={tableFilters.linkedEquipment}
                      onChange={(e) => setTableFilterValue("linkedEquipment", e.target.value)}
                      className="scad-table-filter-input"
                      placeholder="Filtra collegamento"
                    />
                  </th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredTableRows.map((row, index) => (
                  <tr key={row.id} className={index % 2 === 0 ? "row-dark" : "row-light"}>
                    <td>{row.title}</td>
                    <td>{row.description || "-"}</td>
                    <td>{formatDisplayDate(row.eventDate)}</td>
                    <td>{formatTimeRange(row) || "-"}</td>
                    <td>
                      {row.originLabel} · {row.lastSource}
                      {row.recurrenceLabel ? <div className="scad-card-meta">{row.recurrenceLabel}</div> : null}
                    </td>
                    <td>{getLinkedLabel(row) || "-"}</td>
                    <td>
                      {row.canEdit ? (
                        <div className="scad-table-actions">
                          <button
                            type="button"
                            onClick={() => handleEdit(row)}
                            className="scad-small-btn"
                          >
                            Modifica
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(row)}
                            className="scad-danger-btn"
                          >
                            Elimina
                          </button>
                        </div>
                      ) : (
                        <span className="scad-tag">{getReadonlyBadgeLabel(row)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
