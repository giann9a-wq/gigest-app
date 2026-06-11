import { NextRequest, NextResponse } from "next/server";
import { DeliveryNoteValidationStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = await request.json();
  const rawIds: unknown[] = Array.isArray(body.ids) ? body.ids : [];
  const ids = rawIds.length > 0
    ? [...new Set(rawIds.map((id: unknown) => String(id ?? "").trim()).filter(Boolean))]
    : [];

  if (ids.length === 0) {
    return NextResponse.json({ error: "Seleziona almeno una bolla da validare" }, { status: 400 });
  }

  const result = await prisma.deliveryNoteUsage.updateMany({
    where: {
      id: { in: ids },
      validationStatus: DeliveryNoteValidationStatus.PENDING,
    },
    data: {
      validationStatus: DeliveryNoteValidationStatus.VALIDATED,
      validatedAt: new Date(),
      validatedByUserId: appUser.id,
      updatedByUserId: appUser.id,
    },
  });

  return NextResponse.json({
    success: true,
    validatedCount: result.count,
    requestedCount: ids.length,
  });
}
