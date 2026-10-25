import { NextRequest, NextResponse } from "next/server";
import { Prisma, ScannedDeliveryNoteStatus } from "@prisma/client";
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
  const scan = await prisma.scannedDeliveryNote.findUnique({
    where: { id },
    select: { id: true, status: true },
  });

  if (!scan) {
    return NextResponse.json({ error: "Scansione non trovata" }, { status: 404 });
  }

  if (scan.status !== ScannedDeliveryNoteStatus.NEW) {
    return NextResponse.json({ error: "Scansione gia lavorata" }, { status: 409 });
  }

  const rejected = await prisma.scannedDeliveryNote.updateMany({
    where: {
      id,
      status: ScannedDeliveryNoteStatus.NEW,
    },
    data: {
      status: ScannedDeliveryNoteStatus.REJECTED,
      errorMessage: "Rifiutata manualmente",
      ocrStatus: "STOPPED",
      ocrData: Prisma.DbNull,
      ocrError: null,
    },
  });

  if (rejected.count === 0) {
    return NextResponse.json({ error: "Scansione gia lavorata" }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
