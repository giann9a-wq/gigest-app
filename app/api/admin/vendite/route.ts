import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { deleteSale, getSalesView, saveSale } from "@/lib/property-sales";
import { salesApiError } from "@/lib/property-sales-api";
import { prisma } from "@/lib/prisma";
export async function GET(request: NextRequest) {
  if (!await requireElevatedAdminUser()) return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  const id = request.nextUrl.searchParams.get("jobOrderId");
  if (id) return NextResponse.json(await getSalesView(id));
  return NextResponse.json({ jobOrders: await prisma.jobOrder.findMany({ where: { salesPriceListEnabled: true }, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } }) });
}
export async function POST(request: NextRequest) {
  const user = await requireElevatedAdminUser();
  if (!user) return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  try { const sale = await saveSale(await request.json(), user.id); return NextResponse.json({ success: true, id: sale.id }); }
  catch (error) { return salesApiError(error); }
}
export async function DELETE(request: NextRequest) {
  if (!await requireElevatedAdminUser()) return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  try { await deleteSale(String(request.nextUrl.searchParams.get("saleId") ?? "")); return NextResponse.json({ success: true }); }
  catch (error) { return salesApiError(error); }
}
