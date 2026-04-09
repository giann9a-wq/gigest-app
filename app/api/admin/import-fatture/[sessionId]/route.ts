import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import {
  getInvoiceImportSchemaMissingMessage,
  getInvoiceImportSessionDetails,
  isInvoiceImportSchemaMissingError,
} from "@/lib/invoice-import";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const { sessionId } = await context.params;

  try {
    const session = await getInvoiceImportSessionDetails(sessionId);

    if (!session) {
      return NextResponse.json({ error: "Sessione import non trovata" }, { status: 404 });
    }

    return NextResponse.json(session);
  } catch (error) {
    if (isInvoiceImportSchemaMissingError(error)) {
      return NextResponse.json({ error: getInvoiceImportSchemaMissingMessage() }, { status: 503 });
    }

    return NextResponse.json({ error: "Errore leggendo la sessione import fatture" }, { status: 500 });
  }
}
