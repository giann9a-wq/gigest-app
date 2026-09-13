import { NextRequest, NextResponse } from "next/server";
import { Prisma, QuoteLineSourceType, QuoteStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { decimal, optionalDate, quoteInclude, serializeQuote, type QuotePayload, validateQuotePayload } from "@/lib/preventivi";
import { prisma } from "@/lib/prisma";

async function nextQuoteNumber() {
  const year = new Date().getFullYear();
  const count = await prisma.quote.count({ where: { createdAt: { gte: new Date(`${year}-01-01T00:00:00.000Z`) } } });
  return `PREV-${year}-${String(count + 1).padStart(4, "0")}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
}
export async function GET() {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const rows = await prisma.quote.findMany({ orderBy: { updatedAt: "desc" }, include: quoteInclude });
  return NextResponse.json({ rows: rows.map(serializeQuote) });
}

export async function POST(request: NextRequest) {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  try {
    const payload = (await request.json()) as QuotePayload;
    validateQuotePayload(payload);
    const result = await prisma.$transaction(async (tx) => {
      const quote = payload.id
        ? await tx.quote.update({
            where: { id: payload.id },
            data: {
              title: String(payload.title).trim(), customerName: String(payload.customerName).trim(),
              customerContact: String(payload.customerContact ?? "").trim() || null,
              siteAddress: String(payload.siteAddress ?? "").trim() || null,
              description: String(payload.description ?? "").trim() || null,
              plannedStartDate: optionalDate(payload.plannedStartDate), plannedEndDate: optionalDate(payload.plannedEndDate),
              isOwnAccountSite: payload.isOwnAccountSite === true,
              generalDiscountPercent: decimal(payload.generalDiscountPercent), status: QuoteStatus.SAVED, savedAt: new Date(),
            },
          })
        : await tx.quote.create({
            data: {
              number: await nextQuoteNumber(), title: String(payload.title).trim(), customerName: String(payload.customerName).trim(),
              customerContact: String(payload.customerContact ?? "").trim() || null,
              siteAddress: String(payload.siteAddress ?? "").trim() || null,
              description: String(payload.description ?? "").trim() || null,
              plannedStartDate: optionalDate(payload.plannedStartDate), plannedEndDate: optionalDate(payload.plannedEndDate),
              isOwnAccountSite: payload.isOwnAccountSite === true,
              generalDiscountPercent: decimal(payload.generalDiscountPercent), status: QuoteStatus.SAVED, savedAt: new Date(), createdById: user.id,
            },
          });

      if (payload.id) {
        await tx.quoteChapter.deleteMany({ where: { quoteId: quote.id } });
        await tx.quoteTextSection.deleteMany({ where: { quoteId: quote.id } });
      }
      if ((payload.textSections ?? []).length > 0) {
        await tx.quoteTextSection.createMany({
          data: (payload.textSections ?? []).map((section, index) => ({
            quoteId: quote.id,
            title: String(section.title).trim(),
            content: String(section.content ?? "").trim(),
            sortOrder: section.sortOrder ?? index,
          })),
        });
      }
      const chapterIds = new Map<string, string>();
      for (const [index, chapter] of (payload.chapters ?? []).entries()) {
        const clientId = chapter.clientId || `chapter-${index}`;
        const parentId = chapter.parentClientId ? chapterIds.get(chapter.parentClientId) ?? null : null;
        const created = await tx.quoteChapter.create({
          data: { quoteId: quote.id, parentId, title: String(chapter.title).trim(), description: String(chapter.description ?? "").trim() || null, sortOrder: chapter.sortOrder ?? index },
        });
        chapterIds.set(clientId, created.id);
        if ((chapter.lines ?? []).length > 0) {
          await tx.quoteLine.createMany({ data: (chapter.lines ?? []).map((line, lineIndex) => ({
            chapterId: created.id, sourceType: line.sourceType as QuoteLineSourceType,
            sourceReference: String(line.sourceReference ?? "").trim() || null,
            priceListItemId: line.priceListItemId || null, code: String(line.code ?? "").trim() || null,
            description: String(line.description).trim(), unit: String(line.unit).trim(),
            quantity: decimal(line.quantity, 3), unitPrice: decimal(line.unitPrice, 4), discountPercent: decimal(line.discountPercent), sortOrder: line.sortOrder ?? lineIndex,
          })) });
        }
      }
      await tx.opportunity.upsert({ where: { quoteId: quote.id }, update: {}, create: { quoteId: quote.id } });
      return tx.quote.findUniqueOrThrow({ where: { id: quote.id }, include: quoteInclude });
    });
    return NextResponse.json({ success: true, quote: serializeQuote(result) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Salvataggio non riuscito" }, { status: 400 });
  }
}
