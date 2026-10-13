import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { approveInstallment } from "@/lib/property-sales";
import { salesApiError } from "@/lib/property-sales-api";
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await requireElevatedAdminUser();
  if (!user) return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  try { const { id } = await context.params; return NextResponse.json({ success: true, advanceId: await approveInstallment(id, user.id) }); }
  catch (error) { return salesApiError(error); }
}
