import { NextResponse } from "next/server";
import { PriceListVersionStatus, ResourcePriceListKind } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { syncRegisteredResourcePrices } from "@/lib/resource-price-list";

export async function GET() {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  await syncRegisteredResourcePrices();
  const [roles, equipment, version] = await Promise.all([
    prisma.resourcePriceListItem.findMany({
      where: { kind: ResourcePriceListKind.PERSON_ROLE, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.resourcePriceListItem.findMany({
      where: { kind: ResourcePriceListKind.EQUIPMENT, active: true },
      orderBy: { name: "asc" },
    }),
    prisma.priceListVersion.findFirst({
      where: { status: PriceListVersionStatus.ACTIVE },
      orderBy: { importedAt: "desc" },
    }),
  ]);
  return NextResponse.json({
    roles: roles.map((item) => ({ role: item.name, hourlyCost: Number(item.hourlyPrice) })),
    equipment: equipment.map((item) => ({ id: item.equipmentId ?? item.id, name: item.name, hourlyCost: Number(item.hourlyPrice) })),
    priceListVersion: version ? { id: version.id, name: version.name, itemCount: version.itemCount } : null,
  });
}
