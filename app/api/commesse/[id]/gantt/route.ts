import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getActiveAppUser } from "@/lib/app-user";
import { getJobOrderSchedule, saveJobOrderSchedule, ScheduleError } from "@/lib/job-order-schedules";
type Context = { params: Promise<{ id: string }> };
function fail(e: unknown) {
  if (e instanceof ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Pianificazione non valida" }, { status: 400 });
  if (e instanceof ScheduleError) return NextResponse.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  console.error("Job order schedule error", e);
  return NextResponse.json({ error: "Impossibile salvare o caricare la pianificazione" }, { status: 500 });
}
export async function GET(_request: NextRequest, context: Context) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try { return NextResponse.json(await getJobOrderSchedule((await context.params).id)); } catch (e) { return fail(e); }
}
export async function PUT(request: NextRequest, context: Context) {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try { return NextResponse.json(await saveJobOrderSchedule((await context.params).id, await request.json(), user.email)); } catch (e) { return fail(e); }
}
