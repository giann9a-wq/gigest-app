import { prisma } from "@/lib/prisma";

type CostHistoryRow = {
  hourlyCost: unknown;
  validFrom: Date;
  validTo: Date | null;
};

function getApplicableCost(history: CostHistoryRow[], referenceDate: Date) {
  const matching = history.find((item) => {
    const start = item.validFrom.getTime();
    const end = item.validTo ? item.validTo.getTime() : Number.POSITIVE_INFINITY;
    const current = referenceDate.getTime();
    return current >= start && current <= end;
  });

  if (!matching) return 0;
  return Number(matching.hourlyCost);
}

function toAmount(value: unknown) {
  if (value == null) return 0;
  return Number(value);
}

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function roundHours(value: number) {
  return Number(value.toFixed(1));
}

function toRatio(costs: number, revenue: number) {
  if (!revenue) return 0;
  return Number((((revenue - costs) / revenue) * 100).toFixed(2));
}

export async function getJobOrderDashboard(jobOrderId: string) {
  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: {
      _count: {
        select: {
          diaryActivities: true,
          externalDiaryActivities: true,
        },
      },
      diaryActivities: {
        orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
        include: {
          person: {
            select: {
              id: true,
              fullName: true,
              costHistory: {
                orderBy: { validFrom: "desc" },
                select: {
                  hourlyCost: true,
                  validFrom: true,
                  validTo: true,
                },
              },
            },
          },
          equipment: {
            select: {
              id: true,
              nameDescription: true,
              costHistory: {
                orderBy: { validFrom: "desc" },
                select: {
                  hourlyCost: true,
                  validFrom: true,
                  validTo: true,
                },
              },
            },
          },
        },
      },
      externalDiaryActivities: {
        orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
        include: {
          externalResource: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
    },
  });

  if (!jobOrder) {
    return null;
  }

  const personnelMap = new Map<
    string,
    {
      resourceId: string;
      resourceLabel: string;
      totalHours: number;
      totalCost: number;
      entries: {
        id: string;
        referenceDate: string;
        hours: number;
        hourlyCost: number;
        totalCost: number;
        description: string;
      }[];
    }
  >();

  const equipmentMap = new Map<
    string,
    {
      resourceId: string;
      resourceLabel: string;
      totalHours: number;
      totalCost: number;
      entries: {
        id: string;
        referenceDate: string;
        hours: number;
        hourlyCost: number;
        totalCost: number;
        description: string;
      }[];
    }
  >();

  const externalResourceMap = new Map<
    string,
    {
      resourceId: string;
      resourceLabel: string;
      totalDays: number;
      entryCount: number;
      entries: {
        id: string;
        referenceDate: string;
        days: number;
        description: string;
      }[];
    }
  >();

  let actualPersonnelCost = 0;
  let actualEquipmentCost = 0;
  let totalExternalDays = 0;

  for (const activity of jobOrder.diaryActivities) {
    const hours = Number(activity.hours);
    const hourlyCost =
      activity.resourceType === "PERSON"
        ? getApplicableCost(activity.person?.costHistory ?? [], activity.referenceDate)
        : getApplicableCost(activity.equipment?.costHistory ?? [], activity.referenceDate);
    const totalCost = roundCurrency(hours * hourlyCost);

    const detailEntry = {
      id: activity.id,
      referenceDate: activity.referenceDate.toISOString().slice(0, 10),
      hours: roundHours(hours),
      hourlyCost: roundCurrency(hourlyCost),
      totalCost,
      description: activity.activityDescription ?? "",
    };

    if (activity.resourceType === "PERSON") {
      actualPersonnelCost = roundCurrency(actualPersonnelCost + totalCost);
      const resourceId = activity.personId ?? activity.id;
      const resourceLabel = activity.person?.fullName ?? "Risorsa personale";
      const current = personnelMap.get(resourceId);

      if (current) {
        current.totalHours = roundHours(current.totalHours + hours);
        current.totalCost = roundCurrency(current.totalCost + totalCost);
        current.entries.push(detailEntry);
      } else {
        personnelMap.set(resourceId, {
          resourceId,
          resourceLabel,
          totalHours: roundHours(hours),
          totalCost,
          entries: [detailEntry],
        });
      }

      continue;
    }

    actualEquipmentCost = roundCurrency(actualEquipmentCost + totalCost);
    const resourceId = activity.equipmentId ?? activity.id;
    const resourceLabel = activity.equipment?.nameDescription ?? "Mezzo / attrezzatura";
    const current = equipmentMap.get(resourceId);

    if (current) {
      current.totalHours = roundHours(current.totalHours + hours);
      current.totalCost = roundCurrency(current.totalCost + totalCost);
      current.entries.push(detailEntry);
    } else {
      equipmentMap.set(resourceId, {
        resourceId,
        resourceLabel,
        totalHours: roundHours(hours),
        totalCost,
        entries: [detailEntry],
      });
    }
  }

  for (const activity of jobOrder.externalDiaryActivities) {
    const days = roundHours(Number(activity.days));
    totalExternalDays = roundHours(totalExternalDays + days);

    const detailEntry = {
      id: activity.id,
      referenceDate: activity.referenceDate.toISOString().slice(0, 10),
      days,
      description: activity.activityDescription ?? "",
    };

    const resourceId = activity.externalResourceId;
    const resourceLabel = activity.externalResource.name;
    const current = externalResourceMap.get(resourceId);

    if (current) {
      current.totalDays = roundHours(current.totalDays + days);
      current.entryCount += 1;
      current.entries.push(detailEntry);
    } else {
      externalResourceMap.set(resourceId, {
        resourceId,
        resourceLabel,
        totalDays: days,
        entryCount: 1,
        entries: [detailEntry],
      });
    }
  }

  const budget = {
    personnel: toAmount(jobOrder.budgetPersonnelCost),
    equipment: toAmount(jobOrder.budgetEquipmentCost),
    materials: toAmount(jobOrder.budgetMaterialsCost),
    professionalServices: toAmount(jobOrder.budgetProfessionalServicesCost),
    thirdPartyServices: toAmount(jobOrder.budgetThirdPartyServicesCost),
    misc: toAmount(jobOrder.budgetMiscCost),
    revenue: toAmount(jobOrder.budgetExpectedRevenue),
  };

  const actual = {
    personnel: actualPersonnelCost,
    equipment: actualEquipmentCost,
    materials: toAmount(jobOrder.actualMaterialsCost),
    professionalServices: toAmount(jobOrder.actualProfessionalServicesCost),
    thirdPartyServices: toAmount(jobOrder.actualThirdPartyServicesCost),
    misc: toAmount(jobOrder.actualMiscCost),
    revenue: toAmount(jobOrder.actualRevenue),
  };

  const budgetTotalCosts = roundCurrency(
    budget.personnel +
      budget.equipment +
      budget.materials +
      budget.professionalServices +
      budget.thirdPartyServices +
      budget.misc
  );
  const actualTotalCosts = roundCurrency(
    actual.personnel +
      actual.equipment +
      actual.materials +
      actual.professionalServices +
      actual.thirdPartyServices +
      actual.misc
  );

  return {
    jobOrder: {
      id: jobOrder.id,
      name: jobOrder.name,
      type: jobOrder.type,
      startDate: jobOrder.startDate?.toISOString().slice(0, 10) ?? "",
      endDate: jobOrder.endDate?.toISOString().slice(0, 10) ?? "",
      status: jobOrder.status,
      description: jobOrder.description ?? "",
      activityCount: jobOrder._count.diaryActivities,
      externalActivityCount: jobOrder._count.externalDiaryActivities,
      createdAt: jobOrder.createdAt.toISOString(),
      updatedAt: jobOrder.updatedAt.toISOString(),
    },
    budget: {
      ...budget,
      totalCosts: budgetTotalCosts,
      grossMargin: roundCurrency(budget.revenue - budgetTotalCosts),
      grossMarginPct: toRatio(budgetTotalCosts, budget.revenue),
    },
    actual: {
      ...actual,
      totalCosts: actualTotalCosts,
      grossMargin: roundCurrency(actual.revenue - actualTotalCosts),
      grossMarginPct: toRatio(actualTotalCosts, actual.revenue),
      personnelDetails: [...personnelMap.values()].sort((a, b) =>
        a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" })
      ),
      equipmentDetails: [...equipmentMap.values()].sort((a, b) =>
        a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" })
      ),
      externalResources: {
        totalDays: totalExternalDays,
        totalEntries: jobOrder._count.externalDiaryActivities,
        details: [...externalResourceMap.values()].sort((a, b) =>
          a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" })
        ),
      },
      importSources: {
        materials: "Import file dedicato",
        professionalServices: "Import file dedicato",
        thirdPartyServices: "Import file dedicato",
        misc: "Import file dedicato",
        revenue: "Import file dedicato",
      },
    },
  };
}
