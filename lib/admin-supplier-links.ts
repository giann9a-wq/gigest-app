import { prisma } from "@/lib/prisma";

const LEGAL_SUFFIXES = new Set([
  "srl",
  "s.r.l",
  "spa",
  "s.p.a",
  "snc",
  "s.n.c",
  "sas",
  "s.a.s",
  "soc",
  "coop",
  "cooperativa",
]);

function normalizeSupplierName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !LEGAL_SUFFIXES.has(token))
    .join(" ")
    .trim();
}

function looksLikeTechnicalId(value: string) {
  return /^c[a-z0-9]{18,}$/i.test(value.trim());
}

function levenshtein(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }

  return previous[b.length];
}

function similarityScore(left: string, right: string) {
  const a = normalizeSupplierName(left);
  const b = normalizeSupplierName(right);
  if (!a || !b || a === b) return a === b ? 1 : 0;
  if (a.includes(b) || b.includes(a)) return 0.92;

  const distance = levenshtein(a, b);
  const maxLength = Math.max(a.length, b.length);
  return maxLength === 0 ? 0 : 1 - distance / maxLength;
}

function isSimilarSupplier(left: string, right: string) {
  const a = normalizeSupplierName(left);
  const b = normalizeSupplierName(right);
  if (!a || !b) return false;
  if (a === b) return false;

  const distance = levenshtein(a, b);
  return a.includes(b) || b.includes(a) || distance <= 3 || similarityScore(left, right) >= 0.72;
}

export type SupplierLinkSuggestion = {
  externalResourceId: string;
  externalResourceName: string;
  usageCount: number;
  candidates: Array<{
    supplierName: string;
    sourceCount: number;
    score: number;
  }>;
};

export type SupplierLinkOption = {
  value: string;
  label: string;
  count: number;
};

function buildSupplierStats(
  supplierNames: Array<string | null>
): Array<{ supplierName: string; sourceCount: number }> {
  const supplierStats = new Map<string, { supplierName: string; sourceCount: number }>();

  for (const supplierName of supplierNames) {
    const name = supplierName?.trim();
    if (!name) continue;
    const key = normalizeSupplierName(name) || name.toLocaleLowerCase("it");
    const current = supplierStats.get(key);
    if (current) {
      current.sourceCount += 1;
      if (name.length > current.supplierName.length) current.supplierName = name;
    } else {
      supplierStats.set(key, { supplierName: name, sourceCount: 1 });
    }
  }

  return [...supplierStats.values()];
}

async function resolveSupplierDisplayName(input: string) {
  const clean = input.trim();
  if (!clean) return clean;

  const linkedExternal = await prisma.externalResource.findUnique({
    where: { id: clean },
    select: { name: true },
  });
  if (linkedExternal?.name) return linkedExternal.name;

  const [actualEntry, stagingRow, correctionRule] = await Promise.all([
    prisma.costActualEntry.findFirst({
      where: {
        OR: [
          { supplierName: { equals: clean, mode: "insensitive" } },
          { supplierCode: { equals: clean, mode: "insensitive" } },
        ],
        supplierName: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { supplierName: true },
    }),
    prisma.costImportRowStaging.findFirst({
      where: {
        OR: [
          { supplierName: { equals: clean, mode: "insensitive" } },
          { supplierCode: { equals: clean, mode: "insensitive" } },
        ],
        supplierName: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { supplierName: true },
    }),
    prisma.costImportCorrectionRule.findFirst({
      where: {
        OR: [
          { supplierName: { equals: clean, mode: "insensitive" } },
          { supplierCode: { equals: clean, mode: "insensitive" } },
        ],
        supplierName: { not: null },
      },
      orderBy: { updatedAt: "desc" },
      select: { supplierName: true },
    }),
  ]);

  return actualEntry?.supplierName ?? stagingRow?.supplierName ?? correctionRule?.supplierName ?? clean;
}

export async function findSupplierLinkSuggestions(limit = 20): Promise<SupplierLinkSuggestion[]> {
  const [externalResources, costActualSuppliers, costStagingSuppliers, costCorrectionSuppliers] =
    await Promise.all([
      prisma.externalResource.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              diaryActivities: true,
            },
          },
        },
      }),
      prisma.costActualEntry.findMany({
        where: { supplierName: { not: null } },
        select: { supplierName: true },
      }),
      prisma.costImportRowStaging.findMany({
        where: { supplierName: { not: null } },
        select: { supplierName: true },
      }),
      prisma.costImportCorrectionRule.findMany({
        where: { supplierName: { not: null } },
        select: { supplierName: true },
      }),
    ]);

  const supplierStats = buildSupplierStats([
    ...costActualSuppliers.map((item) => item.supplierName),
    ...costStagingSuppliers.map((item) => item.supplierName),
    ...costCorrectionSuppliers.map((item) => item.supplierName),
  ]);

  return externalResources
    .filter((resource) => !looksLikeTechnicalId(resource.name))
    .map((resource) => {
      const candidates = supplierStats
        .filter((supplier) => isSimilarSupplier(resource.name, supplier.supplierName))
        .map((supplier) => ({
          supplierName: supplier.supplierName,
          sourceCount: supplier.sourceCount,
          score: similarityScore(resource.name, supplier.supplierName),
        }))
        .sort(
          (a, b) =>
            b.score - a.score ||
            b.sourceCount - a.sourceCount ||
            a.supplierName.localeCompare(b.supplierName, "it", { sensitivity: "base" })
        )
        .slice(0, 5);

      return {
        externalResourceId: resource.id,
        externalResourceName: resource.name,
        usageCount: resource._count.diaryActivities,
        candidates,
      };
    })
    .filter((suggestion) => suggestion.candidates.length > 0)
    .sort(
      (a, b) =>
        b.usageCount - a.usageCount ||
        a.externalResourceName.localeCompare(b.externalResourceName, "it", { sensitivity: "base" })
    )
    .slice(0, limit);
}

export async function listManualSupplierLinkOptions(): Promise<{
  externalResources: SupplierLinkOption[];
  costSuppliers: SupplierLinkOption[];
}> {
  const [externalResources, costActualSuppliers, costStagingSuppliers, costCorrectionSuppliers] =
    await Promise.all([
      prisma.externalResource.findMany({
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          _count: {
            select: {
              diaryActivities: true,
            },
          },
        },
      }),
      prisma.costActualEntry.findMany({
        where: { supplierName: { not: null } },
        select: { supplierName: true },
      }),
      prisma.costImportRowStaging.findMany({
        where: { supplierName: { not: null } },
        select: { supplierName: true },
      }),
      prisma.costImportCorrectionRule.findMany({
        where: { supplierName: { not: null } },
        select: { supplierName: true },
      }),
    ]);

  const supplierStats = buildSupplierStats([
    ...costActualSuppliers.map((item) => item.supplierName),
    ...costStagingSuppliers.map((item) => item.supplierName),
    ...costCorrectionSuppliers.map((item) => item.supplierName),
  ]);
  const originalSupplierKeys = new Set(supplierStats.map((supplier) => normalizeSupplierName(supplier.supplierName)));

  return {
    externalResources: externalResources
      .filter((resource) => !looksLikeTechnicalId(resource.name))
      .filter((resource) => !originalSupplierKeys.has(normalizeSupplierName(resource.name)))
      .map((resource) => ({
        value: resource.id,
        label: resource.name,
        count: resource._count.diaryActivities,
      })),
    costSuppliers: supplierStats
      .map((supplier) => ({
        value: supplier.supplierName,
        label: supplier.supplierName,
        count: supplier.sourceCount,
      }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          a.label.localeCompare(b.label, "it", { sensitivity: "base" })
      ),
  };
}

export async function linkExternalResourceToSupplier(externalResourceId: string, supplierName: string) {
  const cleanSupplierName = await resolveSupplierDisplayName(supplierName);
  if (!externalResourceId || !cleanSupplierName) {
    throw new Error("Risorsa esterna e fornitore sono obbligatori.");
  }

  const source = await prisma.externalResource.findUnique({
    where: { id: externalResourceId },
    select: { id: true, name: true },
  });

  if (!source) {
    throw new Error("Risorsa esterna non trovata.");
  }

  const target = await prisma.externalResource.findFirst({
    where: {
      name: {
        equals: cleanSupplierName,
        mode: "insensitive",
      },
    },
    select: { id: true, name: true },
  });

  if (!target || target.id === source.id) {
    await prisma.externalResource.update({
      where: { id: source.id },
      data: { name: cleanSupplierName },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.externalDiaryActivity.updateMany({
      where: { externalResourceId: source.id },
      data: { externalResourceId: target.id },
    });
    await tx.externalResource.delete({
      where: { id: source.id },
    });
  });
}
