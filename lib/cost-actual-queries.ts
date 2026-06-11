import { CostActualCategory, Prisma, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const COST_CATEGORY_OPTIONS: CostActualCategory[] = [
  CostActualCategory.MATERIE_PRIME,
  CostActualCategory.PRESTAZIONI_PROFESSIONALI,
  CostActualCategory.PRESTAZIONI_TERZI,
  CostActualCategory.SPESE_VARIE,
];

export type CostActualFilters = {
  supplier: string;
  jobOrderId: string;
  from: string;
  to: string;
  category: CostActualCategory | "";
};

export function getCostCategoryLabel(category: CostActualCategory) {
  switch (category) {
    case CostActualCategory.MATERIE_PRIME:
      return "Materie Prime";
    case CostActualCategory.PRESTAZIONI_PROFESSIONALI:
      return "Prestazioni Professionali";
    case CostActualCategory.PRESTAZIONI_TERZI:
      return "Prestazioni Terzi";
    case CostActualCategory.SPESE_VARIE:
      return "Spese Varie";
  }
}

export function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  if (value == null) return 0;
  return Number(value);
}

export function parseCostFilters(searchParams: URLSearchParams): CostActualFilters {
  const category = String(searchParams.get("category") ?? "").trim() as CostActualCategory | "";

  return {
    supplier: String(searchParams.get("supplier") ?? "").trim(),
    jobOrderId: String(searchParams.get("jobOrderId") ?? "").trim(),
    from: String(searchParams.get("from") ?? "").trim(),
    to: String(searchParams.get("to") ?? "").trim(),
    category: COST_CATEGORY_OPTIONS.includes(category as CostActualCategory) ? category : "",
  };
}

function parseDateFilter(value: string, endOfDay = false) {
  if (!value) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function buildCostWhere(filters: CostActualFilters, forcedJobOrderId?: string) {
  const where: Prisma.CostActualEntryWhereInput = {};
  const jobOrderId = forcedJobOrderId || filters.jobOrderId;
  const fromDate = parseDateFilter(filters.from);
  const toDate = parseDateFilter(filters.to, true);

  if (jobOrderId) {
    where.jobOrderId = jobOrderId;
  }

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.supplier) {
    where.OR = [
      { supplierName: { contains: filters.supplier, mode: "insensitive" } },
      { supplierCode: { contains: filters.supplier, mode: "insensitive" } },
    ];
  }

  if (fromDate || toDate) {
    where.documentDate = {
      ...(fromDate ? { gte: fromDate } : {}),
      ...(toDate ? { lte: toDate } : {}),
    };
  }

  return where;
}

export async function assertActiveUser(email: string) {
  const appUser = await prisma.user.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, status: true, role: true },
  });

  return appUser && appUser.status === UserStatus.ACTIVE ? appUser : null;
}

export async function getCostActualRows(filters: CostActualFilters, forcedJobOrderId?: string) {
  const rows = await prisma.costActualEntry.findMany({
    where: buildCostWhere(filters, forcedJobOrderId),
    orderBy: [
      { documentDate: "desc" },
      { jobOrder: { name: "asc" } },
      { supplierName: "asc" },
      { createdAt: "desc" },
    ],
    include: {
      jobOrder: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    jobOrderId: row.jobOrderId,
    jobOrderName: row.jobOrder.name,
    category: row.category,
    categoryLabel: getCostCategoryLabel(row.category),
    supplierCode: row.supplierCode ?? "",
    supplierName: row.supplierName ?? "",
    documentDate: row.documentDate?.toISOString().slice(0, 10) ?? "",
    documentNumber: row.documentNumber ?? "",
    description: row.descriptionCustom || row.descriptionOriginal || "",
    amount: decimalToNumber(row.amount),
    sourceAccountCode: row.sourceAccountCode ?? "",
    sourceAccountDescription: row.sourceAccountDescription ?? "",
    createdAt: row.createdAt.toISOString(),
  }));
}

