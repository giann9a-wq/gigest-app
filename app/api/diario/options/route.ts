import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [people, equipment, jobOrders, externalResources] = await Promise.all([
    prisma.person.findMany({
      where: { status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
      },
    }),
    prisma.equipment.findMany({
      where: { status: "ACTIVE" },
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
    prisma.externalResource.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
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
    externalResources,
  });
}
