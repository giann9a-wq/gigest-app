import { NextRequest, NextResponse } from "next/server";
import { ScannedDeliveryNoteStatus } from "@prisma/client";
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

  await prisma.scannedDeliveryNote.update({
    where: { id },
    data: {
      status: ScannedDeliveryNoteStatus.REJECTED,
      errorMessage: "Rifiutata manualmente",
    },
  });

  return NextResponse.json({ success: true });
}
