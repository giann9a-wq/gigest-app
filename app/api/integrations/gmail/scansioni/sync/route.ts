import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { runGmailScansSync } from "@/lib/gmail-scans-sync-runner";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function assertAuthorized(request: Request, options: { allowVercelCron: boolean }) {
  const appUser = await getActiveAppUser();
  const configuredSecret = process.env.GMAIL_SCANS_SYNC_SECRET || process.env.CRON_SECRET;
  const bearerToken = getBearerToken(request);
  const hasValidSecret = Boolean(configuredSecret && bearerToken === configuredSecret);
  const isVercelCron = options.allowVercelCron && request.headers.get("x-vercel-cron") === "1";

  return hasValidSecret || isVercelCron || appUser?.role === UserRole.ADMIN;
}

async function handleSync(request: Request, options: { allowVercelCron: boolean }) {
  const isAuthorized = await assertAuthorized(request, options);

  if (!isAuthorized) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const result = await runGmailScansSync({ force });

  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}

export async function GET(request: Request) {
  return handleSync(request, { allowVercelCron: true });
}

export async function POST(request: Request) {
  return handleSync(request, { allowVercelCron: false });
}
