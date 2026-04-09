import { CostActualCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { updateCostImportRows } from "@/lib/cost-actual-import";

const ALLOWED_CATEGORIES = new Set<CostActualCategory>([
  CostActualCategory.MATERIE_PRIME,
  CostActualCategory.PRESTAZIONI_PROFESSIONALI,
  CostActualCategory.PRESTAZIONI_TERZI,
  CostActualCategory.SPESE_VARIE,
]);

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
  const action = String(body.action ?? "") as "approve" | "reject" | "set-category";
  const rowIds = Array.isArray(body.rowIds) ? body.rowIds.map(String).filter(Boolean) : [];
  const category = body.category ? (String(body.category) as CostActualCategory) : null;

  if (!["approve", "reject", "set-category"].includes(action)) {
    return NextResponse.json({ error: "Azione bulk non valida" }, { status: 400 });
  }

  if (rowIds.length === 0) {
    return NextResponse.json({ error: "Seleziona almeno una riga" }, { status: 400 });
  }

  if (action === "set-category" && (!category || !ALLOWED_CATEGORIES.has(category))) {
    return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
  }

  const result = await updateCostImportRows(sessionId, {
    action,
    rowIds,
    category,
  });

  return NextResponse.json({ success: true, ...result });
}
