import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, UserRole, UserStatus } from "@prisma/client";

function parseRequiredDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

async function getAuthorizedUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true, role: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return { error: NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 }) };
  }

  return { appUser };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  if (authResult.appUser.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Funzione riservata agli admin" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();

  const referenceDateRaw = String(body.referenceDate ?? "").trim();
  const jobOrderId = String(body.jobOrderId ?? "").trim();
  const activityDescription = String(body.activityDescription ?? "").trim();
  const hoursValue = Number(body.hours);

  if (!referenceDateRaw) {
    return NextResponse.json({ error: "La data è obbligatoria" }, { status: 400 });
  }

  if (!jobOrderId) {
    return NextResponse.json({ error: "La commessa è obbligatoria" }, { status: 400 });
  }

  if (Number.isNaN(hoursValue) || hoursValue <= 0) {
    return NextResponse.json({ error: "Le ore devono essere maggiori di zero" }, { status: 400 });
  }

  const referenceDate = parseRequiredDate(referenceDateRaw);
  if (!referenceDate) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }

  const existing = await prisma.diaryActivity.findUnique({
    where: { id },
    select: {
      id: true,
      resourceType: true,
      personId: true,
      equipmentId: true,
    },
  });

  if (
    !existing ||
    (existing.resourceType === "PERSON" && !existing.personId) ||
    (existing.resourceType === "EQUIPMENT" && !existing.equipmentId)
  ) {
    return NextResponse.json({ error: "Caricamento non trovato" }, { status: 404 });
  }

  const updated = await prisma.diaryActivity.update({
    where: { id },
    data: {
      referenceDate,
      jobOrderId,
      hours: new Prisma.Decimal((Math.round(hoursValue * 10) / 10).toFixed(1)),
      activityDescription: activityDescription || null,
      updatedByUserId: authResult.appUser.id,
    },
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
    success: true,
    row: {
      id: updated.id,
      referenceDate: updated.referenceDate.toISOString().slice(0, 10),
      resourceType: updated.resourceType,
      personId: updated.personId,
      equipmentId: updated.equipmentId,
      personLabel: updated.person?.fullName ?? "",
      equipmentLabel: updated.equipment?.nameDescription ?? "",
      resourceLabel:
        updated.resourceType === "PERSON"
          ? updated.person?.fullName ?? ""
          : updated.equipment?.nameDescription ?? "",
      jobOrderId: updated.jobOrderId,
      jobOrderLabel: updated.jobOrder.name,
      jobOrderType: updated.jobOrder.type,
      hours: Number(updated.hours),
      activityDescription: updated.activityDescription ?? "",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  if (authResult.appUser.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Funzione riservata agli admin" }, { status: 403 });
  }

  const { id } = await context.params;

  const existing = await prisma.diaryActivity.findUnique({
    where: { id },
    select: {
      id: true,
      resourceType: true,
    },
  });

  if (!existing || (existing.resourceType !== "PERSON" && existing.resourceType !== "EQUIPMENT")) {
    return NextResponse.json({ error: "Caricamento non trovato" }, { status: 404 });
  }

  await prisma.diaryActivity.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
