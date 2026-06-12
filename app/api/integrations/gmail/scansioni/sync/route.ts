import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { syncGmailScannedDeliveryNotes } from "@/lib/gmail-scans";
import { prisma } from "@/lib/prisma";

const GMAIL_SCANS_SYNC_SETTING_KEY = "gmailScansSync";
const AUTO_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000;
const GMAIL_RATE_LIMIT_GRACE_MS = 2 * 60 * 1000;

type GmailScansSyncState = {
  lastAttemptAt?: string;
  lastSuccessAt?: string;
  cooldownUntil?: string | null;
  lastError?: string | null;
};

function normalizeSyncState(value: unknown): GmailScansSyncState {
  if (!value || typeof value !== "object") return {};

  const data = value as Record<string, unknown>;

  return {
    lastAttemptAt: typeof data.lastAttemptAt === "string" ? data.lastAttemptAt : undefined,
    lastSuccessAt: typeof data.lastSuccessAt === "string" ? data.lastSuccessAt : undefined,
    cooldownUntil: typeof data.cooldownUntil === "string" ? data.cooldownUntil : null,
    lastError: typeof data.lastError === "string" ? data.lastError : null,
  };
}

function isFutureIso(value: string | null | undefined, now: Date) {
  return Boolean(value && new Date(value).getTime() > now.getTime());
}

function extractRetryAfterIso(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(/Retry after ([0-9T:.-]+Z)/i);
  return match?.[1] ?? null;
}

function withGracePeriod(isoValue: string) {
  return new Date(new Date(isoValue).getTime() + GMAIL_RATE_LIMIT_GRACE_MS).toISOString();
}

async function getSyncState() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: GMAIL_SCANS_SYNC_SETTING_KEY },
    select: { value: true },
  });

  return normalizeSyncState(setting?.value);
}

async function saveSyncState(state: GmailScansSyncState) {
  await prisma.appSetting.upsert({
    where: { key: GMAIL_SCANS_SYNC_SETTING_KEY },
    create: {
      key: GMAIL_SCANS_SYNC_SETTING_KEY,
      value: state,
    },
    update: {
      value: state,
    },
  });
}

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

async function runSync(request: Request, options: { allowVercelCron: boolean }) {
  const appUser = await getActiveAppUser();
  const configuredSecret = process.env.GMAIL_SCANS_SYNC_SECRET || process.env.CRON_SECRET;
  const bearerToken = getBearerToken(request);
  const hasValidSecret = Boolean(configuredSecret && bearerToken === configuredSecret);
  const isVercelCron = options.allowVercelCron && request.headers.get("x-vercel-cron") === "1";

  if (!hasValidSecret && !isVercelCron && (!appUser || appUser.role !== UserRole.ADMIN)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const url = new URL(request.url);
  const force = url.searchParams.get("force") === "1";
  const state = await getSyncState();

  if (isFutureIso(state.cooldownUntil, now)) {
    return NextResponse.json({
      success: true,
      throttled: true,
      skippedReason: "gmail-rate-limit",
      message: "Gmail e in pausa temporanea.",
      nextAllowedAt: state.cooldownUntil,
    });
  }

  if (!force && state.lastAttemptAt) {
    const lastAttemptAt = new Date(state.lastAttemptAt).getTime();
    const nextAutomaticAttemptAt = new Date(lastAttemptAt + AUTO_SYNC_MIN_INTERVAL_MS);

    if (nextAutomaticAttemptAt.getTime() > now.getTime()) {
      return NextResponse.json({
        success: true,
        throttled: true,
        skippedReason: "automatic-cooldown",
        nextAllowedAt: nextAutomaticAttemptAt.toISOString(),
      });
    }
  }

  const lastAttemptAt = now.toISOString();
  await saveSyncState({
    ...state,
    lastAttemptAt,
    lastError: null,
  });

  try {
    const result = await syncGmailScannedDeliveryNotes();

    await saveSyncState({
      lastAttemptAt,
      lastSuccessAt: new Date().toISOString(),
      cooldownUntil: null,
      lastError: null,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const retryAfter = extractRetryAfterIso(error);
    const message = error instanceof Error ? error.message : "Errore sincronizzazione Gmail";
    const cooldownUntil = retryAfter
      ? withGracePeriod(retryAfter)
      : new Date(Date.now() + AUTO_SYNC_MIN_INTERVAL_MS).toISOString();

    await saveSyncState({
      ...state,
      lastAttemptAt,
      cooldownUntil,
      lastError: message,
    });

    if (retryAfter) {
      return NextResponse.json({
        success: true,
        throttled: true,
        skippedReason: "gmail-rate-limit",
        message: "Gmail e in pausa temporanea.",
        nextAllowedAt: cooldownUntil,
      });
    }

    return NextResponse.json(
      {
        success: false,
        error: message,
        nextAllowedAt: cooldownUntil,
      },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return runSync(request, { allowVercelCron: true });
}

export async function POST(request: Request) {
  return runSync(request, { allowVercelCron: false });
}
