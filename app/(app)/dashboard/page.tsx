import { auth } from "@/auth";
import { ScansSyncButton } from "@/components/dashboard/scans-sync-button";
import { MaintenanceRollButton } from "@/components/dashboard/maintenance-roll-button";
import { TrainingRollButton } from "@/components/dashboard/training-roll-button";
import { getScheduleEvents, type ScheduleEventRow } from "@/lib/schedule-events";
import { prisma } from "@/lib/prisma";
import { getActiveAppUser } from "@/lib/app-user";
import { getAutoDiaryProposalStatus, shouldShowAutoDiaryAlert } from "@/lib/auto-diary-proposals";
import { getLoadingVerificationStatus, shouldShowLoadingVerificationAlert } from "@/lib/loading-verification";
import {
  DeliveryNoteValidationStatus,
  ScannedDeliveryNoteStatus,
  UserRole,
} from "@prisma/client";

type WeatherDay = {
  date: string;
  label: string;
  code: number;
  condition: string;
  icon: string;
  min: number;
  max: number;
  rainMm: number;
  windKmh: number;
};

type WeatherForecast = {
  current: {
    temperature: number;
    apparentTemperature: number;
    windKmh: number;
    code: number;
    condition: string;
    icon: string;
  };
  days: WeatherDay[];
  updatedAt: string;
};

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

function getWeatherCondition(code: number) {
  if (code === 0) return { label: "Sereno", icon: "Sole" };
  if ([1, 2].includes(code)) return { label: "Poco nuvoloso", icon: "Sole velato" };
  if (code === 3) return { label: "Nuvoloso", icon: "Nubi" };
  if ([45, 48].includes(code)) return { label: "Nebbia", icon: "Nebbia" };
  if ([51, 53, 55, 56, 57].includes(code)) return { label: "Pioviggine", icon: "Pioggia fine" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { label: "Pioggia", icon: "Pioggia" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { label: "Neve", icon: "Neve" };
  if ([95, 96, 99].includes(code)) return { label: "Temporale", icon: "Temporale" };
  return { label: "Variabile", icon: "Meteo" };
}

function formatWeatherDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("it-IT", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

async function getCornateWeather(): Promise<WeatherForecast | null> {
  const params = new URLSearchParams({
    latitude: "45.65",
    longitude: "9.47",
    timezone: "Europe/Rome",
    forecast_days: "4",
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max",
  });

  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      next: { revalidate: 30 * 60 },
    });

    if (!response.ok) return null;

    const data = await response.json();
    const currentCondition = getWeatherCondition(Number(data.current?.weather_code ?? -1));
    const times: string[] = data.daily?.time ?? [];
    const days = times.slice(0, 4).map((date, index) => {
      const code = Number(data.daily.weather_code?.[index] ?? -1);
      const condition = getWeatherCondition(code);

      return {
        date,
        label: index === 0 ? "Oggi" : formatWeatherDate(date),
        code,
        condition: condition.label,
        icon: condition.icon,
        min: Math.round(Number(data.daily.temperature_2m_min?.[index] ?? 0)),
        max: Math.round(Number(data.daily.temperature_2m_max?.[index] ?? 0)),
        rainMm: Number(Number(data.daily.precipitation_sum?.[index] ?? 0).toFixed(1)),
        windKmh: Math.round(Number(data.daily.wind_speed_10m_max?.[index] ?? 0)),
      };
    });

    return {
      current: {
        temperature: Math.round(Number(data.current?.temperature_2m ?? 0)),
        apparentTemperature: Math.round(Number(data.current?.apparent_temperature ?? 0)),
        windKmh: Math.round(Number(data.current?.wind_speed_10m ?? 0)),
        code: Number(data.current?.weather_code ?? -1),
        condition: currentCondition.label,
        icon: currentCondition.icon,
      },
      days,
      updatedAt: data.current?.time ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

function WeatherHero({ weather, userLabel }: { weather: WeatherForecast | null; userLabel: string }) {
  return (
    <section className="dashboard-weather-hero">
      <ScansSyncButton />
      <div className="dashboard-weather-main">
        <p className="dashboard-kicker">Meteo Cornate d'Adda</p>
        <div className="dashboard-weather-title-row">
          <h1 className="dashboard-weather-title">
            {weather ? `${weather.current.temperature}°` : "Meteo non disponibile"}
          </h1>
          <div>
            <strong>{weather?.current.condition ?? "Dati temporaneamente non disponibili"}</strong>
            <span>
              {weather
                ? `Percepita ${weather.current.apparentTemperature}° · vento ${weather.current.windKmh} km/h`
                : "La dashboard resta operativa; riprovo al prossimo caricamento."}
            </span>
          </div>
        </div>
        <p className="dashboard-subtitle">
          Benvenuto, {userLabel}. Previsioni rapide per organizzare cantiere, mezzi e caricamenti.
        </p>
      </div>

      {weather ? (
        <div className="dashboard-weather-days" aria-label="Previsioni prossimi giorni">
          {weather.days.map((day) => (
            <article key={day.date} className="dashboard-weather-day">
              <span>{day.label}</span>
              <strong>{day.icon}</strong>
              <small>{day.condition}</small>
              <b>
                {day.min}° / {day.max}°
              </b>
              <em>{day.rainMm} mm · {day.windKmh} km/h</em>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
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
  const userLabel = session?.user?.name ?? session?.user?.email ?? "utente";
  const todayIso = new Date().toISOString().slice(0, 10);
  const todayBounds = getUtcDateBoundsFromIso(todayIso);
  const nextThirtyDaysEnd = new Date(todayBounds.end);
  nextThirtyDaysEnd.setUTCDate(nextThirtyDaysEnd.getUTCDate() + 30);
  const nextFiveDaysEnd = new Date(todayBounds.end);
  nextFiveDaysEnd.setUTCDate(nextFiveDaysEnd.getUTCDate() + 5);
  const oldPendingDeliveryNotesLimit = new Date(todayBounds.start);
  oldPendingDeliveryNotesLimit.setUTCDate(oldPendingDeliveryNotesLimit.getUTCDate() - 45);

  const appUser = await getActiveAppUser();
  const canSeeAutoDiaryAlert = appUser?.role === UserRole.ADMIN && shouldShowAutoDiaryAlert();
  const canSeeLoadingVerificationAlert = appUser?.role === UserRole.ADMIN && shouldShowLoadingVerificationAlert();

  const [
    scheduleEvents,
    oldPendingDeliveryNotesCount,
    newScansCount,
    autoDiaryStatus,
    loadingVerificationStatus,
    recurringMaintenanceAlerts,
    recurringTrainingAlerts,
    weather,
  ] = await Promise.all([
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
    canSeeAutoDiaryAlert ? getAutoDiaryProposalStatus() : Promise.resolve(null),
    canSeeLoadingVerificationAlert ? getLoadingVerificationStatus() : Promise.resolve(null),
    prisma.maintenance.findMany({
      where: {
        isRecurring: true,
        recurrenceMonths: { not: null },
        nextIntervention: {
          gte: todayBounds.start,
          lte: nextFiveDaysEnd,
        },
        deadline: { isNot: null },
      },
      orderBy: { nextIntervention: "asc" },
      include: {
        equipment: { select: { nameDescription: true } },
      },
    }),
    prisma.training.findMany({
      where: {
        isRecurring: true,
        recurrenceMonths: { not: null },
        expiresAt: {
          gte: todayBounds.start,
          lte: nextFiveDaysEnd,
        },
        deadline: { isNot: null },
      },
      orderBy: { expiresAt: "asc" },
      include: {
        person: { select: { fullName: true } },
      },
    }),
    getCornateWeather(),
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
      <WeatherHero weather={weather} userLabel={userLabel} />

      {newScansCount > 0 ||
      oldPendingDeliveryNotesCount > 0 ||
      (autoDiaryStatus?.pendingCount ?? 0) > 0 ||
      (loadingVerificationStatus?.issueCount ?? 0) > 0 ||
      recurringMaintenanceAlerts.length > 0 ||
      recurringTrainingAlerts.length > 0 ? (
        <section className="dashboard-alert-stack" aria-label="Attivita da lavorare">
          {recurringMaintenanceAlerts.length > 0 ? (
            <div className="dashboard-work-alert dashboard-work-alert-maintenance">
              <span className="dashboard-work-alert-main">
                <span className="dashboard-work-alert-count">{recurringMaintenanceAlerts.length}</span>
                <span>
                  <strong>Attivita da verificare</strong>
                  <span className="dashboard-work-alert-copy">
                    Manutenzioni ricorrenti in scadenza nei prossimi 5 giorni.
                  </span>
                </span>
              </span>
              <div className="dashboard-maintenance-alert-list">
                {recurringMaintenanceAlerts.map((item) => (
                  <div key={item.id} className="dashboard-maintenance-alert-row">
                    <span>
                      <strong>{item.equipment.nameDescription}</strong> - {item.interventionType} -{" "}
                      {item.nextIntervention?.toLocaleDateString("it-IT") ?? "-"} - ogni{" "}
                      {item.recurrenceMonths} mesi
                    </span>
                    <MaintenanceRollButton maintenanceId={item.id} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {recurringTrainingAlerts.length > 0 ? (
            <div className="dashboard-work-alert dashboard-work-alert-maintenance">
              <span className="dashboard-work-alert-main">
                <span className="dashboard-work-alert-count">{recurringTrainingAlerts.length}</span>
                <span>
                  <strong>Formazione da validare</strong>
                  <span className="dashboard-work-alert-copy">
                    Formazioni ricorrenti in scadenza nei prossimi 5 giorni.
                  </span>
                </span>
              </span>
              <div className="dashboard-maintenance-alert-list">
                {recurringTrainingAlerts.map((item) => (
                  <div key={item.id} className="dashboard-maintenance-alert-row">
                    <span>
                      <strong>{item.person.fullName}</strong> - {item.course} -{" "}
                      {item.expiresAt?.toLocaleDateString("it-IT") ?? "-"} - ogni{" "}
                      {item.recurrenceMonths} mesi
                    </span>
                    <TrainingRollButton trainingId={item.id} />
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {(loadingVerificationStatus?.issueCount ?? 0) > 0 ? (
            <a className="dashboard-work-alert dashboard-work-alert-validation" href="/admin/controlli">
              <span className="dashboard-work-alert-main">
                <span className="dashboard-work-alert-count">{loadingVerificationStatus?.issueCount}</span>
                <span>
                  <strong>Verifica caricamenti di fine mese</strong>
                  <span className="dashboard-work-alert-copy">
                    Controlla ore sotto soglia, straordinari e giornate oltre 10 ore per {loadingVerificationStatus?.monthLabel}.
                  </span>
                </span>
              </span>
              <span className="dashboard-work-alert-action">Vai ai Controlli</span>
            </a>
          ) : null}

          {(autoDiaryStatus?.pendingCount ?? 0) > 0 ? (
            <a className="dashboard-work-alert dashboard-work-alert-validation" href="/admin/controlli">
              <span className="dashboard-work-alert-main">
                <span className="dashboard-work-alert-count">{autoDiaryStatus?.pendingCount}</span>
                <span>
                  <strong>Autocompilazione Diario da validare</strong>
                  <span className="dashboard-work-alert-copy">
                    Controlla e valida le proposte di autocompilazione per {autoDiaryStatus?.currentMonthLabel}.
                  </span>
                </span>
              </span>
              <span className="dashboard-work-alert-action">Vai ai Controlli</span>
            </a>
          ) : null}

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
