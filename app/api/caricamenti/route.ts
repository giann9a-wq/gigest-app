import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function parseOptionalDate(value: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function getDayEnd(date: Date) {
  return new Date(`${date.toISOString().slice(0, 10)}T23:59:59.999Z`);
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const resourceValue = request.nextUrl.searchParams.get("resourceValue")?.trim() ?? "";
  const jobOrderId = request.nextUrl.searchParams.get("jobOrderId")?.trim() ?? "";
  const fromRaw = request.nextUrl.searchParams.get("from");
  const toRaw = request.nextUrl.searchParams.get("to");

  if (!resourceValue) {
    return NextResponse.json({ rows: [] });
  }

  const [resourceType, resourceId] = resourceValue.split(":");

  if (!resourceType || !resourceId || (resourceType !== "PERSON" && resourceType !== "EQUIPMENT")) {
    return NextResponse.json({ error: "Risorsa non valida" }, { status: 400 });
  }

  const from = parseOptionalDate(fromRaw);
  const to = parseOptionalDate(toRaw);

  if ((fromRaw && !from) || (toRaw && !to)) {
    return NextResponse.json({ error: "Intervallo date non valido" }, { status: 400 });
  }

  if (from && to && from > to) {
    return NextResponse.json(
      { error: "La data iniziale deve essere precedente alla data finale" },
      { status: 400 }
    );
  }

  const rows = await prisma.diaryActivity.findMany({
    where: {
      resourceType,
      personId: resourceType === "PERSON" ? resourceId : undefined,
      equipmentId: resourceType === "EQUIPMENT" ? resourceId : undefined,
      jobOrderId: jobOrderId || undefined,
      referenceDate: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: getDayEnd(to) } : {}),
      },
    },
    orderBy: [{ referenceDate: "desc" }, { createdAt: "desc" }],
    include: {
      person: {
        select: {
          fullName: true,
        },
      },
      equipment: {
        select: {
          nameDescription: true,
        },
      },
      jobOrder: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
  });

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      referenceDate: row.referenceDate.toISOString().slice(0, 10),
      resourceType: row.resourceType,
      personId: row.personId,
      equipmentId: row.equipmentId,
      personLabel: row.person?.fullName ?? "",
      equipmentLabel: row.equipment?.nameDescription ?? "",
      resourceLabel:
        row.resourceType === "PERSON"
          ? row.person?.fullName ?? ""
          : row.equipment?.nameDescription ?? "",
      jobOrderId: row.jobOrderId,
      jobOrderLabel: row.jobOrder.name,
      jobOrderType: row.jobOrder.type,
      hours: Number(row.hours),
      activityDescription: row.activityDescription ?? "",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  });
}
