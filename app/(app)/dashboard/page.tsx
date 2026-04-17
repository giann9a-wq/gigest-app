import { auth } from "@/auth";
import { ScansSyncButton } from "@/components/dashboard/scans-sync-button";
import { getScheduleEvents, type ScheduleEventRow } from "@/lib/schedule-events";
import { prisma } from "@/lib/prisma";
import {
  DeliveryNoteValidationStatus,
  ScannedDeliveryNoteStatus,
} from "@prisma/client";

function getUtcDateBoundsFromIso(isoDate: string) {
  return {
    start: new Date(`${isoDate}T00:00:00.000Z`),
    end: new Date(`${isoDate}T23:59:59.999Z`),
  };
}

function formatEventDate(value: Date) {
  return value.toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatEventTime(event: Pick<ScheduleEventRow, "isAllDay" | "startTime" | "endTime">) {
  if (event.isAllDay) return "Tutto il giorno";
  if (event.startTime && event.endTime) return `${event.startTime} - ${event.endTime}`;
  if (event.startTime) return `Dalle ${event.startTime}`;
  return "";
}

function getLinkedLabel(event: ScheduleEventRow) {
  if (event.linkedEquipment) {
    return event.linkedEquipment.nameDescription;
  }

  if (event.linkedJobOrder) {
    return `Commessa: ${event.linkedJobOrder.name}`;
  }

  return "";
}

function EventList({ events }: { events: ScheduleEventRow[] }) {
  if (events.length === 0) {
    return <p className="muted">Nessun evento da mostrare.</p>;
  }

  return (
    <div className="dashboard-event-list-scroll">
      <div className="dashboard-event-list">
        {events.map((event) => (
          <article key={event.id} className="dashboard-event-item">
            <div className="dashboard-event-top">
              <strong>{event.title}</strong>
              <span className="dashboard-pill">{event.originLabel}</span>
            </div>
            <div className="dashboard-event-meta">
              <span>{formatEventDate(event.eventDate)}</span>
              <span>{formatEventTime(event)}</span>
              {getLinkedLabel(event) ? <span>{getLinkedLabel(event)}</span> : null}
            </div>
            {event.description ? (
              <p className="dashboard-event-description">{event.description}</p>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayBounds = getUtcDateBoundsFromIso(todayIso);
  const nextThirtyDaysEnd = new Date(todayBounds.end);
  nextThirtyDaysEnd.setUTCDate(nextThirtyDaysEnd.getUTCDate() + 30);
  const oldPendingDeliveryNotesLimit = new Date(todayBounds.start);
  oldPendingDeliveryNotesLimit.setUTCDate(oldPendingDeliveryNotesLimit.getUTCDate() - 45);

  const [scheduleEvents, oldPendingDeliveryNotesCount, newScansCount] = await Promise.all([
    getScheduleEvents({
      from: todayBounds.start,
      to: nextThirtyDaysEnd,
    }),
    prisma.deliveryNoteUsage.count({
      where: {
        validationStatus: DeliveryNoteValidationStatus.PENDING,
        usageDate: {
          lt: oldPendingDeliveryNotesLimit,
        },
      },
    }),
    prisma.scannedDeliveryNote.count({
      where: {
        status: ScannedDeliveryNoteStatus.NEW,
      },
    }),
  ]);

  const todayEvents = scheduleEvents.filter((event) => {
    const eventTime = event.eventDate.getTime();
    return eventTime >= todayBounds.start.getTime() && eventTime <= todayBounds.end.getTime();
  });

  const upcomingEvents = scheduleEvents.filter(
    (event) =>
      event.eventDate.getTime() > todayBounds.end.getTime() &&
      event.eventDate.getTime() <= nextThirtyDaysEnd.getTime()
  );

  return (
    <div className="dashboard-page">
      <section className="dashboard-hero">
        <div>
          <p className="dashboard-kicker">Panoramica Operativa</p>
          <h1 className="dashboard-title">Dashboard</h1>
          <p className="dashboard-subtitle">
            Benvenuto, {session?.user?.name ?? session?.user?.email ?? "utente"}. Da qui puoi
            raggiungere velocemente le aree principali del gestionale.
          </p>
        </div>
        <div className="dashboard-hero-badge">
          <span className="dashboard-hero-badge-label">Workspace</span>
          <strong>GiGEST</strong>
          <ScansSyncButton />
        </div>
      </section>

      {newScansCount > 0 || oldPendingDeliveryNotesCount > 0 ? (
        <section className="dashboard-alert-stack" aria-label="Attivita da lavorare">
          {newScansCount > 0 ? (
            <a className="dashboard-work-alert dashboard-work-alert-scans" href="/documentale?tab=scansioni">
              <span className="dashboard-work-alert-main">
                <span className="dashboard-work-alert-count">{newScansCount}</span>
                <span>
                  <strong>Nuove scansioni da inserire</strong>
                  <span className="dashboard-work-alert-copy">
                    Ci sono bolle scansionate da lavorare nel documentale.
                  </span>
                </span>
              </span>
              <span className="dashboard-work-alert-action">Apri Bolle da inserire</span>
            </a>
          ) : null}

          {oldPendingDeliveryNotesCount > 0 ? (
            <a className="dashboard-work-alert dashboard-work-alert-validation" href="/documentale">
              <span className="dashboard-work-alert-main">
                <span className="dashboard-work-alert-count">{oldPendingDeliveryNotesCount}</span>
                <span>
                  <strong>Presenti Bolle da validare</strong>
                  <span className="dashboard-work-alert-copy">
                    Sono presenti bolle non validate oltre 45 giorni.
                  </span>
                </span>
              </span>
              <span className="dashboard-work-alert-action">Vai al Documentale</span>
            </a>
          ) : null}
        </section>
      ) : null}

      <section className="dashboard-grid">
        <div className="card dashboard-card dashboard-card-fixed">
          <div className="dashboard-card-head">
            <strong>Eventi di oggi</strong>
            <span className="dashboard-pill">Scadenziario</span>
          </div>
          <EventList events={todayEvents} />
        </div>

        <div className="card dashboard-card dashboard-card-fixed">
          <div className="dashboard-card-head">
            <strong>Prossimi eventi</strong>
            <span className="dashboard-pill">Prossimi 30 giorni</span>
          </div>
          <EventList events={upcomingEvents} />
        </div>
      </section>
    </div>
  );
}
