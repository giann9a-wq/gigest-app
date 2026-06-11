import { prisma } from "@/lib/prisma";

export async function getImportDomain() {
  const [people, equipment, jobOrders] = await Promise.all([
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
  ]);

  return {
    resources: [
      ...people.map((person) => ({
        value: `PERSON:${person.id}`,
        label: person.fullName,
        type: "PERSON" as const,
      })),
      ...equipment.map((item) => ({
        value: `EQUIPMENT:${item.id}`,
        label: item.nameDescription,
        type: "EQUIPMENT" as const,
      })),
    ],
    jobOrders: jobOrders.map((jobOrder) => ({
      id: jobOrder.id,
      name: jobOrder.name,
      type: jobOrder.type,
    })),
  };
}
