import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

function parseDateParam(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function getApplicableCost(
  history: { hourlyCost: unknown; validFrom: Date; validTo: Date | null }[],
  referenceDate: Date
) {
  const matching = history.find((item) => {
    const start = item.validFrom.getTime();
    const end = item.validTo ? item.validTo.getTime() : Number.POSITIVE_INFINITY;
    const current = referenceDate.getTime();
    return current >= start && current <= end;
  });

  if (!matching) return 0;
  return Number(matching.hourlyCost);
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const mode = request.nextUrl.searchParams.get("mode");

  if (mode === "options") {
    const [people, equipment, jobOrders] = await Promise.all([
      prisma.person.findMany({
        orderBy: { fullName: "asc" },
        select: { fullName: true },
      }),
      prisma.equipment.findMany({
        orderBy: { nameDescription: "asc" },
        select: { nameDescription: true },
      }),
      prisma.jobOrder.findMany({
        orderBy: { name: "asc" },
        select: { name: true },
      }),
    ]);

    return NextResponse.json({
      resourceOptions: [
        ...new Set(
          [...people.map((item) => item.fullName), ...equipment.map((item) => item.nameDescription)].filter(Boolean)
        ),
      ],
      jobOrderOptions: [...new Set(jobOrders.map((item) => item.name).filter(Boolean))],
    });
  }

  const fromRaw = request.nextUrl.searchParams.get("from");
  const toRaw = request.nextUrl.searchParams.get("to");
  const from = fromRaw ? parseDateParam(fromRaw, new Date()) : null;
  const to = toRaw ? parseDateParam(toRaw, new Date()) : null;

  if ((fromRaw && !from) || (toRaw && !to)) {
    return NextResponse.json({ error: "Intervallo date non valido" }, { status: 400 });
  }

  if (from && to && from > to) {
    return NextResponse.json({ error: "La data iniziale deve essere precedente alla data finale" }, { status: 400 });
  }

  const activities = await prisma.diaryActivity.findMany({
    where: {
      referenceDate: {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: new Date(`${to.toISOString().slice(0, 10)}T23:59:59.999Z`) } : {}),
      },
    },
    orderBy: [{ referenceDate: "asc" }, { createdAt: "asc" }],
    include: {
      person: {
        select: {
          id: true,
          fullName: true,
          costHistory: {
            orderBy: { validFrom: "desc" },
            select: {
              hourlyCost: true,
              validFrom: true,
              validTo: true,
            },
          },
        },
      },
      equipment: {
        select: {
          id: true,
          nameDescription: true,
          type: true,
          costHistory: {
            orderBy: { validFrom: "desc" },
            select: {
              hourlyCost: true,
              validFrom: true,
              validTo: true,
            },
          },
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

  const aggregation = new Map<
    string,
    {
      resourceLabel: string;
      resourceType: "PERSON" | "EQUIPMENT";
      jobOrderName: string;
      jobOrderType: string;
      totalHours: number;
      totalCost: number;
    }
  >();

  for (const activity of activities) {
    const resourceLabel =
      activity.resourceType === "PERSON"
        ? activity.person?.fullName ?? "Risorsa sconosciuta"
        : activity.equipment?.nameDescription ?? "Risorsa sconosciuta";

    const resourceType = activity.resourceType;
    const key = `${resourceType}:${activity.personId ?? activity.equipmentId}:${activity.jobOrderId}`;

    const hourlyCost =
      activity.resourceType === "PERSON"
        ? getApplicableCost(activity.person?.costHistory ?? [], activity.referenceDate)
        : getApplicableCost(activity.equipment?.costHistory ?? [], activity.referenceDate);

    const totalHours = Number(activity.hours);
    const totalCost = Number((totalHours * hourlyCost).toFixed(2));
    const existing = aggregation.get(key);

    if (existing) {
      existing.totalHours = Number((existing.totalHours + totalHours).toFixed(1));
      existing.totalCost = Number((existing.totalCost + totalCost).toFixed(2));
      continue;
    }

    aggregation.set(key, {
      resourceLabel,
      resourceType,
      jobOrderName: activity.jobOrder.name,
      jobOrderType: activity.jobOrder.type,
      totalHours: Number(totalHours.toFixed(1)),
      totalCost,
    });
  }

  const rows = [...aggregation.values()].sort((a, b) => {
    const byResource = a.resourceLabel.localeCompare(b.resourceLabel, "it", { sensitivity: "base" });
    if (byResource !== 0) return byResource;
    return a.jobOrderName.localeCompare(b.jobOrderName, "it", { sensitivity: "base" });
  });

  return NextResponse.json({
    rows,
    appliedFilters: {
      from: from ? from.toISOString().slice(0, 10) : "",
      to: to ? to.toISOString().slice(0, 10) : "",
    },
  });
}
