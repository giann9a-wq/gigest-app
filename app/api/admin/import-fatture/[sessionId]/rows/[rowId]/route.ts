import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { updateInvoiceImportRow } from "@/lib/invoice-import";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; rowId: string }> }
) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const body = await request.json();
  const { sessionId, rowId } = await context.params;
  const jobOrderId =
    body.jobOrderId === undefined
      ? undefined
      : body.jobOrderId === null || body.jobOrderId === ""
        ? null
        : String(body.jobOrderId);
  const validationNote =
    body.validationNote === undefined ? undefined : String(body.validationNote ?? "");

  try {
    await updateInvoiceImportRow(sessionId, rowId, {
      jobOrderId,
      validationNote,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore aggiornando la riga staging" },
      { status: 400 }
    );
  }
}
