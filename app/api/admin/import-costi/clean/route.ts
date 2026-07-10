import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import {
  createCostImportSessionFromCleanWorkbook,
  getCostImportSchemaMissingMessage,
  isCostImportSchemaMissingError,
} from "@/lib/cost-actual-import";

export async function POST(request: NextRequest) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File Excel pulito obbligatorio" }, { status: 400 });
  }

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".xlsx") && !fileName.endsWith(".xls")) {
    return NextResponse.json({ error: "Carica il file Excel pulito .xlsx" }, { status: 400 });
  }

  try {
    const result = await createCostImportSessionFromCleanWorkbook({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
      uploadedById: adminUser.id,
    });

    return NextResponse.json({
      success: true,
      sessionId: result.sessionId,
      summary: result.summary,
    });
  } catch (error) {
    if (isCostImportSchemaMissingError(error)) {
      return NextResponse.json({ error: getCostImportSchemaMissingMessage() }, { status: 503 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante l'import del file pulito" },
      { status: 500 }
    );
  }
}
