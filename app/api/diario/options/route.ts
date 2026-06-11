import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function buildSupplierSuggestions(
  supplierNames: string[],
  externalNames: string[],
  usageNames: string[]
) {
  const stats = new Map<string, { name: string; usageCount: number; sourceRank: number }>();

  function addName(value: string | null | undefined, usageCount: number, sourceRank: number) {
    const name = value?.trim();
    if (!name) return;
    const key = name.toLocaleLowerCase("it");
    const current = stats.get(key);

    if (!current) {
      stats.set(key, { name, usageCount, sourceRank });
      return;
    }

    current.usageCount += usageCount;
    current.sourceRank = Math.min(current.sourceRank, sourceRank);
    if (name.length > current.name.length) current.name = name;
  }

  supplierNames.forEach((name) => addName(name, 0, 0));
  externalNames.forEach((name) => addName(name, 0, 1));
  usageNames.forEach((name) => addName(name, 1, 2));

  return [...stats.values()]
    .sort(
      (a, b) =>
        b.usageCount - a.usageCount ||
        a.sourceRank - b.sourceRank ||
        a.name.localeCompare(b.name, "it", { sensitivity: "base" })
    )
    .map((item) => ({ id: item.name, name: item.name, usageCount: item.usageCount }));
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [
    people,
    equipment,
    jobOrders,
    costSuppliers,
    costStagingSuppliers,
    costCorrectionSuppliers,
    externalResources,
    externalActivityResources,
  ] = await Promise.all([
    prisma.person.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
      },
    }),
    prisma.equipment.findMany({
      where: { status: "ACTIVE", isVisibleInDiary: true },
      orderBy: { nameDescription: "asc" },
      select: {
        id: true,
        nameDescription: true,
        type: true,
      },
    }),
    prisma.jobOrder.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
      },
    }),
    prisma.costActualEntry.findMany({
      distinct: ["supplierName"],
      where: { supplierName: { not: null } },
      orderBy: { supplierName: "asc" },
      select: { supplierName: true },
    }),
    prisma.costImportRowStaging.findMany({
      distinct: ["supplierName"],
      where: { supplierName: { not: null } },
      orderBy: { supplierName: "asc" },
      select: { supplierName: true },
    }),
    prisma.costImportCorrectionRule.findMany({
      distinct: ["supplierName"],
      where: { supplierName: { not: null } },
      orderBy: { supplierName: "asc" },
      select: { supplierName: true },
    }),
    prisma.externalResource.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    }),
    prisma.externalDiaryActivity.findMany({
      select: {
        externalResource: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  const resources = [
    ...people.map((person) => ({
      value: `PERSON:${person.id}`,
      label: `👷 ${person.fullName}`,
      type: "PERSON",
    })),
    ...equipment.map((item) => ({
      value: `EQUIPMENT:${item.id}`,
      label: `🚜 ${item.nameDescription}`,
      type: "EQUIPMENT",
    })),
  ];

  return NextResponse.json({
    resources,
    jobOrders,
    externalResources: buildSupplierSuggestions(
      [
        ...costSuppliers.map((item) => item.supplierName ?? ""),
        ...costStagingSuppliers.map((item) => item.supplierName ?? ""),
        ...costCorrectionSuppliers.map((item) => item.supplierName ?? ""),
      ],
      externalResources.map((item) => item.name),
      externalActivityResources.map((item) => item.externalResource.name)
    ),
  });
}
