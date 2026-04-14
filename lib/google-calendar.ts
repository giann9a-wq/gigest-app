import { DeadlineOrigin, SyncSource, UserStatus, type CalendarIntegration as CalendarIntegrationModel, type Deadline } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const GOOGLE_PROVIDER = "GOOGLE";
const GOOGLE_USER_PROVIDER_PREFIX = "GOOGLE_USER_";
const DEFAULT_CALENDAR_NAME = "GiGEST";
const DEFAULT_TIME_ZONE = "Europe/Rome";
const GOOGLE_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.app.created",
  "https://www.googleapis.com/auth/userinfo.email",
];

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

type GoogleUserInfo = {
  email?: string;
};

type GoogleCalendarEvent = {
  id: string;
  summary?: string;
  description?: string;
  updated?: string;
  status?: string;
  start?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
    timeZone?: string;
  };
  extendedProperties?: {
    private?: Record<string, string>;
  };
};

type SyncResult = {
  syncedCount: number;
  importedCount: number;
  deletedCount: number;
  calendarName: string;
  integrationCount: number;
  skippedAccountCount: number;
  errors: string[];
};

type SharedCalendarIntegration = CalendarIntegrationModel & {
  connectedByUserId: string | null;
  connectedEmail: string | null;
  refreshToken: string | null;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  lastSyncedAt: Date | null;
  syncError: string | null;
};

type GoogleAccountWithUser = {
  provider: string;
  providerAccountId: string;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | null;
  user: {
    id: string;
    email: string;
  };
};

function getGoogleCredentials() {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID ?? process.env.AUTH_GOOGLE_ID;
  const clientSecret =
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ?? process.env.AUTH_GOOGLE_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Credenziali Google Calendar non configurate");
  }

  return { clientId, clientSecret };
}

function getRedirectUri(origin: string) {
  const explicitRedirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI?.trim();
  if (explicitRedirectUri) return explicitRedirectUri;

  const configuredOrigin = process.env.GOOGLE_CALENDAR_BASE_URL?.trim() || process.env.AUTH_URL?.trim();
  if (configuredOrigin) {
    return `${configuredOrigin.replace(/\/$/, "")}/api/google-calendar/callback`;
  }

  return `${origin}/api/google-calendar/callback`;
}

function buildTokenExpiry(expiresIn?: number) {
  if (!expiresIn) return null;
  return new Date(Date.now() + expiresIn * 1000);
}

function getUserCalendarProvider(userId: string) {
  return `${GOOGLE_USER_PROVIDER_PREFIX}${userId}`;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addOneHour(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + 60;
  const normalized = totalMinutes % (24 * 60);
  const nextHours = Math.floor(normalized / 60);
  const nextMinutes = normalized % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

function buildEventPayload(deadline: Deadline) {
  const descriptionLines = [
    deadline.description?.trim() || null,
    `Origine: ${deadline.origin}`,
    `Ultima fonte: ${deadline.lastSource}`,
  ].filter(Boolean);

  const payload: Record<string, unknown> = {
    summary: deadline.title,
    description: descriptionLines.join("\n"),
    extendedProperties: {
      private: {
        gigestManaged: "true",
        gigestDeadlineId: deadline.id,
        gigestOrigin: deadline.origin,
        gigestLastSource: deadline.lastSource,
      },
    },
  };

  const eventDate = deadline.eventDate.toISOString().slice(0, 10);

  if (deadline.isAllDay) {
    payload.start = { date: eventDate };
    payload.end = { date: addDaysToIsoDate(eventDate, 1) };
    return payload;
  }

  const startTime = deadline.startTime || "09:00";
  const endTime = deadline.endTime || addOneHour(startTime);

  payload.start = {
    dateTime: `${eventDate}T${startTime}:00`,
    timeZone: DEFAULT_TIME_ZONE,
  };
  payload.end = {
    dateTime: `${eventDate}T${endTime}:00`,
    timeZone: DEFAULT_TIME_ZONE,
  };

  return payload;
}

function getManagedDeadlineId(event: GoogleCalendarEvent) {
  return event.extendedProperties?.private?.gigestDeadlineId ?? null;
}

function parseStoredDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeTimeValue(value?: string | null) {
  if (!value) return null;
  return value.slice(0, 5);
}

function buildDeadlineDataFromGoogleEvent(event: GoogleCalendarEvent) {
  if (event.start?.date) {
    return {
      title: (event.summary || "Evento Google").trim(),
      description: event.description?.trim() || null,
      eventDate: parseStoredDate(event.start.date),
      isAllDay: true,
      startTime: null,
      endTime: null,
      lastModifiedAt: event.updated ? new Date(event.updated) : new Date(),
    };
  }

  if (event.start?.dateTime) {
    const startDate = new Date(event.start.dateTime);
    const endDate = event.end?.dateTime ? new Date(event.end.dateTime) : null;
    const eventDate = event.start.dateTime.slice(0, 10);

    return {
      title: (event.summary || "Evento Google").trim(),
      description: event.description?.trim() || null,
      eventDate: parseStoredDate(eventDate),
      isAllDay: false,
      startTime: normalizeTimeValue(startDate.toISOString().slice(11, 16)),
      endTime: endDate ? normalizeTimeValue(endDate.toISOString().slice(11, 16)) : null,
      lastModifiedAt: event.updated ? new Date(event.updated) : new Date(),
    };
  }

  return null;
}

async function googleApi<T>(
  path: string,
  accessToken: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google Calendar API error: ${errorText}`);
  }

  return (await response.json()) as T;
}

async function exchangeAuthorizationCode(code: string, origin: string) {
  const { clientId, clientSecret } = getGoogleCredentials();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: getRedirectUri(origin),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Scambio token Google non riuscito");
  }

  return data;
}

async function requestAccessTokenFromRefreshToken(refreshToken: string) {
  const { clientId, clientSecret } = getGoogleCredentials();

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Refresh token Google non riuscito");
  }

  return data;
}

async function refreshAccessToken(integration: SharedCalendarIntegration) {
  if (!integration.refreshToken) {
    throw new Error("Refresh token Google non disponibile");
  }

  const data = await requestAccessTokenFromRefreshToken(integration.refreshToken);

  const updated = await prisma.calendarIntegration.update({
    where: { provider: integration.provider },
    data: {
      accessToken: data.access_token,
      accessTokenExpiresAt: buildTokenExpiry(data.expires_in),
      syncError: null,
    },
  });

  return updated.accessToken!;
}

async function getValidAccountAccessToken(account: GoogleAccountWithUser) {
  const expiresAt = account.expires_at ? account.expires_at * 1000 : 0;

  if (account.access_token && expiresAt > Date.now() + 60_000) {
    return account.access_token;
  }

  if (!account.refresh_token) {
    throw new Error(`Refresh token Google non disponibile per ${account.user.email}`);
  }

  const data = await requestAccessTokenFromRefreshToken(account.refresh_token);

  await prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: account.provider,
        providerAccountId: account.providerAccountId,
      },
    },
    data: {
      access_token: data.access_token,
      expires_at: data.expires_in
        ? Math.floor(Date.now() / 1000) + data.expires_in
        : account.expires_at,
    },
  });

  return data.access_token!;
}

async function getValidAccessToken(integration: SharedCalendarIntegration) {
  const now = Date.now();
  const expiresAt = integration.accessTokenExpiresAt?.getTime() ?? 0;

  if (integration.accessToken && expiresAt > now + 60_000) {
    return integration.accessToken;
  }

  return refreshAccessToken(integration);
}

async function fetchGoogleUserInfo(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  const data = (await response.json()) as GoogleUserInfo;

  if (!response.ok || !data.email) {
    throw new Error("Impossibile leggere l'email Google dell'account collegato");
  }

  return data;
}

async function createSharedCalendar(accessToken: string) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: DEFAULT_CALENDAR_NAME,
      timeZone: DEFAULT_TIME_ZONE,
    }),
    cache: "no-store",
  });

  const data = (await response.json()) as {
    id?: string;
    summary?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !data.id) {
    throw new Error(data.error?.message || "Creazione calendario Google non riuscita");
  }

  return {
    id: data.id,
    summary: data.summary || DEFAULT_CALENDAR_NAME,
  };
}

async function listCalendarEvents(calendarId: string, accessToken: string) {
  const params = new URLSearchParams({
    maxResults: "2500",
    singleEvents: "true",
    showDeleted: "false",
  });

  const data = await googleApi<{ items?: GoogleCalendarEvent[] }>(
    `/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    accessToken
  );

  return data.items ?? [];
}

async function upsertEvent(
  calendarId: string,
  accessToken: string,
  deadline: Deadline,
  existingEventId?: string | null
) {
  const path = existingEventId
    ? `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existingEventId)}`
    : `/calendars/${encodeURIComponent(calendarId)}/events`;

  return googleApi<GoogleCalendarEvent>(path, accessToken, {
    method: existingEventId ? "PUT" : "POST",
    body: JSON.stringify(buildEventPayload(deadline)),
  });
}

async function deleteEvent(calendarId: string, accessToken: string, eventId: string) {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
      calendarId
    )}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    }
  );

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    throw new Error(`Eliminazione evento Google non riuscita: ${errorText}`);
  }
}

export function buildGoogleCalendarAuthUrl(origin: string, state: string) {
  const { clientId } = getGoogleCredentials();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: getRedirectUri(origin),
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    scope: GOOGLE_CALENDAR_SCOPES.join(" "),
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function connectSharedGoogleCalendar(code: string, origin: string, appUserId: string) {
  const tokens = await exchangeAuthorizationCode(code, origin);
  const accessToken = tokens.access_token!;
  const googleUser = await fetchGoogleUserInfo(accessToken);

  const provider = getUserCalendarProvider(appUserId);
  const existing = await prisma.calendarIntegration.findUnique({
    where: { provider },
  });

  const refreshToken = tokens.refresh_token || existing?.refreshToken || null;

  if (!refreshToken) {
    throw new Error("Google non ha restituito un refresh token utilizzabile");
  }

  const sharedCalendar = existing?.externalCalendarId
    ? {
        id: existing.externalCalendarId,
        summary: existing.calendarName,
      }
    : await createSharedCalendar(accessToken);

  const integration = await prisma.calendarIntegration.upsert({
    where: { provider },
    update: {
      externalCalendarId: sharedCalendar.id,
      calendarName: sharedCalendar.summary,
      connectedEmail: googleUser.email ?? null,
      refreshToken,
      accessToken,
      accessTokenExpiresAt: buildTokenExpiry(tokens.expires_in),
      connectedByUserId: appUserId,
      syncStatus: "ACTIVE",
      syncError: null,
    },
    create: {
      provider,
      externalCalendarId: sharedCalendar.id,
      calendarName: sharedCalendar.summary,
      connectedEmail: googleUser.email ?? null,
      refreshToken,
      accessToken,
      accessTokenExpiresAt: buildTokenExpiry(tokens.expires_in),
      connectedByUserId: appUserId,
      syncStatus: "ACTIVE",
      syncError: null,
    },
  });

  await syncSingleGoogleCalendarIntegration(integration as SharedCalendarIntegration);
}

async function getActiveGoogleAccounts() {
  return prisma.account.findMany({
    where: {
      provider: "google",
      user: {
        status: UserStatus.ACTIVE,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  }) as Promise<GoogleAccountWithUser[]>;
}

async function getExistingIntegrationForAccount(account: GoogleAccountWithUser) {
  const provider = getUserCalendarProvider(account.user.id);
  const existingUserIntegration = await prisma.calendarIntegration.findUnique({
    where: { provider },
  });

  if (existingUserIntegration) {
    return existingUserIntegration as SharedCalendarIntegration;
  }

  const legacyIntegration = await prisma.calendarIntegration.findUnique({
    where: { provider: GOOGLE_PROVIDER },
  });

  if (legacyIntegration?.connectedByUserId === account.user.id) {
    return legacyIntegration as SharedCalendarIntegration;
  }

  return null;
}

async function ensureGoogleCalendarIntegrationForAccount(account: GoogleAccountWithUser) {
  if (!account.refresh_token) {
    return null;
  }

  const existing = await getExistingIntegrationForAccount(account);
  const accessToken = await getValidAccountAccessToken(account);

  const calendar = existing?.externalCalendarId
    ? {
        id: existing.externalCalendarId,
        summary: existing.calendarName,
      }
    : await createSharedCalendar(accessToken);

  const provider = existing?.provider ?? getUserCalendarProvider(account.user.id);
  const integration = await prisma.calendarIntegration.upsert({
    where: { provider },
    update: {
      externalCalendarId: calendar.id,
      calendarName: calendar.summary,
      connectedEmail: account.user.email,
      refreshToken: account.refresh_token,
      accessToken,
      accessTokenExpiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
      connectedByUserId: account.user.id,
      syncStatus: "ACTIVE",
      syncError: null,
    },
    create: {
      provider,
      externalCalendarId: calendar.id,
      calendarName: calendar.summary,
      connectedEmail: account.user.email,
      refreshToken: account.refresh_token,
      accessToken,
      accessTokenExpiresAt: account.expires_at ? new Date(account.expires_at * 1000) : null,
      connectedByUserId: account.user.id,
      syncStatus: "ACTIVE",
      syncError: null,
    },
  });

  return integration as SharedCalendarIntegration;
}

async function prepareGoogleCalendarIntegrationsForActiveAccounts() {
  const accounts = await getActiveGoogleAccounts();
  const integrations: SharedCalendarIntegration[] = [];
  let skippedAccountCount = 0;

  for (const account of accounts) {
    const integration = await ensureGoogleCalendarIntegrationForAccount(account);

    if (integration) {
      integrations.push(integration);
    } else {
      skippedAccountCount += 1;
    }
  }

  const existingIntegrations = await prisma.calendarIntegration.findMany({
    where: {
      OR: [
        { provider: GOOGLE_PROVIDER },
        { provider: { startsWith: GOOGLE_USER_PROVIDER_PREFIX } },
      ],
    },
  });

  for (const integration of existingIntegrations) {
    if (!integrations.some((current) => current.id === integration.id)) {
      integrations.push(integration as SharedCalendarIntegration);
    }
  }

  return {
    integrations,
    activeGoogleAccountCount: accounts.length,
    skippedAccountCount,
  };
}

export async function getSharedGoogleCalendarStatus(appUserId?: string) {
  const currentUserProvider = appUserId ? getUserCalendarProvider(appUserId) : null;
  const [integrations, activeGoogleAccountCount] = await Promise.all([
    prisma.calendarIntegration.findMany({
      where: {
        OR: [
          { provider: GOOGLE_PROVIDER },
          { provider: { startsWith: GOOGLE_USER_PROVIDER_PREFIX } },
        ],
      },
      select: {
        id: true,
        provider: true,
        calendarName: true,
        connectedEmail: true,
        externalCalendarId: true,
        connectedByUserId: true,
        lastSyncedAt: true,
        syncStatus: true,
        syncError: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ connectedEmail: "asc" }, { createdAt: "asc" }],
    }),
    prisma.account.count({
      where: {
        provider: "google",
        user: {
          status: UserStatus.ACTIVE,
        },
      },
    }),
  ]);

  const currentUserIntegration = currentUserProvider
    ? integrations.find((integration) => integration.provider === currentUserProvider) ?? null
    : null;
  const legacyIntegrationForCurrentUser = appUserId
    ? integrations.find(
        (integration) =>
          integration.provider === GOOGLE_PROVIDER && integration.connectedByUserId === appUserId
      ) ?? null
    : null;
  const primary = currentUserIntegration ?? legacyIntegrationForCurrentUser ?? integrations[0] ?? null;
  const currentUserConnected = Boolean(currentUserIntegration ?? legacyIntegrationForCurrentUser);

  return {
    primary,
    integrations,
    connectedCount: integrations.length,
    activeGoogleAccountCount,
    missingAccountCount: Math.max(activeGoogleAccountCount - integrations.length, 0),
    currentUserConnected,
  };
}

async function syncSingleGoogleCalendarIntegration(integration: SharedCalendarIntegration) {
  if (!integration || !integration.externalCalendarId) {
    throw new Error("Calendario Google condiviso non collegato");
  }

  const accessToken = await getValidAccessToken(integration);

  const [existingDeadlines, mappings, calendarEvents] = await Promise.all([
    prisma.deadline.findMany({
      orderBy: [{ eventDate: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    }),
    prisma.calendarEventMapping.findMany({
      where: { calendarIntegrationId: integration.id },
    }),
    listCalendarEvents(integration.externalCalendarId, accessToken),
  ]);

  const deadlineById = new Map(existingDeadlines.map((deadline) => [deadline.id, deadline]));
  const mappingByDeadlineId = new Map(mappings.map((mapping) => [mapping.deadlineId, mapping]));
  const mappingByEventId = new Map(mappings.map((mapping) => [mapping.externalEventId, mapping]));
  const currentCalendarEventIds = new Set(calendarEvents.map((event) => event.id));
  const managedEventByDeadlineId = new Map(
    calendarEvents
      .map((event) => [getManagedDeadlineId(event), event] as const)
      .filter((entry): entry is [string, GoogleCalendarEvent] => Boolean(entry[0]))
  );

  let importedCount = 0;
  let deletedCount = 0;

  for (const mapping of mappings) {
    if (currentCalendarEventIds.has(mapping.externalEventId)) {
      continue;
    }

    const linkedDeadline = deadlineById.get(mapping.deadlineId);

    if (!linkedDeadline) {
      await prisma.calendarEventMapping.delete({
        where: { id: mapping.id },
      });
      mappingByDeadlineId.delete(mapping.deadlineId);
      mappingByEventId.delete(mapping.externalEventId);
      continue;
    }

    if (linkedDeadline.origin === DeadlineOrigin.MANUAL) {
      await prisma.deadline.delete({
        where: { id: linkedDeadline.id },
      });

      deadlineById.delete(linkedDeadline.id);
      mappingByDeadlineId.delete(linkedDeadline.id);
      mappingByEventId.delete(mapping.externalEventId);
      deletedCount += 1;
      continue;
    }

    await prisma.calendarEventMapping.delete({
      where: { id: mapping.id },
    });
    mappingByDeadlineId.delete(linkedDeadline.id);
    mappingByEventId.delete(mapping.externalEventId);
  }

  for (const event of calendarEvents) {
    if (!event.id || event.status === "cancelled") {
      continue;
    }

    const mappedByEvent = mappingByEventId.get(event.id);
    if (mappedByEvent) {
      continue;
    }

    const managedDeadlineId = getManagedDeadlineId(event);
    if (managedDeadlineId && deadlineById.has(managedDeadlineId)) {
      const existingDeadline = deadlineById.get(managedDeadlineId)!;

      const remapped = await prisma.calendarEventMapping.upsert({
        where: {
          calendarIntegrationId_externalEventId: {
            calendarIntegrationId: integration.id,
            externalEventId: event.id,
          },
        },
        update: {
          deadlineId: existingDeadline.id,
          lastSyncedAt: new Date(),
          externalUpdatedAt: event.updated ? new Date(event.updated) : null,
        },
        create: {
          deadlineId: existingDeadline.id,
          calendarIntegrationId: integration.id,
          externalEventId: event.id,
          lastSyncedAt: new Date(),
          externalUpdatedAt: event.updated ? new Date(event.updated) : null,
        },
      });

      mappingByDeadlineId.set(existingDeadline.id, remapped);
      mappingByEventId.set(event.id, remapped);
      continue;
    }

    const deadlineData = buildDeadlineDataFromGoogleEvent(event);
    if (!deadlineData) {
      continue;
    }

    const createdDeadline = await prisma.deadline.create({
      data: {
        title: deadlineData.title,
        description: deadlineData.description,
        eventDate: deadlineData.eventDate,
        isAllDay: deadlineData.isAllDay,
        startTime: deadlineData.startTime,
        endTime: deadlineData.endTime,
        origin: DeadlineOrigin.MANUAL,
        createdByUserId: integration.connectedByUserId,
        updatedByUserId: integration.connectedByUserId,
        lastSource: SyncSource.GOOGLE_CALENDAR,
        lastModifiedAt: deadlineData.lastModifiedAt,
      },
    });

    deadlineById.set(createdDeadline.id, createdDeadline);
    importedCount += 1;

    const normalizedEvent = await upsertEvent(
      integration.externalCalendarId,
      accessToken,
      createdDeadline,
      event.id
    );

    const savedMapping = await prisma.calendarEventMapping.upsert({
      where: {
        calendarIntegrationId_externalEventId: {
          calendarIntegrationId: integration.id,
          externalEventId: normalizedEvent.id,
        },
      },
      update: {
        deadlineId: createdDeadline.id,
        lastSyncedAt: new Date(),
        externalUpdatedAt: normalizedEvent.updated ? new Date(normalizedEvent.updated) : null,
      },
      create: {
        deadlineId: createdDeadline.id,
        calendarIntegrationId: integration.id,
        externalEventId: normalizedEvent.id,
        lastSyncedAt: new Date(),
        externalUpdatedAt: normalizedEvent.updated ? new Date(normalizedEvent.updated) : null,
      },
    });

    mappingByDeadlineId.set(createdDeadline.id, savedMapping);
    mappingByEventId.set(normalizedEvent.id, savedMapping);
    managedEventByDeadlineId.set(createdDeadline.id, normalizedEvent);
  }

  const deadlines = await prisma.deadline.findMany({
    orderBy: [{ eventDate: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
  });

  let syncedCount = 0;

  for (const deadline of deadlines) {
    const existingMapping = mappingByDeadlineId.get(deadline.id);
    const knownManagedEvent = managedEventByDeadlineId.get(deadline.id);
    const savedEvent = await upsertEvent(
      integration.externalCalendarId,
      accessToken,
      deadline,
      existingMapping?.externalEventId ?? knownManagedEvent?.id ?? null
    );

    const savedMapping = await prisma.calendarEventMapping.upsert({
      where: {
        calendarIntegrationId_externalEventId: {
          calendarIntegrationId: integration.id,
          externalEventId: savedEvent.id,
        },
      },
      update: {
        deadlineId: deadline.id,
        lastSyncedAt: new Date(),
        externalUpdatedAt: savedEvent.updated ? new Date(savedEvent.updated) : null,
      },
      create: {
        deadlineId: deadline.id,
        calendarIntegrationId: integration.id,
        externalEventId: savedEvent.id,
        lastSyncedAt: new Date(),
        externalUpdatedAt: savedEvent.updated ? new Date(savedEvent.updated) : null,
      },
    });

    mappingByDeadlineId.set(deadline.id, savedMapping);
    managedEventByDeadlineId.set(deadline.id, savedEvent);
    syncedCount += 1;
  }

  const currentDeadlineIds = new Set(deadlines.map((deadline) => deadline.id));
  for (const mapping of mappingByEventId.values()) {
    if (currentDeadlineIds.has(mapping.deadlineId)) {
      continue;
    }

    await deleteEvent(integration.externalCalendarId, accessToken, mapping.externalEventId);
    await prisma.calendarEventMapping.delete({
      where: { id: mapping.id },
    });
    deletedCount += 1;
  }

  await prisma.calendarIntegration.update({
    where: { provider: integration.provider },
    data: {
      lastSyncedAt: new Date(),
      syncStatus: "ACTIVE",
      syncError: null,
    },
  });

  return {
    syncedCount,
    importedCount,
    deletedCount,
    calendarName: integration.calendarName,
    integrationCount: 1,
    skippedAccountCount: 0,
    errors: [],
  };
}

export async function syncDeadlinesToSharedGoogleCalendar(): Promise<SyncResult> {
  const prepared = await prepareGoogleCalendarIntegrationsForActiveAccounts();

  if (prepared.integrations.length === 0) {
    throw new Error(
      "Nessun account Google con permesso Calendar disponibile. Fai accedere gli utenti con consenso Google Calendar e riprova."
    );
  }

  const result: SyncResult = {
    syncedCount: 0,
    importedCount: 0,
    deletedCount: 0,
    calendarName: DEFAULT_CALENDAR_NAME,
    integrationCount: 0,
    skippedAccountCount: prepared.skippedAccountCount,
    errors: [],
  };

  for (const integration of prepared.integrations) {
    try {
      const integrationResult = await syncSingleGoogleCalendarIntegration(integration);
      result.syncedCount += integrationResult.syncedCount;
      result.importedCount += integrationResult.importedCount;
      result.deletedCount += integrationResult.deletedCount;
      result.integrationCount += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore Google Calendar sconosciuto";
      result.errors.push(`${integration.connectedEmail ?? integration.provider}: ${message}`);

      await prisma.calendarIntegration.update({
        where: { provider: integration.provider },
        data: {
          syncStatus: "ERROR",
          syncError: message,
        },
      });
    }
  }

  if (result.integrationCount === 0) {
    throw new Error(result.errors.join("; ") || "Sincronizzazione Google Calendar non riuscita");
  }

  return result;
}

export async function markGoogleCalendarSyncError(error: unknown) {
  const message = error instanceof Error ? error.message : "Errore Google Calendar sconosciuto";

  const existing = await prisma.calendarIntegration.findMany({
    where: {
      OR: [
        { provider: GOOGLE_PROVIDER },
        { provider: { startsWith: GOOGLE_USER_PROVIDER_PREFIX } },
      ],
    },
    select: { id: true },
  });

  if (existing.length === 0) {
    return;
  }

  await prisma.calendarIntegration.updateMany({
    where: {
      id: {
        in: existing.map((integration) => integration.id),
      },
    },
    data: {
      syncStatus: "ERROR",
      syncError: message,
    },
  });
}

export async function deleteDeadlineFromSharedGoogleCalendar(deadlineId: string) {
  const integrations = (await prisma.calendarIntegration.findMany({
    where: {
      OR: [
        { provider: GOOGLE_PROVIDER },
        { provider: { startsWith: GOOGLE_USER_PROVIDER_PREFIX } },
      ],
    },
  })) as SharedCalendarIntegration[];

  if (integrations.length === 0) {
    return;
  }

  for (const integration of integrations) {
    if (!integration.externalCalendarId) {
      continue;
    }

    const mapping = await prisma.calendarEventMapping.findFirst({
      where: {
        deadlineId,
        calendarIntegrationId: integration.id,
      },
    });

    if (!mapping) {
      continue;
    }

    const accessToken = await getValidAccessToken(integration);
    await deleteEvent(integration.externalCalendarId, accessToken, mapping.externalEventId);
    await prisma.calendarEventMapping.delete({
      where: { id: mapping.id },
    });
  }
}
