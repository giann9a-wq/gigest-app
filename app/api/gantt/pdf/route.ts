import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getActiveAppUser } from "@/lib/app-user";
import { getDashboardSchedules } from "@/lib/job-order-schedules";
import { createSchedulePdf, schedulePdfRangeSchema, SchedulePdfError } from "@/lib/job-order-schedule-pdf";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const params = new URL(request.url).searchParams;
    const range = schedulePdfRangeSchema.parse({ start: params.get("start"), end: params.get("end") });
    const pdf = await createSchedulePdf(await getDashboardSchedules(), { range });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="gantt-commesse.pdf"', "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SchedulePdfError) return NextResponse.json({ error: error instanceof ZodError ? error.issues[0]?.message : error.message }, { status: 400 });
    console.error("Dashboard Gantt PDF error", error); return NextResponse.json({ error: "Impossibile esportare il Gantt" }, { status: 500 });
  }
}
