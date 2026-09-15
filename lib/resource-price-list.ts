import { Prisma, ResourcePriceListKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export function normalizeResourcePriceName(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("it-IT");
}

export async function syncRegisteredResourcePrices() {
  const [people, equipment, existing] = await Promise.all([
    prisma.person.findMany({
      where: { roleDescription: { not: null } },
      select: {
        roleDescription: true,
        costHistory: { orderBy: { validFrom: "desc" }, take: 1, select: { hourlyCost: true } },
      },
    }),
    prisma.equipment.findMany({
      select: {
        id: true,
        nameDescription: true,
        costHistory: { orderBy: { validFrom: "desc" }, take: 1, select: { hourlyCost: true } },
      },
    }),
    prisma.resourcePriceListItem.findMany(),
  ]);

  const existingByKey = new Map(existing.map((item) => [`${item.kind}:${item.normalizedName}`, item]));
  const existingByEquipment = new Map(existing.filter((item) => item.equipmentId).map((item) => [item.equipmentId!, item]));
  const roleCosts = new Map<string, { name: string; costs: number[] }>();

  for (const person of people) {
    const name = person.roleDescription?.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const normalizedName = normalizeResourcePriceName(name);
    const entry = roleCosts.get(normalizedName) ?? { name, costs: [] };
    if (person.costHistory[0]) entry.costs.push(Number(person.costHistory[0].hourlyCost));
    roleCosts.set(normalizedName, entry);
  }

  const creates: Prisma.ResourcePriceListItemCreateManyInput[] = [];
  for (const [normalizedName, entry] of roleCosts) {
    if (existingByKey.has(`${ResourcePriceListKind.PERSON_ROLE}:${normalizedName}`)) continue;
    const initialPrice = entry.costs.length ? entry.costs.reduce((sum, cost) => sum + cost, 0) / entry.costs.length : 0;
    creates.push({
      kind: ResourcePriceListKind.PERSON_ROLE,
      name: entry.name,
      normalizedName,
      hourlyPrice: new Prisma.Decimal(initialPrice.toFixed(2)),
    });
  }

  for (const item of equipment) {
    const name = item.nameDescription.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const linked = existingByEquipment.get(item.id);
    if (linked) {
      const normalizedName = normalizeResourcePriceName(name);
      if (linked.name !== name || linked.normalizedName !== normalizedName) {
        await prisma.resourcePriceListItem.update({ where: { id: linked.id }, data: { name, normalizedName } });
      }
      continue;
    }
    const normalizedName = normalizeResourcePriceName(name);
    if (existingByKey.has(`${ResourcePriceListKind.EQUIPMENT}:${normalizedName}`)) continue;
    creates.push({
      kind: ResourcePriceListKind.EQUIPMENT,
      name,
      normalizedName,
      equipmentId: item.id,
      hourlyPrice: new Prisma.Decimal(Number(item.costHistory[0]?.hourlyCost ?? 0).toFixed(2)),
    });
  }

  if (creates.length) await prisma.resourcePriceListItem.createMany({ data: creates, skipDuplicates: true });
}
