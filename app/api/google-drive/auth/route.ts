import { NextResponse } from "next/server";

const GOOGLE_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_DOCUMENTALE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
].join(" ");

export async function GET() {
  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const setupKey = process.env.GOOGLE_DRIVE_SETUP_KEY;

  if (!clientId || !redirectUri) {
    return NextResponse.json(
      { error: "Configurazione Google Drive OAuth mancante" },
      { status: 500 }
    );
  }

  const authUrl = new URL(GOOGLE_OAUTH_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", GOOGLE_DOCUMENTALE_SCOPES);
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  if (setupKey) {
    authUrl.searchParams.set("state", setupKey);
  }

  return NextResponse.redirect(authUrl);
}
