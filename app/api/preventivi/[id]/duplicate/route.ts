import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { quoteInclude, serializeQuote } from "@/lib/preventivi";
import { prisma } from "@/lib/prisma";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const original = await prisma.quote.findUnique({ where: { id }, include: quoteInclude });
  if (!original) return NextResponse.json({ error: "Preventivo non trovato" }, { status: 404 });
  const result = await prisma.$transaction(async (tx) => {
    const copy = await tx.quote.create({ data: {
      number: `${original.number}-COPIA-${Date.now().toString(36).slice(-4).toUpperCase()}`, title: `${original.title} (copia)`,
      customerName: original.customerName, customerContact: original.customerContact, siteAddress: original.siteAddress,
      description: original.description, plannedStartDate: original.plannedStartDate, plannedEndDate: original.plannedEndDate,
      isOwnAccountSite: original.isOwnAccountSite, generalDiscountPercent: original.generalDiscountPercent, createdById: user.id,
    } });
    const idMap = new Map<string, string>();
    if (original.textSections.length) {
      await tx.quoteTextSection.createMany({ data: original.textSections.map((section) => ({
        quoteId: copy.id, title: section.title, content: section.content, sortOrder: section.sortOrder,
      })) });
    }
    for (const chapter of original.chapters) {
      const created = await tx.quoteChapter.create({ data: { quoteId: copy.id, parentId: chapter.parentId ? idMap.get(chapter.parentId) ?? null : null, title: chapter.title, description: chapter.description, sortOrder: chapter.sortOrder } });
      idMap.set(chapter.id, created.id);
      if (chapter.lines.length) await tx.quoteLine.createMany({ data: chapter.lines.map((line) => ({ chapterId: created.id, sourceType: line.sourceType, sourceReference: line.sourceReference, priceListItemId: line.priceListItemId, code: line.code, description: line.description, regionalDescription: line.regionalDescription, detailDescription: line.detailDescription, includeDetail: line.includeDetail, unit: line.unit, quantity: line.quantity, unitPrice: line.unitPrice, discountPercent: line.discountPercent, sortOrder: line.sortOrder })) });
    }
    return tx.quote.findUniqueOrThrow({ where: { id: copy.id }, include: quoteInclude });
  });
  return NextResponse.json({ success: true, quote: serializeQuote(result) });
}
