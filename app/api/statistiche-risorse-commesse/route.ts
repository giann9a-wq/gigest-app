import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getEffectiveResourceHourlyCost } from "@/lib/resource-economics";
import { Prisma } from "@prisma/client";

function parseDateParam(value: string | null, fallback: Date) {
  if (!value) return fallback;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
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
        where: { status: "ACTIVE", isVisibleInDiary: true },
        orderBy: { nameDescription: "asc" },
        select: { nameDescription: true },
      }),
      prisma.jobOrder.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
    ]);

    return NextResponse.json({
      resourceOptions: [
        ...new Set(
          [...people.map((item) => item.fullName), ...equipment.map((item) => item.nameDescription)].filter(Boolean)
        ),
      ],
      jobOrderOptions: [...new Set(jobOrders.map((item) => item.name).filter(Boolean))],
      jobOrderRows: jobOrders,
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
      activities: Array<{
        id: string;
        referenceDate: string;
        source: "MANUAL" | "AUTO";
        jobOrderId: string;
        jobOrderName: string;
        hours: number;
      }>;
    }
  >();

  for (const activity of activities) {
    const resourceLabel =
      activity.resourceType === "PERSON"
        ? activity.person?.fullName ?? "Risorsa sconosciuta"
        : activity.equipment?.nameDescription ?? "Risorsa sconosciuta";

    const resourceType = activity.resourceType;
    const key = `${resourceType}:${activity.personId ?? activity.equipmentId}:${activity.jobOrderId}`;

    const hourlyCost = getEffectiveResourceHourlyCost({
      resourceType: activity.resourceType,
      jobType: activity.jobOrder.type,
      costHistory:
        activity.resourceType === "PERSON"
          ? activity.person?.costHistory ?? []
          : activity.equipment?.costHistory ?? [],
      referenceDate: activity.referenceDate,
    });

    const totalHours = Number(activity.hours);
    const totalCost = Number((totalHours * hourlyCost).toFixed(2));
    const activityRow = {
      id: activity.id,
      referenceDate: activity.referenceDate.toISOString().slice(0, 10),
      source: activity.source as "MANUAL" | "AUTO",
      jobOrderId: activity.jobOrderId,
      jobOrderName: activity.jobOrder.name,
      hours: totalHours,
    };
    const existing = aggregation.get(key);

    if (existing) {
      existing.totalHours = Number((existing.totalHours + totalHours).toFixed(1));
      existing.totalCost = Number((existing.totalCost + totalCost).toFixed(2));
      existing.activities.push(activityRow);
      continue;
    }

    aggregation.set(key, {
      resourceLabel,
      resourceType,
      jobOrderName: activity.jobOrder.name,
      jobOrderType: activity.jobOrder.type,
      totalHours: Number(totalHours.toFixed(1)),
      totalCost,
      activities: [activityRow],
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

export async function PATCH(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const activityId = String(body.activityId ?? "").trim();
  const jobOrderId = String(body.jobOrderId ?? "").trim();
  const referenceDate = String(body.referenceDate ?? "").trim();
  const hours = Number(body.hours ?? "");

  if (!activityId || !jobOrderId || !referenceDate || Number.isNaN(hours) || hours <= 0) {
    return NextResponse.json({ error: "Dati caricamento non validi" }, { status: 400 });
  }

  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: jobOrderId },
    select: { id: true },
  });

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non valida" }, { status: 400 });
  }

  await prisma.diaryActivity.update({
    where: { id: activityId },
    data: {
      jobOrderId,
      referenceDate: new Date(`${referenceDate}T00:00:00.000Z`),
      hours: new Prisma.Decimal((Math.round(hours * 10) / 10).toFixed(1)),
    },
  });

  return NextResponse.json({ success: true });
}
