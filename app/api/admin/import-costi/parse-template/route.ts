import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import {
  createCleanCostWorkbookFromPartitario,
  getCostImportSchemaMissingMessage,
  isCostImportSchemaMissingError,
} from "@/lib/cost-actual-import";

function cleanFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
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

  const fileName = file.name.toLowerCase();
  if (!fileName.endsWith(".xls") && !fileName.endsWith(".xlsx")) {
    return NextResponse.json({ error: "Sono supportati file Excel .xls e .xlsx" }, { status: 400 });
  }

  try {
    const result = await createCleanCostWorkbookFromPartitario({
      fileName: file.name,
      buffer: Buffer.from(await file.arrayBuffer()),
    });
    const outputName = `costi-puliti-${cleanFileSegment(file.name.replace(/\.[^.]+$/, ""))}.xlsx`;
    const body = new Blob([new Uint8Array(result.buffer)], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${outputName}"`,
        "Cache-Control": "no-store",
        "X-Parsed-Rows": String(result.summary.parsedRows),
        "X-Invalid-Rows": String(result.summary.invalidRows),
      },
    });
  } catch (error) {
    if (isCostImportSchemaMissingError(error)) {
      return NextResponse.json({ error: getCostImportSchemaMissingMessage() }, { status: 503 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante il parsing del file" },
      { status: 500 }
    );
  }
}
