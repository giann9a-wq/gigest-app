import { NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { runDiaryReminderJob } from "@/lib/diary-reminder-job";

export async function POST(request: Request) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const personId = String(body?.personId ?? "").trim();

  const result = await runDiaryReminderJob(new Date(), {
    ignoreHour: true,
    personIds: personId ? [personId] : undefined,
  });

  return NextResponse.json({ success: true, ...result });
}

