import { NextRequest, NextResponse } from "next/server";
import { DeliveryNoteValidationStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;
  const existing = await prisma.deliveryNoteUsage.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Bolla non trovata" }, { status: 404 });
  }

  const row = await prisma.deliveryNoteUsage.update({
    where: { id },
    data: {
      validationStatus: DeliveryNoteValidationStatus.VALIDATED,
      validatedAt: new Date(),
      validatedByUserId: appUser.id,
      updatedByUserId: appUser.id,
    },
  });

  return NextResponse.json({
    success: true,
    row: {
      id: row.id,
      validationStatus: row.validationStatus,
      validationStatusLabel: "Validata",
      validatedAt: row.validatedAt?.toISOString() ?? null,
    },
  });
}
