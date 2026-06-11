import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recalculateJobOrderActualRevenue(jobOrderId: string) {
  const [invoices, advances] = await Promise.all([
    prisma.issuedInvoiceActual.aggregate({
      where: { jobOrderId },
      _sum: {
        netAmount: true,
      },
    }),
    prisma.jobOrderAdvance.aggregate({
      where: {
        jobOrderId,
        isActive: true,
      },
      _sum: {
        amount: true,
      },
    }),
  ]);

  const invoiceRevenue = Number(invoices._sum.netAmount ?? 0);
  const advanceRevenue = Number(advances._sum.amount ?? 0);
  const actualRevenue = invoiceRevenue + advanceRevenue;

  await prisma.jobOrder.update({
    where: { id: jobOrderId },
    data: {
      actualRevenue: new Prisma.Decimal(actualRevenue.toFixed(2)),
    },
  });

  return {
    invoiceRevenue,
    advanceRevenue,
    actualRevenue,
  };
}
