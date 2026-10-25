import { NextResponse } from "next/server";
import { preparePendingScanSuggestions } from "@/lib/scan-suggestions-service";

export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  await preparePendingScanSuggestions();
  return NextResponse.json({ success: true });
}
