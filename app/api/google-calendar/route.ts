import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import {
  getSharedGoogleCalendarStatus,
  markGoogleCalendarSyncError,
  syncDeadlinesToSharedGoogleCalendar,
} from "@/lib/google-calendar";

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const status = await getSharedGoogleCalendarStatus();

  return NextResponse.json({
    connected: Boolean(status),
    canManage: appUser.role === UserRole.ADMIN,
    integration: status
      ? {
          calendarName: status.calendarName,
          connectedEmail: status.connectedEmail,
          externalCalendarId: status.externalCalendarId,
          lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null,
          syncStatus: status.syncStatus,
          syncError: status.syncError,
          updatedAt: status.updatedAt.toISOString(),
        }
      : null,
  });
}

export async function POST() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (appUser.role !== UserRole.ADMIN) {
    return NextResponse.json(
      { error: "Solo un amministratore può sincronizzare il calendario condiviso" },
      { status: 403 }
    );
  }

  try {
    const result = await syncDeadlinesToSharedGoogleCalendar();
    const status = await getSharedGoogleCalendarStatus();

    return NextResponse.json({
      success: true,
      syncedCount: result.syncedCount,
      importedCount: result.importedCount,
      deletedCount: result.deletedCount,
      integration: status
        ? {
            calendarName: status.calendarName,
            connectedEmail: status.connectedEmail,
            externalCalendarId: status.externalCalendarId,
            lastSyncedAt: status.lastSyncedAt?.toISOString() ?? null,
            syncStatus: status.syncStatus,
            syncError: status.syncError,
            updatedAt: status.updatedAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    await markGoogleCalendarSyncError(error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Errore sincronizzazione Google Calendar",
      },
      { status: 500 }
    );
  }
}
