import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { EquipmentType, Prisma, ResourceStatus, UserStatus } from "@prisma/client";

type EquipmentRowInput = {
  id?: string;
  nameDescription?: string;
  type?: EquipmentType | string;
  purchaseDate?: string;
  status?: ResourceStatus | string;
  isVisibleInDiary?: boolean;
  hourlyCost?: number | string | null;
};

const allowedTypes: EquipmentType[] = ["VEHICLE", "EQUIPMENT"];
const allowedStatuses: ResourceStatus[] = ["ACTIVE", "SUSPENDED", "ENDED"];

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const items = await prisma.equipment.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      costHistory: {
        orderBy: { validFrom: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    rows: items.map((item) => ({
      id: item.id,
      nameDescription: item.nameDescription,
      type: item.type,
      purchaseDate: toInputDate(item.purchaseDate),
      status: item.status,
      isVisibleInDiary: item.isVisibleInDiary,
      hourlyCost:
        item.costHistory.length > 0 ? Number(item.costHistory[0].hourlyCost) : "",
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const body = await request.json();
  const rows = body.rows as EquipmentRowInput[] | undefined;

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Le righe devono essere un array" }, { status: 400 });
  }

  const cleanedRows = rows
    .map((row) => ({
      id: row.id?.trim() || undefined,
      nameDescription: row.nameDescription?.trim() || "",
      type: (row.type || "") as EquipmentType | "",
      purchaseDate: row.purchaseDate || "",
      status: (row.status || "") as ResourceStatus | "",
      isVisibleInDiary: row.isVisibleInDiary ?? true,
      hourlyCost:
        row.hourlyCost === "" || row.hourlyCost === null || row.hourlyCost === undefined
          ? ""
          : String(row.hourlyCost),
    }))
    .filter((row) => {
      return row.nameDescription || row.type || row.purchaseDate || row.status || row.hourlyCost;
    });

  for (const row of cleanedRows) {
    if (!row.nameDescription) {
      return NextResponse.json({ error: "Nome mezzo obbligatorio" }, { status: 400 });
    }

    if (!allowedTypes.includes(row.type as EquipmentType)) {
      return NextResponse.json({ error: "Tipo non valido" }, { status: 400 });
    }

    if (!allowedStatuses.includes(row.status as ResourceStatus)) {
      return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.equipment.findMany({
      select: { id: true },
    });

    const incomingIds = new Set(cleanedRows.filter((r) => r.id).map((r) => r.id!));
    const idsToDelete = existing.map((x) => x.id).filter((id) => !incomingIds.has(id));

    if (idsToDelete.length > 0) {
      const linked = await tx.diaryActivity.count({
        where: { equipmentId: { in: idsToDelete } },
      });

      if (linked > 0) {
        throw new Error("Non puoi eliminare mezzi usati nel diario");
      }

      await tx.equipment.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    for (const row of cleanedRows) {
      let equipmentId = row.id;

      if (row.id) {
        await tx.equipment.update({
          where: { id: row.id },
          data: {
            nameDescription: row.nameDescription,
            type: row.type as EquipmentType,
            purchaseDate: parseOptionalDate(row.purchaseDate),
            status: row.status as ResourceStatus,
            isVisibleInDiary: row.isVisibleInDiary,
          },
        });
      } else {
        const created = await tx.equipment.create({
          data: {
            nameDescription: row.nameDescription,
            type: row.type as EquipmentType,
            purchaseDate: parseOptionalDate(row.purchaseDate),
            status: row.status as ResourceStatus,
            isVisibleInDiary: row.isVisibleInDiary,
          },
        });
        equipmentId = created.id;
      }

      if (equipmentId && row.hourlyCost !== "") {
        const parsedCost = Number(row.hourlyCost);

        const latestCost = await tx.equipmentCost.findFirst({
          where: { equipmentId },
          orderBy: { validFrom: "desc" },
        });

        const latestValue = latestCost ? Number(latestCost.hourlyCost) : null;

        if (latestValue === null || latestValue !== parsedCost) {
          await tx.equipmentCost.create({
            data: {
              equipmentId,
              hourlyCost: new Prisma.Decimal(parsedCost.toFixed(2)),
              validFrom: new Date(),
            },
          });
        }
      }
    }
  });

  return NextResponse.json({ success: true });
}
