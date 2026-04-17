import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { getNewScannedDeliveryNoteCount } from "@/lib/gmail-scans";

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const count = await getNewScannedDeliveryNoteCount();
  return NextResponse.json({ count });
}
