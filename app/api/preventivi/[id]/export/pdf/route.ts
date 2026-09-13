import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { quoteInclude } from "@/lib/preventivi";
import { prisma } from "@/lib/prisma";
import { createQuotePdf } from "@/lib/quote-pdf";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!quote) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  const pdf = await createQuotePdf(quote);
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${quote.number}.pdf"`, "Cache-Control": "no-store" } });
}
