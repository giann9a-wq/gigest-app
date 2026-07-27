import { NextRequest, NextResponse } from "next/server";
import {
  DeliveryNoteValidationStatus,
  ScannedDeliveryNoteStatus,
} from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

function parseDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const jobOrderId = String(body.jobOrderId ?? "").trim();
  const usageDateRaw = String(body.usageDate ?? "").trim();
  const supplier = String(body.supplier ?? "").trim();
  const description = String(body.description ?? "").trim();

  if (!jobOrderId || !usageDateRaw || !supplier || !description) {
    return NextResponse.json({ error: "Compila tutti i campi obbligatori" }, { status: 400 });
  }

  const usageDate = parseDate(usageDateRaw);
  if (!usageDate) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }

  const [scan, jobOrder] = await Promise.all([
    prisma.scannedDeliveryNote.findUnique({ where: { id } }),
    prisma.jobOrder.findUnique({ where: { id: jobOrderId }, select: { id: true } }),
  ]);

  if (!scan) {
    return NextResponse.json({ error: "Scansione non trovata" }, { status: 404 });
  }

  if (scan.status !== ScannedDeliveryNoteStatus.NEW) {
    return NextResponse.json({ error: "Scansione gia inserita" }, { status: 409 });
  }

  if (!jobOrder) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.scannedDeliveryNote.updateMany({
      where: {
        id: scan.id,
        status: ScannedDeliveryNoteStatus.NEW,
      },
      data: {
        status: ScannedDeliveryNoteStatus.INSERTED,
        insertedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      return null;
    }

    const deliveryNote = await tx.deliveryNoteUsage.create({
      data: {
        jobOrderId,
        supplier,
        description,
        usageDate,
        validationStatus: DeliveryNoteValidationStatus.PENDING,
        createdByUserId: appUser.id,
        updatedByUserId: appUser.id,
      },
    });

    const document = await tx.deliveryNoteDocument.create({
      data: {
        deliveryNoteId: deliveryNote.id,
        fileName: scan.fileName,
        driveFileId: scan.driveFileId,
        mimeType: scan.mimeType,
        sizeBytes: scan.sizeBytes,
        uploadedById: appUser.id,
      },
    });

    await tx.scannedDeliveryNote.update({
      where: { id: scan.id },
      data: {
        deliveryNoteId: deliveryNote.id,
      },
    });

    return { deliveryNote, document };
  });

  if (!result) {
    return NextResponse.json({ error: "Scansione gia inserita" }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    row: {
      id: result.deliveryNote.id,
      validationStatus: result.deliveryNote.validationStatus,
      validationStatusLabel: "Da validare",
      documentId: result.document.id,
    },
  });
}
