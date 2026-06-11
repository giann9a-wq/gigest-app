import { CostActualCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { splitCostImportRow } from "@/lib/cost-actual-import";

const ALLOWED_CATEGORIES = new Set<CostActualCategory>([
  CostActualCategory.MATERIE_PRIME,
  CostActualCategory.PRESTAZIONI_PROFESSIONALI,
  CostActualCategory.PRESTAZIONI_TERZI,
  CostActualCategory.SPESE_VARIE,
]);

type SplitPayload = {
  jobOrderId?: unknown;
  amount?: unknown;
  finalCategory?: unknown;
  finalDescription?: unknown;
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string; rowId: string }> }
) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Accesso admin elevato richiesto" }, { status: 403 });
  }

  const body = await request.json();
  const { sessionId, rowId } = await context.params;
  const splits: SplitPayload[] = Array.isArray(body.splits) ? body.splits : [];

  for (const split of splits) {
    const finalCategory =
      split.finalCategory === undefined || split.finalCategory === null || split.finalCategory === ""
        ? null
        : (String(split.finalCategory) as CostActualCategory);

    if (finalCategory && !ALLOWED_CATEGORIES.has(finalCategory)) {
      return NextResponse.json({ error: "Categoria non valida nello split" }, { status: 400 });
    }
  }

  try {
    const result = await splitCostImportRow(sessionId, rowId, {
      splits: splits.map((split) => ({
        jobOrderId: String(split.jobOrderId ?? "").trim(),
        amount:
          typeof split.amount === "number"
            ? split.amount
            : String(split.amount ?? ""),
        finalCategory:
          split.finalCategory === undefined || split.finalCategory === null || split.finalCategory === ""
            ? null
            : (String(split.finalCategory) as CostActualCategory),
        finalDescription:
          split.finalDescription === undefined || split.finalDescription === null
            ? null
            : String(split.finalDescription),
      })),
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore dividendo la riga staging" },
      { status: 400 }
    );
  }
}
