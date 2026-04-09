import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { applyApprovedCostImportRows } from "@/lib/cost-actual-import";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  try {
    const { sessionId } = await context.params;
    const result = await applyApprovedCostImportRows(sessionId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore in conferma import costi" },
      { status: 400 }
    );
  }
}
