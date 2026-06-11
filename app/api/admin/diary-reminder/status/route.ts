import { NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { getDiaryReminderControlsStatus } from "@/lib/diary-reminder-job";

export async function GET() {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const status = await getDiaryReminderControlsStatus(new Date());
  return NextResponse.json({ success: true, status });
}

