import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import {
  createInvoiceImportSession,
  getInvoiceImportSchemaMissingMessage,
  isInvoiceImportSchemaMissingError,
  listRecentInvoiceImportSessions,
} from "@/lib/invoice-import";

export async function GET() {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  try {
    const sessions = await listRecentInvoiceImportSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    if (isInvoiceImportSchemaMissingError(error)) {
      return NextResponse.json({ error: getInvoiceImportSchemaMissingMessage() }, { status: 503 });
    }

    return NextResponse.json({ error: "Errore leggendo le sessioni import fatture" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File Excel obbligatorio" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".xls")) {
    return NextResponse.json({ error: "Sono supportati solo file .xls gestionali in questa fase" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createInvoiceImportSession({
      fileName: file.name,
      buffer,
      uploadedById: adminUser.id,
    });

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      summary: result.summary,
    });
  } catch (error) {
    if (isInvoiceImportSchemaMissingError(error)) {
      return NextResponse.json({ error: getInvoiceImportSchemaMissingMessage() }, { status: 503 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante l'import del file" },
      { status: 500 }
    );
  }
}
