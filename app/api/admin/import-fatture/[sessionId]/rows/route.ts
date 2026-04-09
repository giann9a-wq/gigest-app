import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { updateInvoiceImportRows } from "@/lib/invoice-import";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const body = await request.json();
  const { sessionId } = await context.params;
  const action = String(body.action ?? "") as "assign-job-order" | "approve" | "reject";
  const rowIds = Array.isArray(body.rowIds) ? body.rowIds.map(String).filter(Boolean) : [];
  const jobOrderId = body.jobOrderId ? String(body.jobOrderId) : null;

  if (!["assign-job-order", "approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Azione bulk non valida" }, { status: 400 });
  }

  if (rowIds.length === 0) {
    return NextResponse.json({ error: "Seleziona almeno una riga" }, { status: 400 });
  }

  if (action === "assign-job-order" && !jobOrderId) {
    return NextResponse.json({ error: "Commessa obbligatoria per l'assegnazione massiva" }, { status: 400 });
  }

  try {
    const result = await updateInvoiceImportRows(sessionId, {
      action,
      rowIds,
      jobOrderId,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore nelle azioni massive sulle fatture" },
      { status: 400 }
    );
  }
}
