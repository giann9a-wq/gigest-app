import { CostActualCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { updateCostImportRow } from "@/lib/cost-actual-import";

const ALLOWED_CATEGORIES = new Set<CostActualCategory>([
  CostActualCategory.MATERIE_PRIME,
  CostActualCategory.PRESTAZIONI_PROFESSIONALI,
  CostActualCategory.PRESTAZIONI_TERZI,
  CostActualCategory.SPESE_VARIE,
]);

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
  const sourceAccountCode =
    body.sourceAccountCode === undefined ? undefined : String(body.sourceAccountCode ?? "");
  const sourceAccountDescription =
    body.sourceAccountDescription === undefined
      ? undefined
      : String(body.sourceAccountDescription ?? "");
  const supplierCode =
    body.supplierCode === undefined ? undefined : String(body.supplierCode ?? "");
  const supplierName =
    body.supplierName === undefined ? undefined : String(body.supplierName ?? "");
  const documentDate =
    body.documentDate === undefined ? undefined : body.documentDate === null ? null : String(body.documentDate);
  const registrationDate =
    body.registrationDate === undefined ? undefined : body.registrationDate === null ? null : String(body.registrationDate);
  const documentNumber =
    body.documentNumber === undefined ? undefined : String(body.documentNumber ?? "");
  const amount =
    body.amount === undefined
      ? undefined
      : body.amount === null || body.amount === ""
        ? null
        : Number(body.amount);
  const finalDescription =
    body.finalDescription === undefined ? undefined : String(body.finalDescription ?? "");
  const finalCategory =
    body.finalCategory === undefined
      ? undefined
      : body.finalCategory === null || body.finalCategory === ""
        ? null
        : (String(body.finalCategory) as CostActualCategory);
  const jobOrderId =
    body.jobOrderId === undefined ? undefined : String(body.jobOrderId ?? "").trim();
  const validationNote =
    body.validationNote === undefined ? undefined : String(body.validationNote ?? "");

  if (finalCategory !== undefined && finalCategory !== null && !ALLOWED_CATEGORIES.has(finalCategory)) {
    return NextResponse.json({ error: "Categoria non valida" }, { status: 400 });
  }

  try {
    await updateCostImportRow(sessionId, rowId, {
      sourceAccountCode,
      sourceAccountDescription,
      supplierCode,
      supplierName,
      documentDate,
      registrationDate,
      documentNumber,
      amount,
      finalDescription,
      finalCategory,
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
