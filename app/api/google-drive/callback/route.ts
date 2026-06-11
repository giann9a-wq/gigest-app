import { NextResponse } from "next/server";

const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return NextResponse.json({ error: oauthError }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: "Parametro code mancante" }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
  const setupKey = process.env.GOOGLE_DRIVE_SETUP_KEY;

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      { error: "Configurazione Google Drive OAuth mancante" },
      { status: 500 }
    );
  }

  if (setupKey && state !== setupKey) {
    return NextResponse.json({ error: "State OAuth non valido" }, { status: 400 });
  }

  const tokenResponse = await fetch(GOOGLE_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = (await tokenResponse.json()) as GoogleTokenResponse;

  if (!tokenResponse.ok) {
    console.error("Google Drive OAuth token exchange failed", tokenData);
    return NextResponse.json(
      {
        error: tokenData.error ?? "Token exchange fallito",
        errorDescription: tokenData.error_description,
      },
      { status: 500 }
    );
  }

  console.log("Google Drive OAuth completed", {
    hasAccessToken: Boolean(tokenData.access_token),
    hasRefreshToken: Boolean(tokenData.refresh_token),
  });

  const shouldReturnTokens = Boolean(setupKey);

  return NextResponse.json({
    success: true,
    message: "Token ricevuti.",
    hasRefreshToken: Boolean(tokenData.refresh_token),
    ...(shouldReturnTokens
      ? {
          refreshToken: tokenData.refresh_token ?? null,
          scope: tokenData.scope ?? null,
        }
      : {}),
  });
}
