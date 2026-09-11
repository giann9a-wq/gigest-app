import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { makeExcelResponse } from "@/lib/excel";
import { quoteInclude, quoteTotals } from "@/lib/preventivi";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!quote) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  const rows: Array<Record<string, string | number>> = [];
  for (const chapter of quote.chapters) for (const line of chapter.lines) {
    const gross = Number(line.quantity) * Number(line.unitPrice);
    rows.push({ "Macro capitolo": quote.chapters.find((item) => item.id === chapter.parentId)?.title ?? (chapter.parentId ? "" : chapter.title), "Sottocapitolo": chapter.parentId ? chapter.title : "", Codice: line.code ?? "", Descrizione: line.description, "U.M.": line.unit, Quantità: Number(line.quantity), "Prezzo unitario": Number(line.unitPrice), "Sconto %": Number(line.discountPercent), Totale: gross * (1 - Number(line.discountPercent) / 100) });
  }
  const totals = quoteTotals(quote);
  const workbook = XLSX.utils.book_new();
  const detail = XLSX.utils.json_to_sheet(rows);
  detail["!cols"] = [{ wch: 24 }, { wch: 24 }, { wch: 28 }, { wch: 90 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, detail, "Voci");
  const summary = XLSX.utils.aoa_to_sheet([["Preventivo", quote.number], ["Titolo", quote.title], ["Cliente", quote.customerName], ["Contatto", quote.customerContact ?? ""], ["Cantiere", quote.siteAddress ?? ""], [], ["Lordo", totals.gross], ["Sconti voci", totals.lineDiscounts], ["Sconto generale %", Number(quote.generalDiscountPercent)], ["Totale", totals.total]]);
  summary["!cols"] = [{ wch: 24 }, { wch: 55 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Riepilogo");
  return makeExcelResponse(workbook, `${quote.number}.xlsx`);
}
