import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DeadlineOrigin, SyncSource, UserStatus } from "@prisma/client";

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function normalizeOptionalString(value: unknown) {
  const parsed = String(value ?? "").trim();
  return parsed || null;
}

function normalizeBoolean(value: unknown) {
  return value === true || value === "true";
}

function isValidTime(value: string | null) {
  if (!value) return true;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(value);
}

function buildRow(row: {
  id: string;
  title: string;
  description: string | null;
  eventDate: Date;
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  origin: DeadlineOrigin;
  lastSource: SyncSource;
  maintenanceId: string | null;
  maintenance?: {
    equipment: {
      id: string;
      nameDescription: string;
    } | null;
  } | null;
}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    eventDate: toInputDate(row.eventDate),
    startTime: row.startTime ?? "",
    endTime: row.endTime ?? "",
    isAllDay: row.isAllDay,
    origin: row.origin,
    lastSource: row.lastSource,
    maintenanceId: row.maintenanceId,
    canEdit: row.origin === DeadlineOrigin.MANUAL,
    canDelete: row.origin === DeadlineOrigin.MANUAL,
    linkedEquipment: row.maintenance?.equipment
      ? {
          id: row.maintenance.equipment.id,
          nameDescription: row.maintenance.equipment.nameDescription,
        }
      : null,
  };
}

async function getAuthorizedUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return { error: NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 }) };
  }

  return { appUser };
}

export async function GET() {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const rows = await prisma.deadline.findMany({
    orderBy: [{ eventDate: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    include: {
      maintenance: {
        include: {
          equipment: {
            select: {
              id: true,
              nameDescription: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    rows: rows.map(buildRow),
  });
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const { appUser } = authResult;
  const body = await request.json();

  const title = String(body.title || "").trim();
  const description = normalizeOptionalString(body.description);
  const eventDateRaw = String(body.eventDate || "").trim();
  const isAllDay = normalizeBoolean(body.isAllDay);
  const startTime = isAllDay ? null : normalizeOptionalString(body.startTime);
  const endTime = isAllDay ? null : normalizeOptionalString(body.endTime);

  if (!title) {
    return NextResponse.json({ error: "Il titolo è obbligatorio" }, { status: 400 });
  }

  if (!eventDateRaw) {
    return NextResponse.json({ error: "La data evento è obbligatoria" }, { status: 400 });
  }

  const eventDate = parseOptionalDate(eventDateRaw);

  if (!eventDate || Number.isNaN(eventDate.getTime())) {
    return NextResponse.json({ error: "Data evento non valida" }, { status: 400 });
  }

  if (!isAllDay && !startTime) {
    return NextResponse.json(
      { error: "Se non è tutto il giorno, l'ora di inizio è obbligatoria" },
      { status: 400 }
    );
  }

  if (!isValidTime(startTime) || !isValidTime(endTime)) {
    return NextResponse.json(
      { error: "Le ore devono essere nel formato HH:MM" },
      { status: 400 }
    );
  }

  if (startTime && endTime && endTime < startTime) {
    return NextResponse.json(
      { error: "L'ora di fine deve essere successiva all'ora di inizio" },
      { status: 400 }
    );
  }

  const created = await prisma.deadline.create({
    data: {
      title,
      description,
      eventDate,
      startTime,
      endTime,
      isAllDay,
      origin: DeadlineOrigin.MANUAL,
      createdByUserId: appUser.id,
      updatedByUserId: appUser.id,
      lastSource: SyncSource.GIGEST,
      lastModifiedAt: new Date(),
    },
    include: {
      maintenance: {
        include: {
          equipment: {
            select: {
              id: true,
              nameDescription: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    success: true,
    row: buildRow(created),
  });
}
