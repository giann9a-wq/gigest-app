import * as XLSX from "xlsx";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  assertActiveUser,
  getCostActualRows,
  parseCostFilters,
} from "@/lib/cost-actual-queries";
import { makeExcelResponse } from "@/lib/excel";
import { prisma } from "@/lib/prisma";

function safeFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await assertActiveUser(session.user.email);
  if (!appUser) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const { id } = await context.params;
  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id },
    select: { name: true },
  });

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  const rows = await getCostActualRows(parseCostFilters(request.nextUrl.searchParams), id);
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(
    rows.map((row) => ({
      Commessa: row.jobOrderName,
      Tipologia: row.categoryLabel,
      Fornitore: row.supplierName,
      CodiceFornitore: row.supplierCode,
      DataDocumento: row.documentDate,
      Documento: row.documentNumber,
      Descrizione: row.description,
      Importo: row.amount,
      ContoSorgente: row.sourceAccountDescription,
      CodiceContoSorgente: row.sourceAccountCode,
    }))
  );

  XLSX.utils.book_append_sheet(workbook, sheet, "Costi");

  return makeExcelResponse(workbook, `costi-${safeFileSegment(jobOrder.name || id)}.xlsx`);
}
