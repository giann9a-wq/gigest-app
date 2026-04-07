import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { buildGoogleCalendarAuthUrl } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  if (appUser.role !== UserRole.ADMIN) {
    return NextResponse.json(
      { error: "Solo un amministratore può collegare il calendario condiviso" },
      { status: 403 }
    );
  }

  const state = randomUUID();
  const origin = new URL(request.url).origin;
  const response = NextResponse.redirect(buildGoogleCalendarAuthUrl(origin, state));

  response.cookies.set("gigest_google_calendar_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
