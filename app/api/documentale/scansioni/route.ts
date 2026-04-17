import { NextResponse } from "next/server";
import { ScannedDeliveryNoteStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [rows, jobOrders] = await Promise.all([
    prisma.scannedDeliveryNote.findMany({
      where: { status: ScannedDeliveryNoteStatus.NEW },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.jobOrder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
  ]);

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      fromEmail: row.fromEmail,
      subject: row.subject,
      fileName: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      status: row.status,
      statusLabel: "Nuova",
      receivedAt: row.receivedAt.toISOString(),
      importedAt: row.importedAt.toISOString(),
    })),
    jobOrders,
  });
}
