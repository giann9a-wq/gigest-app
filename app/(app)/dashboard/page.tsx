import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeadlineOrigin } from "@prisma/client";

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

function formatEventTime(event: {
  isAllDay: boolean;
  startTime: string | null;
  endTime: string | null;
}) {
  if (event.isAllDay) return "Tutto il giorno";
  if (event.startTime && event.endTime) return `${event.startTime} - ${event.endTime}`;
  if (event.startTime) return `Dalle ${event.startTime}`;
  return "";
}

function EventList({
  events,
}: {
  events: {
    id: string;
    title: string;
    description: string | null;
    eventDate: Date;
    isAllDay: boolean;
    startTime: string | null;
    endTime: string | null;
    origin: DeadlineOrigin;
    maintenance: {
      equipment: {
        nameDescription: string;
      };
    } | null;
  }[];
}) {
  if (events.length === 0) {
    return <p className="muted">Nessun evento da mostrare.</p>;
  }

  return (
    <div className="dashboard-event-list">
      {events.map((event) => (
        <article key={event.id} className="dashboard-event-item">
          <div className="dashboard-event-top">
            <strong>{event.title}</strong>
            <span className="dashboard-pill">
              {event.origin === "MAINTENANCE" ? "Manutenzione" : "Manuale"}
            </span>
          </div>
          <div className="dashboard-event-meta">
            <span>{formatEventDate(event.eventDate)}</span>
            <span>{formatEventTime(event)}</span>
            {event.maintenance?.equipment?.nameDescription ? (
              <span>{event.maintenance.equipment.nameDescription}</span>
            ) : null}
          </div>
          {event.description ? <p className="dashboard-event-description">{event.description}</p> : null}
        </article>
      ))}
    </div>
  );
}

export default async function DashboardPage() {
  const session = await auth();
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayBounds = getUtcDateBoundsFromIso(todayIso);

  const [todayEvents, upcomingEvents] = await Promise.all([
    prisma.deadline.findMany({
      where: {
        eventDate: {
          gte: todayBounds.start,
          lte: todayBounds.end,
        },
      },
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
      include: {
        maintenance: {
          select: {
            equipment: {
              select: {
                nameDescription: true,
              },
            },
          },
        },
      },
    }),
    prisma.deadline.findMany({
      where: {
        eventDate: {
          gt: todayBounds.end,
        },
      },
      orderBy: [{ eventDate: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
      take: 8,
      include: {
        maintenance: {
          select: {
            equipment: {
              select: {
                nameDescription: true,
              },
            },
          },
        },
      },
    }),
  ]);

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
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="card dashboard-card">
          <div className="dashboard-card-head">
            <strong>Eventi di oggi</strong>
            <span className="dashboard-pill">Scadenziario</span>
          </div>
          <EventList events={todayEvents} />
        </div>

        <div className="card dashboard-card">
          <div className="dashboard-card-head">
            <strong>Prossimi eventi</strong>
            <span className="dashboard-pill">Planning</span>
          </div>
          <EventList events={upcomingEvents} />
        </div>
      </section>
    </div>
  );
}
