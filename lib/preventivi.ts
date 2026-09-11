import { Prisma, QuoteLineSourceType } from "@prisma/client";

export const quoteInclude = {
  chapters: {
    orderBy: { sortOrder: "asc" as const },
    include: { lines: { orderBy: { sortOrder: "asc" as const } } },
  },
  opportunity: { include: { jobOrder: { select: { id: true, name: true } } } },
} satisfies Prisma.QuoteInclude;

export type QuotePayload = {
  id?: string;
  title?: string;
  customerName?: string;
  customerContact?: string;
  siteAddress?: string;
  description?: string;
  plannedStartDate?: string;
  plannedEndDate?: string;
  isOwnAccountSite?: boolean;
  generalDiscountPercent?: number | string;
  chapters?: Array<{
    clientId?: string;
    parentClientId?: string | null;
    title?: string;
    description?: string;
    sortOrder?: number;
    lines?: Array<{
      sourceType?: QuoteLineSourceType | string;
      sourceReference?: string;
      priceListItemId?: string;
      code?: string;
      description?: string;
      unit?: string;
      quantity?: number | string;
      unitPrice?: number | string;
      discountPercent?: number | string;
      sortOrder?: number;
    }>;
  }>;
};

export function numberValue(value: unknown, fallback = 0) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}
export function decimal(value: unknown, scale = 2) {
  return new Prisma.Decimal(numberValue(value).toFixed(scale));
}

export function optionalDate(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const result = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function validateQuotePayload(payload: QuotePayload) {
  if (!String(payload.title ?? "").trim()) throw new Error("Il titolo del preventivo è obbligatorio.");
  if (!String(payload.customerName ?? "").trim()) throw new Error("Il cliente è obbligatorio.");
  const discount = numberValue(payload.generalDiscountPercent);
  if (discount < 0 || discount > 100) throw new Error("Lo sconto generale deve essere tra 0 e 100.");
  if (!Array.isArray(payload.chapters) || payload.chapters.length === 0) {
    throw new Error("Inserisci almeno un macro capitolo.");
  }
  for (const chapter of payload.chapters) {
    if (!String(chapter.title ?? "").trim()) throw new Error("Ogni capitolo deve avere un titolo.");
    for (const line of chapter.lines ?? []) {
      if (!Object.values(QuoteLineSourceType).includes(line.sourceType as QuoteLineSourceType)) {
        throw new Error("Origine voce non valida.");
      }
      if (!String(line.description ?? "").trim()) throw new Error("Ogni voce deve avere una descrizione.");
      if (!String(line.unit ?? "").trim()) throw new Error("Ogni voce deve avere un'unità di misura.");
      if (numberValue(line.quantity) < 0 || numberValue(line.unitPrice) < 0) {
        throw new Error("Quantità e prezzo non possono essere negativi.");
      }
      const lineDiscount = numberValue(line.discountPercent);
      if (lineDiscount < 0 || lineDiscount > 100) throw new Error("Lo sconto voce deve essere tra 0 e 100.");
    }
  }
}

export function quoteTotals(quote: {
  generalDiscountPercent: Prisma.Decimal;
  chapters: Array<{ lines: Array<{ quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discountPercent: Prisma.Decimal }> }>;
}) {
  let gross = 0;
  let afterLineDiscounts = 0;
  for (const chapter of quote.chapters) {
    for (const line of chapter.lines) {
      const lineGross = Number(line.quantity) * Number(line.unitPrice);
      gross += lineGross;
      afterLineDiscounts += lineGross * (1 - Number(line.discountPercent) / 100);
    }
  }
  const total = afterLineDiscounts * (1 - Number(quote.generalDiscountPercent) / 100);
  return { gross, lineDiscounts: gross - afterLineDiscounts, generalDiscount: afterLineDiscounts - total, total };
}

export function serializeQuote<T extends { generalDiscountPercent: Prisma.Decimal; plannedStartDate: Date | null; plannedEndDate: Date | null; chapters: Array<{ lines: Array<{ quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discountPercent: Prisma.Decimal }> }> }>(quote: T) {
  return {
    ...quote,
    generalDiscountPercent: Number(quote.generalDiscountPercent),
    plannedStartDate: quote.plannedStartDate?.toISOString().slice(0, 10) ?? "",
    plannedEndDate: quote.plannedEndDate?.toISOString().slice(0, 10) ?? "",
    chapters: quote.chapters.map((chapter) => ({
      ...chapter,
      lines: chapter.lines.map((line) => ({
        ...line,
        quantity: Number(line.quantity),
        unitPrice: Number(line.unitPrice),
        discountPercent: Number(line.discountPercent),
      })),
    })),
    totals: quoteTotals(quote),
  };
}
