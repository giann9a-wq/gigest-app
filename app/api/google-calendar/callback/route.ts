import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { connectSharedGoogleCalendar } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const appUser = await getActiveAppUser();
  const url = new URL(request.url);

  if (!appUser) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookieState = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith("gigest_google_calendar_state="))
    ?.split("=")[1];

  if (oauthError) {
    return NextResponse.redirect(
      new URL(
        `/scadenziario?calendar=error&calendarMessage=${encodeURIComponent(oauthError)}`,
        request.url
      )
    );
  }

  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.redirect(new URL("/scadenziario?calendar=invalid-state", request.url));
  }

  try {
    await connectSharedGoogleCalendar(code, url.origin, appUser.id);

    const response = NextResponse.redirect(
      new URL("/scadenziario?calendar=connected", request.url)
    );
    response.cookies.set("gigest_google_calendar_state", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Connessione Google Calendar non riuscita";

    return NextResponse.redirect(
      new URL(
        `/scadenziario?calendar=error&calendarMessage=${encodeURIComponent(message)}`,
        request.url
      )
    );
  }
}
