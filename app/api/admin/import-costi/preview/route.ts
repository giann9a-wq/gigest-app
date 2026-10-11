import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { parsePartitarioXls } from "@/lib/cost-actual-import";
import { groupCostImportRows } from "@/lib/cost-import-preview";

export async function POST(request: NextRequest) {
  if (!await requireElevatedAdminUser()) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !/\.xlsx?$/i.test(file.name)) {
      return NextResponse.json({ error: "Seleziona un file Excel .xls o .xlsx" }, { status: 400 });
    }
    const parsed = parsePartitarioXls(Buffer.from(await file.arrayBuffer()), "preview");
    const preview = groupCostImportRows(parsed.rows);
    if (!preview.groups.length) {
      return NextResponse.json({ error: "Nessun codice contabile riconosciuto nel file partitario." }, { status: 400 });
    }
    return NextResponse.json({ ...preview, rowCount: parsed.rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Impossibile leggere il file" }, { status: 400 });
  }
}
