import { NextRequest, NextResponse } from "next/server";
import { DeliveryNoteValidationStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: NextRequest) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const supplier = request.nextUrl.searchParams.get("supplier")?.trim() || "";
  const jobOrderId = request.nextUrl.searchParams.get("jobOrderId")?.trim() || "";
  const status = request.nextUrl.searchParams.get("status")?.trim() || "";
  const dateFrom = parseDate(request.nextUrl.searchParams.get("dateFrom")?.trim() || "");
  const dateToRaw = parseDate(request.nextUrl.searchParams.get("dateTo")?.trim() || "");
  const dateTo = dateToRaw ? new Date(dateToRaw) : null;
  if (dateTo) {
    dateTo.setUTCHours(23, 59, 59, 999);
  }

  const validationStatus =
    status === DeliveryNoteValidationStatus.PENDING || status === DeliveryNoteValidationStatus.VALIDATED
      ? status
      : undefined;

  const [rows, jobOrders, suppliers] = await Promise.all([
    prisma.deliveryNoteUsage.findMany({
      where: {
        ...(supplier ? { supplier: { contains: supplier, mode: "insensitive" } } : {}),
        ...(jobOrderId ? { jobOrderId } : {}),
        ...(validationStatus ? { validationStatus } : {}),
        ...(dateFrom || dateTo
          ? {
              usageDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ usageDate: "desc" }, { createdAt: "desc" }],
      include: {
        jobOrder: {
          select: { id: true, name: true },
        },
        documents: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
            createdAt: true,
          },
        },
      },
      take: 250,
    }),
    prisma.jobOrder.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.deliveryNoteUsage.findMany({
      distinct: ["supplier"],
      orderBy: { supplier: "asc" },
      select: { supplier: true },
    }),
  ]);

  return NextResponse.json({
    rows: rows.map((row) => ({
      id: row.id,
      jobOrderId: row.jobOrderId,
      jobOrderName: row.jobOrder.name,
      supplier: row.supplier,
      description: row.description,
      usageDate: row.usageDate.toISOString().slice(0, 10),
      validationStatus: row.validationStatus,
      validationStatusLabel:
        row.validationStatus === DeliveryNoteValidationStatus.VALIDATED ? "Validata" : "Da validare",
      validatedAt: row.validatedAt?.toISOString() ?? null,
      documents: row.documents.map((document) => ({
        id: document.id,
        fileName: document.fileName,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        createdAt: document.createdAt.toISOString(),
      })),
    })),
    jobOrders,
    suppliers: suppliers.map((item) => item.supplier).filter(Boolean),
  });
}
