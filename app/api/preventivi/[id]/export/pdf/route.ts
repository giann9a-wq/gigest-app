import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { quoteInclude, quoteTotals } from "@/lib/preventivi";
import { prisma } from "@/lib/prisma";
import { createTextPdf } from "@/lib/simple-pdf";

function money(value: number) { return value.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function wrap(text: string, width = 92) { const words = text.split(/\s+/); const lines: string[] = []; let line = ""; for (const word of words) { if (`${line} ${word}`.trim().length > width) { if (line) lines.push(line); line = word; } else line = `${line} ${word}`.trim(); } if (line) lines.push(line); return lines; }

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!quote) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  const totals = quoteTotals(quote);
  const lines = [`PREVENTIVO ${quote.number}`, quote.title, `Cliente: ${quote.customerName}`, `Contatto: ${quote.customerContact ?? "-"}`, `Cantiere: ${quote.siteAddress ?? "-"}`, ""];
  for (const chapter of quote.chapters) {
    lines.push(`${chapter.parentId ? "  " : ""}${chapter.parentId ? "Sottocapitolo" : "MACRO CAPITOLO"}: ${chapter.title}`);
    for (const line of chapter.lines) {
      lines.push(...wrap(`  ${line.code ? `${line.code} - ` : ""}${line.description}`));
      const net = Number(line.quantity) * Number(line.unitPrice) * (1 - Number(line.discountPercent) / 100);
      lines.push(`    ${Number(line.quantity)} ${line.unit} x EUR ${money(Number(line.unitPrice))} | sconto ${Number(line.discountPercent)}% | EUR ${money(net)}`);
    }
    lines.push("");
  }
  lines.push(`Lordo: EUR ${money(totals.gross)}`, `Sconti sulle voci: EUR ${money(totals.lineDiscounts)}`, `Sconto generale: ${Number(quote.generalDiscountPercent)}%`, `TOTALE PREVENTIVO: EUR ${money(totals.total)}`);
  const pages: string[][] = []; for (let index = 0; index < lines.length; index += 48) pages.push(lines.slice(index, index + 48));
  const pdf = createTextPdf({ title: `Preventivo ${quote.number}`, pages });
  return new Response(pdf, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${quote.number}.pdf"`, "Cache-Control": "no-store" } });
}
