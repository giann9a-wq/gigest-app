import { prisma } from "@/lib/prisma";
import { CostActualCategory, Prisma } from "@prisma/client";

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

function roundQuantity(value: number) {
  return Number(value.toFixed(3));
}

function toRatio(costs: number, revenue: number) {
  if (!revenue) return 0;
  return Number((((revenue - costs) / revenue) * 100).toFixed(2));
}

function getCostCategoryLabel(category: CostActualCategory) {
  switch (category) {
    case "MATERIE_PRIME":
      return "Materie Prime";
    case "PRESTAZIONI_PROFESSIONALI":
      return "Prestazioni Professionali";
    case "PRESTAZIONI_TERZI":
      return "Prestazioni Terzi";
    case "SPESE_VARIE":
      return "Spese Varie";
  }
}

function toDecimalNumber(value: Prisma.Decimal | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

async function getCostActualCategoryViews(jobOrderId: string) {
  const entries = await prisma.costActualEntry.findMany({
    where: { jobOrderId },
    orderBy: [
      { category: "asc" },
      { documentDate: "desc" },
      { supplierName: "asc" },
      { createdAt: "desc" },
    ],
    select: {
      id: true,
      category: true,
      amount: true,
      sourceAccountCode: true,
      sourceAccountDescription: true,
      supplierCode: true,
      supplierName: true,
      documentDate: true,
      documentNumber: true,
      descriptionOriginal: true,
      descriptionCustom: true,
      createdAt: true,
    },
  });

  const categoryOrder: CostActualCategory[] = [
    "MATERIE_PRIME",
    "PRESTAZIONI_PROFESSIONALI",
    "PRESTAZIONI_TERZI",
    "SPESE_VARIE",
  ];

  const grouped = new Map<
    CostActualCategory,
    {
      key: CostActualCategory;
      label: string;
      totalAmount: number;
      entryCount: number;
      suppliers: Map<
        string,
        {
          supplierKey: string;
          supplierCode: string;
          supplierName: string;
          totalAmount: number;
          entryCount: number;
          rows: {
            id: string;
            documentDate: string;
            documentNumber: string;
            description: string;
            amount: number;
          }[];
        }
      >;
      rows: {
        id: string;
        supplierCode: string;
        supplierName: string;
        documentDate: string;
        documentNumber: string;
        description: string;
        amount: number;
        sourceAccountCode: string;
        sourceAccountDescription: string;
        createdAt: string;
      }[];
    }
  >();

  for (const category of categoryOrder) {
    grouped.set(category, {
      key: category,
      label: getCostCategoryLabel(category),
      totalAmount: 0,
      entryCount: 0,
      suppliers: new Map(),
      rows: [],
    });
  }

  for (const entry of entries) {
    const categoryBucket = grouped.get(entry.category);
    if (!categoryBucket) continue;

    const amount = toDecimalNumber(entry.amount);
    const supplierCode = entry.supplierCode ?? "";
    const supplierName = entry.supplierName ?? "Fornitore non definito";
    const supplierKey = supplierCode || supplierName.toUpperCase();
    const existingSupplier = categoryBucket.suppliers.get(supplierKey);

    categoryBucket.totalAmount = roundCurrency(categoryBucket.totalAmount + amount);
    categoryBucket.entryCount += 1;
    categoryBucket.rows.push({
      id: entry.id,
      supplierCode,
      supplierName,
      documentDate: entry.documentDate?.toISOString().slice(0, 10) ?? "",
      documentNumber: entry.documentNumber ?? "",
      description: entry.descriptionCustom || entry.descriptionOriginal || "",
      amount,
      sourceAccountCode: entry.sourceAccountCode ?? "",
      sourceAccountDescription: entry.sourceAccountDescription ?? "",
      createdAt: entry.createdAt.toISOString(),
    });

    if (existingSupplier) {
      existingSupplier.totalAmount = roundCurrency(existingSupplier.totalAmount + amount);
      existingSupplier.entryCount += 1;
      existingSupplier.rows.push({
        id: entry.id,
        documentDate: entry.documentDate?.toISOString().slice(0, 10) ?? "",
        documentNumber: entry.documentNumber ?? "",
        description: entry.descriptionCustom || entry.descriptionOriginal || "",
        amount,
      });
    } else {
      categoryBucket.suppliers.set(supplierKey, {
        supplierKey,
        supplierCode,
        supplierName,
        totalAmount: amount,
        entryCount: 1,
        rows: [
          {
            id: entry.id,
            documentDate: entry.documentDate?.toISOString().slice(0, 10) ?? "",
            documentNumber: entry.documentNumber ?? "",
            description: entry.descriptionCustom || entry.descriptionOriginal || "",
            amount,
          },
        ],
      });
    }
  }

  return categoryOrder.map((category) => {
    const bucket = grouped.get(category)!;
    return {
      key: bucket.key,
      label: bucket.label,
      totalAmount: bucket.totalAmount,
      entryCount: bucket.entryCount,
      suppliers: [...bucket.suppliers.values()].sort((a, b) =>
        a.supplierName.localeCompare(b.supplierName, "it", { sensitivity: "base" })
      ),
      rows: bucket.rows,
    };
  });
}

export async function getJobOrderDashboard(jobOrderId: string) {
  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    include: {
      _count: {
        select: {
          diaryActivities: true,
          externalDiaryActivities: true,
          materialUsages: true,
          deliveryNoteUsages: true,
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
      materialUsages: {
        orderBy: [{ usageDate: "desc" }, { createdAt: "desc" }],
      },
      deliveryNoteUsages: {
        orderBy: [{ usageDate: "desc" }, { createdAt: "desc" }],
        include: {
          documents: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
              createdAt: true,
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

  const externalEconomyResourceMap = new Map<
    string,
    {
      resourceId: string;
      resourceLabel: string;
      totalHours: number;
      entryCount: number;
      entries: {
        id: string;
        referenceDate: string;
        hours: number;
        description: string;
      }[];
    }
  >();

  const materialUsageMap = new Map<
    string,
    {
      key: string;
      description: string;
      unitOfMeasure: string;
      totalQuantity: number;
      entryCount: number;
      entries: {
        id: string;
        usageDate: string;
        quantity: number;
      }[];
    }
  >();
  const deliveryNoteUsageMap = new Map<
    string,
    {
      key: string;
      supplier: string;
      entryCount: number;
      entries: {
        id: string;
        usageDate: string;
        description: string;
        documents: {
          id: string;
          fileName: string;
          mimeType: string | null;
          sizeBytes: number | null;
          createdAt: string;
        }[];
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
    if (activity.activityType === "ECONOMY") {
      const hours = roundHours(Number(activity.hours ?? 0));
      const detailEntry = {
        id: activity.id,
        referenceDate: activity.referenceDate.toISOString().slice(0, 10),
        hours,
        description: activity.activityDescription ?? "",
      };
      const resourceId = activity.externalResourceId;
      const resourceLabel = activity.externalResource.name;
      const current = externalEconomyResourceMap.get(resourceId);

      if (current) {
        current.totalHours = roundHours(current.totalHours + hours);
        current.entryCount += 1;
        current.entries.push(detailEntry);
      } else {
        externalEconomyResourceMap.set(resourceId, {
          resourceId,
          resourceLabel,
          totalHours: hours,
          entryCount: 1,
          entries: [detailEntry],
        });
      }

      continue;
    }

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

  for (const material of jobOrder.materialUsages) {
    const description = material.description;
    const unitOfMeasure = material.unitOfMeasure;
    const quantity = roundQuantity(Number(material.quantity));
    const key = `${description.toLocaleLowerCase("it")}::${unitOfMeasure.toLocaleLowerCase("it")}`;
    const current = materialUsageMap.get(key);
    const entry = {
      id: material.id,
      usageDate: material.usageDate.toISOString().slice(0, 10),
      quantity,
    };

    if (current) {
      current.totalQuantity = roundQuantity(current.totalQuantity + quantity);
      current.entryCount += 1;
      current.entries.push(entry);
    } else {
      materialUsageMap.set(key, {
        key,
        description,
        unitOfMeasure,
        totalQuantity: quantity,
        entryCount: 1,
        entries: [entry],
      });
    }
  }

  for (const deliveryNote of jobOrder.deliveryNoteUsages) {
    const supplier = deliveryNote.supplier;
    const key = supplier.toLocaleLowerCase("it");
    const current = deliveryNoteUsageMap.get(key);
    const entry = {
      id: deliveryNote.id,
      usageDate: deliveryNote.usageDate.toISOString().slice(0, 10),
      description: deliveryNote.description,
      documents: deliveryNote.documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        createdAt: document.createdAt.toISOString(),
      })),
    };

    if (current) {
      current.entryCount += 1;
      current.entries.push(entry);
    } else {
      deliveryNoteUsageMap.set(key, {
        key,
        supplier,
        entryCount: 1,
        entries: [entry],
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
      materialUsageCount: jobOrder._count.materialUsages,
      deliveryNoteUsageCount: jobOrder._count.deliveryNoteUsages,
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
        totalEntries: [...externalResourceMap.values()].reduce((sum, item) => sum + item.entryCount, 0),
        details: [...externalResourceMap.values()].sort((a, b) =>
          a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" })
        ),
      },
      externalEconomyResources: {
        totalHours: roundHours([...externalEconomyResourceMap.values()].reduce((sum, item) => sum + item.totalHours, 0)),
        totalEntries: [...externalEconomyResourceMap.values()].reduce((sum, item) => sum + item.entryCount, 0),
        details: [...externalEconomyResourceMap.values()].sort((a, b) =>
          a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" })
        ),
      },
      materialUsages: {
        totalEntries: jobOrder._count.materialUsages,
        details: [...materialUsageMap.values()].sort((a, b) =>
          a.description.localeCompare(b.description, "it", { sensitivity: "base" })
        ),
      },
      deliveryNoteUsages: {
        totalEntries: jobOrder._count.deliveryNoteUsages,
        details: [...deliveryNoteUsageMap.values()].sort((a, b) =>
          a.supplier.localeCompare(b.supplier, "it", { sensitivity: "base" })
        ),
      },
      importSources: {
        materials: "Import costi actual",
        professionalServices: "Import costi actual",
        thirdPartyServices: "Import costi actual",
        misc: "Import costi actual",
        revenue: "Import fatture emesse",
      },
      costCategories: await getCostActualCategoryViews(jobOrder.id),
    },
  };
}

export async function getJobOrderCostActualView(jobOrderId: string) {
  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
    },
  });

  if (!jobOrder) {
    return null;
  }

  const categories = await getCostActualCategoryViews(jobOrderId);

  return {
    jobOrder,
    categories,
  };
}
