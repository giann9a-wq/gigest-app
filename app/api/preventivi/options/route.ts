import { NextRequest, NextResponse } from "next/server";
import { PriceListVersionStatus, ResourceStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const [people, equipment, version] = await Promise.all([
    prisma.person.findMany({ where: { status: ResourceStatus.ACTIVE, roleDescription: { not: null } }, include: { costHistory: { orderBy: { validFrom: "desc" }, take: 1 } } }),
    prisma.equipment.findMany({ where: { status: ResourceStatus.ACTIVE }, include: { costHistory: { orderBy: { validFrom: "desc" }, take: 1 } } }),
    prisma.priceListVersion.findFirst({ where: { status: PriceListVersionStatus.ACTIVE }, orderBy: { importedAt: "desc" } }),
  ]);
  const roleMap = new Map<string, number[]>();
  for (const person of people) {
    const role = person.roleDescription?.trim();
    if (!role) continue;
    const costs = roleMap.get(role) ?? [];
    if (person.costHistory[0]) costs.push(Number(person.costHistory[0].hourlyCost));
    roleMap.set(role, costs);
  }
  const priceItems = version && search.length >= 2 ? await prisma.priceListItem.findMany({
    where: { versionId: version.id, OR: [{ code: { contains: search, mode: "insensitive" } }, { description: { contains: search, mode: "insensitive" } }] },
    orderBy: { code: "asc" }, take: 40,
  }) : [];
  return NextResponse.json({
    roles: [...roleMap.entries()].map(([role, costs]) => ({ role, hourlyCost: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : 0 })),
    equipment: equipment.map((item) => ({ id: item.id, name: item.nameDescription, hourlyCost: Number(item.costHistory[0]?.hourlyCost ?? 0) })),
    priceListVersion: version ? { id: version.id, name: version.name, itemCount: version.itemCount } : null,
    priceItems: priceItems.map((item) => ({ id: item.id, code: item.code, description: item.description, unit: item.unit ?? "", price: Number(item.price), sourceFile: item.sourceFile })),
  });
}
