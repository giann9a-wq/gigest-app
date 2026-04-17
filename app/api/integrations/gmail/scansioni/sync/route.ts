import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { syncGmailScannedDeliveryNotes } from "@/lib/gmail-scans";

export async function POST(request: Request) {
  const appUser = await getActiveAppUser();
  const configuredSecret = process.env.GMAIL_SCANS_SYNC_SECRET;
  const bearerToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const hasValidSecret = Boolean(configuredSecret && bearerToken === configuredSecret);

  if (!hasValidSecret && (!appUser || appUser.role !== UserRole.ADMIN)) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const result = await syncGmailScannedDeliveryNotes();
  return NextResponse.json({ success: true, ...result });
}
