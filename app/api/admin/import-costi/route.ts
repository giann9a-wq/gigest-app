import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { createCostImportSession, listRecentCostImportSessions } from "@/lib/cost-actual-import";

export async function GET() {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const sessions = await listRecentCostImportSessions();
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const formData = await request.formData();
  const jobOrderId = String(formData.get("jobOrderId") ?? "").trim();
  const file = formData.get("file");

  if (!jobOrderId) {
    return NextResponse.json({ error: "Commessa obbligatoria" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File Excel obbligatorio" }, { status: 400 });
  }

  if (!file.name.toLowerCase().endsWith(".xls")) {
    return NextResponse.json({ error: "Sono supportati solo file .xls gestionali in questa fase" }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await createCostImportSession({
      jobOrderId,
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore durante l'import del file" },
      { status: 500 }
    );
  }
}
