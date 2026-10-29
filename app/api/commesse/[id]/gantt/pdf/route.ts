import { NextResponse } from "next/server";
import { isDeepStrictEqual } from "node:util";
import { ZodError } from "zod";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { scheduleChangeSchema } from "@/lib/job-order-schedule-data";
import { createSchedulePdf, schedulePdfFilename, schedulePdfRangeSchema, SchedulePdfError } from "@/lib/job-order-schedule-pdf";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const body = await request.json(); const change = scheduleChangeSchema.parse(body);
    const range = body.range === undefined ? undefined : schedulePdfRangeSchema.parse(body.range);
    const job = await prisma.jobOrder.findUnique({ where: { id: (await context.params).id }, select: { id: true, name: true, status: true, schedule: true } });
    if (!job) return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
    const draft = (job.schedule?.version ?? 0) !== change.version || !isDeepStrictEqual(job.schedule?.sections ?? [], change.sections);
    const pdf = await createSchedulePdf([{ ...job, sections: change.sections }], { range, draft });
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${schedulePdfFilename(job.name)}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError || error instanceof SchedulePdfError) return NextResponse.json({ error: error instanceof ZodError ? error.issues[0]?.message : error.message }, { status: 400 });
    console.error("Gantt PDF error", error); return NextResponse.json({ error: "Impossibile esportare il Gantt" }, { status: 500 });
  }
}
