import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveAppUser } from "@/lib/app-user";
import { UserRole } from "@prisma/client";

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [people, equipment, jobOrders] = await Promise.all([
    prisma.person.findMany({
      orderBy: { fullName: "asc" },
      select: {
        id: true,
        fullName: true,
        status: true,
      },
    }),
    prisma.equipment.findMany({
      orderBy: { nameDescription: "asc" },
      select: {
        id: true,
        nameDescription: true,
        type: true,
        status: true,
      },
    }),
    prisma.jobOrder.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
      },
    }),
  ]);

  return NextResponse.json({
    canManageLoadings: appUser.role === UserRole.ADMIN,
    resources: [
      ...people.map((person) => ({
        value: `PERSON:${person.id}`,
        label: `👷 ${person.fullName}`,
        type: "PERSON",
        status: person.status,
      })),
      ...equipment.map((item) => ({
        value: `EQUIPMENT:${item.id}`,
        label: `🚜 ${item.nameDescription}`,
        type: "EQUIPMENT",
        status: item.status,
      })),
    ],
    jobOrders: jobOrders.map((jobOrder) => ({
      id: jobOrder.id,
      name: jobOrder.name,
      type: jobOrder.type,
      status: jobOrder.status,
    })),
  });
}
