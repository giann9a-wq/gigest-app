import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { quoteInclude, serializeQuote } from "@/lib/preventivi";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const quote = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!quote) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  return NextResponse.json({ quote: serializeQuote(quote) });
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const quote = await prisma.quote.findUnique({ where: { id }, select: { id: true } });
  if (!quote) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  await prisma.quote.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
