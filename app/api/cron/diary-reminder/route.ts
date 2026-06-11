import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { runDiaryReminderJob } from "@/lib/diary-reminder-job";
import { runMonthlyEmailAutomations } from "@/lib/monthly-email-automations";

function getBearerToken(request: Request) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET || process.env.DIARY_REMINDER_SECRET;
  const bearer = getBearerToken(request);
  const isCron = request.headers.get("x-vercel-cron") === "1";

  const appUser = await getActiveAppUser();
  const isAdmin = appUser?.role === UserRole.ADMIN;

  const hasValidSecret = Boolean(configuredSecret && bearer === configuredSecret);
  if (!hasValidSecret && !isCron && !isAdmin) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const [diaryReminder, monthlyAutomations] = await Promise.all([
    runDiaryReminderJob(now),
    runMonthlyEmailAutomations(now),
  ]);

  console.info("[cron/diary-reminder]", {
    at: now.toISOString(),
    diaryReminder,
    monthlyAutomations,
  });

  return NextResponse.json({ success: true, diaryReminder, monthlyAutomations });
}
