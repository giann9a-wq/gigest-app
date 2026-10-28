import { prisma } from "@/lib/prisma";
import { getEffectiveResourceHourlyCost } from "@/lib/resource-economics";
import { effectiveExpectedRevenue } from "@/lib/job-order-sheet";

const round = (n: number) => Number(n.toFixed(2));
export async function getJobOrdersOverview() {
  const [jobs, activities, costs, units] = await Promise.all([
    prisma.jobOrder.findMany({ orderBy: { name: "asc" }, include: { _count: { select: {
      diaryActivities: true, externalDiaryActivities: true, materialUsages: true, deliveryNoteUsages: true,
    } } } }),
    prisma.diaryActivity.findMany({ select: { jobOrderId: true, resourceType: true, hours: true, referenceDate: true,
      person: { select: { costHistory: { orderBy: { validFrom: "desc" }, select: { hourlyCost: true, validFrom: true, validTo: true } } } },
      equipment: { select: { costHistory: { orderBy: { validFrom: "desc" }, select: { hourlyCost: true, validFrom: true, validTo: true } } } },
    }, orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }] }),
    prisma.costActualEntry.groupBy({ by: ["jobOrderId", "category"], _sum: { amount: true } }),
    prisma.salesUnit.groupBy({ by: ["jobOrderId"], _sum: { listPrice: true } }),
  ]);
  const jobTypes = new Map(jobs.map(j => [j.id, j.type]));
  const resources = new Map<string, { personnel: number; equipment: number; personnelHours: number; equipmentHours: number }>();
  for (const row of activities) {
    const bucket = resources.get(row.jobOrderId) ?? { personnel: 0, equipment: 0, personnelHours: 0, equipmentHours: 0 };
    const hourlyCost = getEffectiveResourceHourlyCost({ resourceType: row.resourceType, jobType: jobTypes.get(row.jobOrderId)!,
      costHistory: row.resourceType === "PERSON" ? row.person?.costHistory ?? [] : row.equipment?.costHistory ?? [], referenceDate: row.referenceDate });
    const key = row.resourceType === "PERSON" ? "personnel" : "equipment";
    bucket[key] = round(bucket[key] + round(Number(row.hours) * hourlyCost));
    const hoursKey = row.resourceType === "PERSON" ? "personnelHours" : "equipmentHours";
    bucket[hoursKey] = Number((bucket[hoursKey] + Number(row.hours)).toFixed(1));
    resources.set(row.jobOrderId, bucket);
  }
  const groupedCosts = new Map<string, Record<string, number>>();
  for (const row of costs) {
    const bucket = groupedCosts.get(row.jobOrderId) ?? {};
    bucket[row.category] = Number(row._sum.amount ?? 0); groupedCosts.set(row.jobOrderId, bucket);
  }
  const listTotals = new Map(units.map(u => [u.jobOrderId, u._sum.listPrice]));
  const rows = jobs.map(job => {
    const resource = resources.get(job.id) ?? { personnel: 0, equipment: 0, personnelHours: 0, equipmentHours: 0 };
    const imported = groupedCosts.get(job.id) ?? {};
    const budget = { personnel: Number(job.budgetPersonnelCost ?? 0), equipment: Number(job.budgetEquipmentCost ?? 0),
      materials: Number(job.budgetMaterialsCost ?? 0), professionalServices: Number(job.budgetProfessionalServicesCost ?? 0),
      thirdPartyServices: Number(job.budgetThirdPartyServicesCost ?? 0), misc: Number(job.budgetMiscCost ?? 0) };
    const actual = { personnel: resource.personnel, equipment: resource.equipment,
      materials: imported.MATERIE_PRIME ?? 0, professionalServices: imported.PRESTAZIONI_PROFESSIONALI ?? 0,
      thirdPartyServices: imported.PRESTAZIONI_TERZI ?? 0, misc: imported.SPESE_VARIE ?? 0 };
    const actualCosts = round(Object.values(actual).reduce((a, b) => a + b, 0));
    const budgetCosts = round(Object.values(budget).reduce((a, b) => a + b, 0));
    const revenue = Number(job.actualRevenue ?? 0);
    const margin = round(revenue - actualCosts);
    return { id: job.id, name: job.name, type: job.type, status: job.status, description: job.description ?? "",
      customerName: job.customerName ?? "", isOwnAccountSite: job.isOwnAccountSite,
      startDate: job.startDate?.toISOString().slice(0, 10) ?? "", endDate: job.endDate?.toISOString().slice(0, 10) ?? "",
      negativeMarginAlertSnoozedUntil: job.negativeMarginAlertSnoozedUntil?.toISOString() ?? null,
      budget: { ...budget, totalCosts: budgetCosts, revenue: effectiveExpectedRevenue(job, listTotals.get(job.id)) },
      actual: { ...actual, totalCosts: actualCosts, revenue, grossMargin: margin, grossMarginPct: revenue ? round(margin / revenue * 100) : 0 },
      personnelHours: resource.personnelHours, equipmentHours: resource.equipmentHours, counts: job._count,
    };
  });
  // Same alert episode rule as the existing dashboard: a recovered margin clears a snooze.
  const recovered = rows.filter(row => row.actual.grossMargin >= 0 && row.negativeMarginAlertSnoozedUntil);
  if (recovered.length) {
    await prisma.jobOrder.updateMany({ where: { id: { in: recovered.map(row => row.id) } }, data: { negativeMarginAlertSnoozedUntil: null } });
    for (const row of recovered) row.negativeMarginAlertSnoozedUntil = null;
  }
  return rows;
}
export type JobOrderOverviewRow = Awaited<ReturnType<typeof getJobOrdersOverview>>[number];
