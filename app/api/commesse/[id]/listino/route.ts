import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { deleteUnit, getSalesView, saveUnit } from "@/lib/property-sales";
import { salesApiError } from "@/lib/property-sales-api";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const view = await getSalesView(id);
  return view ? NextResponse.json(view) : NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
}
export async function POST(request: NextRequest, context: Context) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try { const { id } = await context.params; await saveUnit(id, await request.json()); return NextResponse.json({ success: true }); }
  catch (error) { return salesApiError(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  try { const { id } = await context.params; await deleteUnit(id, String(request.nextUrl.searchParams.get("unitId") ?? "")); return NextResponse.json({ success: true }); }
  catch (error) { return salesApiError(error); }
}
