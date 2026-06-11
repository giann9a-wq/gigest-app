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

  const status = await getSharedGoogleCalendarStatus(appUser.id);

  const canManage = appUser.role === UserRole.ADMIN;

  return NextResponse.json({
    connected: status.currentUserConnected,
    canManage,
    canConnect: true,
    integration: status.primary
      ? {
          calendarName: status.primary.calendarName,
          connectedEmail: status.primary.connectedEmail,
          externalCalendarId: status.primary.externalCalendarId,
          lastSyncedAt: status.primary.lastSyncedAt?.toISOString() ?? null,
          syncStatus: status.primary.syncStatus,
          syncError: status.primary.syncError,
          updatedAt: status.primary.updatedAt.toISOString(),
        }
      : null,
    connectedCount: canManage ? status.connectedCount : undefined,
    activeGoogleAccountCount: canManage ? status.activeGoogleAccountCount : undefined,
    missingAccountCount: canManage ? status.missingAccountCount : undefined,
    integrations: canManage
      ? status.integrations.map((integration) => ({
          calendarName: integration.calendarName,
          connectedEmail: integration.connectedEmail,
          externalCalendarId: integration.externalCalendarId,
          lastSyncedAt: integration.lastSyncedAt?.toISOString() ?? null,
          syncStatus: integration.syncStatus,
          syncError: integration.syncError,
          updatedAt: integration.updatedAt.toISOString(),
        }))
      : [],
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
    const status = await getSharedGoogleCalendarStatus(appUser.id);

    return NextResponse.json({
      success: true,
      syncedCount: result.syncedCount,
      importedCount: result.importedCount,
      deletedCount: result.deletedCount,
      integrationCount: result.integrationCount,
      skippedAccountCount: result.skippedAccountCount,
      errors: result.errors,
      integration: status.primary
        ? {
            calendarName: status.primary.calendarName,
            connectedEmail: status.primary.connectedEmail,
            externalCalendarId: status.primary.externalCalendarId,
            lastSyncedAt: status.primary.lastSyncedAt?.toISOString() ?? null,
            syncStatus: status.primary.syncStatus,
            syncError: status.primary.syncError,
            updatedAt: status.primary.updatedAt.toISOString(),
          }
        : null,
      connectedCount: status.connectedCount,
      activeGoogleAccountCount: status.activeGoogleAccountCount,
      missingAccountCount: status.missingAccountCount,
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
