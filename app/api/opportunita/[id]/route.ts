import { NextRequest, NextResponse } from "next/server";
import { JobType, OpportunityStatus, Prisma, ResourceStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { quoteInclude, quoteTotals, serializeQuote } from "@/lib/preventivi";
import { prisma } from "@/lib/prisma";

const allowedStatuses = Object.values(OpportunityStatus);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const body = await request.json();
  const status = String(body.status ?? "") as OpportunityStatus;
  if (!allowedStatuses.includes(status)) return NextResponse.json({ error: "Stato opportunità non valido" }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const opportunity = await tx.opportunity.findUnique({ where: { id }, include: { quote: { include: quoteInclude } } });
      if (!opportunity) throw new Error("Opportunità non trovata.");
      let jobOrderId = opportunity.jobOrderId;

      if (status === OpportunityStatus.APPROVED && !jobOrderId) {
        const totals = quoteTotals(opportunity.quote);
        let personnel = 0, equipment = 0, materials = 0;
        for (const chapter of opportunity.quote.chapters) for (const line of chapter.lines) {
          const net = Number(line.quantity) * Number(line.unitPrice) * (1 - Number(line.discountPercent) / 100);
          if (line.sourceType === "PERSON_ROLE") personnel += net;
          else if (line.sourceType === "EQUIPMENT") equipment += net;
          else materials += net;
        }
        const generalFactor = 1 - Number(opportunity.quote.generalDiscountPercent) / 100;
        const jobOrder = await tx.jobOrder.create({ data: {
          name: opportunity.quote.title, type: JobType.SITE, status: ResourceStatus.ACTIVE,
          startDate: opportunity.quote.plannedStartDate, endDate: opportunity.quote.plannedEndDate,
          description: opportunity.quote.description, customerName: opportunity.quote.customerName,
          customerContact: opportunity.quote.customerContact, siteAddress: opportunity.quote.siteAddress,
          isOwnAccountSite: opportunity.quote.isOwnAccountSite,
          budgetPersonnelCost: new Prisma.Decimal((personnel * generalFactor).toFixed(2)),
          budgetEquipmentCost: new Prisma.Decimal((equipment * generalFactor).toFixed(2)),
          budgetMaterialsCost: new Prisma.Decimal((materials * generalFactor).toFixed(2)),
          budgetExpectedRevenue: new Prisma.Decimal(totals.total.toFixed(2)),
        }, select: { id: true } });
        jobOrderId = jobOrder.id;
      }

      const updated = await tx.opportunity.update({ where: { id }, data: { status, jobOrderId, notes: String(body.notes ?? opportunity.notes ?? "").trim() || null }, include: { quote: { include: quoteInclude }, jobOrder: { select: { id: true, name: true } } } });
      return updated;
    });
    return NextResponse.json({ success: true, opportunity: { ...result, quote: serializeQuote(result.quote) } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Aggiornamento non riuscito" }, { status: 400 });
  }
}
