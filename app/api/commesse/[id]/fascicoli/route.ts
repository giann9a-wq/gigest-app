import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { getDossier, linkDossierDocument, saveDossierRecord } from "@/lib/job-order-dossiers";
import { salesApiError } from "@/lib/property-sales-api";
import { z } from "zod";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try { return NextResponse.json(await getDossier((await context.params).id)); } catch (e) { return salesApiError(e); }
}
export async function POST(request: NextRequest, context: Context) {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const record = await saveDossierRecord((await context.params).id, await request.json(), user.email);
    return NextResponse.json({ id: record.id });
  } catch (e) { return salesApiError(e); }
}
export async function PATCH(request: NextRequest, context: Context) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try {
    const data = z.object({ recordId: z.string().min(1), documentId: z.string().min(1) }).parse(await request.json());
    await linkDossierDocument((await context.params).id, data.recordId, data.documentId);
    return NextResponse.json({ success: true });
  } catch (e) { return salesApiError(e); }
}
