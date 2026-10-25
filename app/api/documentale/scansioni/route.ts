import { after, NextResponse } from "next/server";
import { ScannedDeliveryNoteStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { preparedScanData, preparePendingScanSuggestions } from "@/lib/scan-suggestions-service";
export const maxDuration = 300;

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const [rows, jobOrders, deliveryNoteSuppliers, costSuppliers] = await Promise.all([
    prisma.scannedDeliveryNote.findMany({
      where: { status: ScannedDeliveryNoteStatus.NEW },
      orderBy: [{ receivedAt: "asc" }, { createdAt: "asc" }],
    }),
    prisma.jobOrder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.deliveryNoteUsage.findMany({
      distinct: ["supplier"],
      orderBy: { supplier: "asc" },
      select: { supplier: true },
    }),
    prisma.costActualEntry.findMany({
      distinct: ["supplierName"],
      where: {
        supplierName: {
          not: null,
        },
      },
      orderBy: { supplierName: "asc" },
      select: { supplierName: true },
    }),
  ]);
  const supplierSuggestions = [
    ...new Set(
      [
        ...costSuppliers.map((item) => item.supplierName ?? ""),
        ...deliveryNoteSuppliers.map((item) => item.supplier),
      ]
        .map((value) => value.trim())
        .filter(Boolean)
    ),
  ].sort((a, b) => a.localeCompare(b, "it", { sensitivity: "base" }));

  if (rows.some(row => row.ocrStatus !== "READY")) after(() => preparePendingScanSuggestions());

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
      ocrStatus: row.ocrStatus,
      suggestions: row.ocrStatus === "READY" ? preparedScanData(row.ocrData)?.suggestions ?? {} : {},
    })),
    jobOrders,
    suppliers: supplierSuggestions,
  });
}
