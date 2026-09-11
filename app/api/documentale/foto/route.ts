import { NextRequest, NextResponse } from "next/server";
import { Prisma, ResourceStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { createPhotoUpload } from "@/lib/photo-repository";

export const runtime = "nodejs";

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate() + 1);
}

function parseDate(value: string | null, end = false) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return end ? endOfLocalDay(parsed) : startOfLocalDay(parsed);
}

export async function GET(request: NextRequest) {
  const appUser = await getActiveAppUser();
  if (!appUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const query = request.nextUrl.searchParams;
  const jobOrderId = query.get("jobOrderId")?.trim() || "";
  const phaseId = query.get("phaseId")?.trim() || "";
  const authorId = query.get("authorId")?.trim() || "";
  const note = query.get("note")?.trim() || "";
  const quick = query.get("quick")?.trim() || "";
  let dateFrom = parseDate(query.get("dateFrom"));
  let dateTo = parseDate(query.get("dateTo"), true);

  if (quick === "today") {
    dateFrom = startOfLocalDay(new Date());
    dateTo = endOfLocalDay(new Date());
  } else if (quick === "7d") {
    const from = startOfLocalDay(new Date());
    from.setDate(from.getDate() - 6);
    dateFrom = from;
    dateTo = endOfLocalDay(new Date());
  }

  const where: Prisma.PhotoUploadWhereInput = {
    ...(jobOrderId ? { jobOrderId } : {}),
    ...(phaseId ? { phaseId } : {}),
    ...(authorId ? { userId: authorId } : {}),
    ...(note ? { note: { contains: note, mode: "insensitive" } } : {}),
    ...(dateFrom || dateTo
      ? {
          createdAt: {
            ...(dateFrom ? { gte: dateFrom } : {}),
            ...(dateTo ? { lt: dateTo } : {}),
          },
        }
      : {}),
    photos: { some: { deletedAt: null } },
  };

  const [uploads, jobOrders, phases, authors] = await Promise.all([
    prisma.photoUpload.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        jobOrder: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        photos: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true, filename: true, mimeType: true, sizeBytes: true, createdAt: true },
        },
      },
    }),
    prisma.jobOrder.findMany({
      where: {
        OR: [
          { status: ResourceStatus.ACTIVE },
          { status: ResourceStatus.COMPLETED, photoUploads: { some: {} } },
        ],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, status: true },
    }),
    prisma.photoPhase.findMany({
      orderBy: [{ jobOrder: { name: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, jobOrderId: true },
    }),
    prisma.user.findMany({
      where: { photoUploads: { some: {} } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  return NextResponse.json({
    rows: uploads.map((upload) => ({
      id: upload.id,
      jobOrder: upload.jobOrder,
      phase: upload.phase,
      author: {
        id: upload.user.id,
        name: [upload.user.firstName, upload.user.lastName].filter(Boolean).join(" ") || upload.user.email,
      },
      note: upload.note ?? "",
      source: upload.source,
      mediaCount: upload.photos.length,
      createdAt: upload.createdAt.toISOString(),
      canDelete: appUser.role === "ADMIN" || upload.userId === appUser.id,
      photos: upload.photos.map((photo) => ({
        ...photo,
        createdAt: photo.createdAt.toISOString(),
        viewUrl: `/api/documentale/foto/${photo.id}`,
        downloadUrl: `/api/documentale/foto/${photo.id}?download=1`,
      })),
    })),
    options: {
      jobOrders,
      phases,
      authors: authors.map((author) => ({
        id: author.id,
        name: [author.firstName, author.lastName].filter(Boolean).join(" ") || author.email,
      })),
    },
  });
}

export async function POST(request: NextRequest) {
  const appUser = await getActiveAppUser();
  if (!appUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  try {
    const form = await request.formData();
    const jobOrderId = String(form.get("jobOrderId") || "").trim();
    const phaseId = String(form.get("phaseId") || "").trim();
    const phaseName = String(form.get("phaseName") || "").trim();
    const note = String(form.get("note") || "").trim();
    const files = form.getAll("photos").filter((item): item is File => item instanceof File);

    if (!jobOrderId) {
      return NextResponse.json({ error: "Seleziona una commessa" }, { status: 400 });
    }

    const media = await Promise.all(
      files.map(async (file) => ({
        filename: file.name || "foto-cantiere.jpg",
        mimeType: file.type || "application/octet-stream",
        buffer: Buffer.from(await file.arrayBuffer()),
        metadata: { source: "manual-upload" },
      }))
    );

    const upload = await createPhotoUpload({
      jobOrderId,
      phaseId: phaseId || null,
      phaseName: phaseName || null,
      userId: appUser.id,
      note,
      source: "MANUAL",
      media,
    });

    return NextResponse.json({ success: true, uploadId: upload.id, mediaCount: upload.photos.length }, { status: 201 });
  } catch (error) {
    console.error("Photo repository upload failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Caricamento fotografie fallito" },
      { status: 400 }
    );
  }
}
