import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { UserStatus } from "@prisma/client";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const { id: equipmentId } = await context.params;

  const formData = await request.formData();
  const maintenanceId = String(formData.get("maintenanceId") || "");
  const file = formData.get("file");

  if (!maintenanceId) {
    return NextResponse.json({ error: "maintenanceId mancante" }, { status: 400 });
  }

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "File mancante" }, { status: 400 });
  }

  const maintenance = await prisma.maintenance.findFirst({
    where: {
      id: maintenanceId,
      equipmentId,
    },
    select: { id: true },
  });

  if (!maintenance) {
    return NextResponse.json({ error: "Manutenzione non trovata" }, { status: 404 });
  }

    const bucket = process.env.SUPABASE_STORAGE_BUCKET;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!bucket || !supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: "Configurazione Supabase mancante" }, { status: 500 });
    }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const filePath = `maintenance/${equipmentId}/${maintenanceId}/${Date.now()}_${safeName}`;

    const uploadResponse = await fetch(
    `${supabaseUrl}/storage/v1/object/${bucket}/${filePath}`,
    {
        method: "POST",
        headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": file.type || "application/octet-stream",
        "x-upsert": "true",
        },
        body: buffer,
    }
    );

  if (!uploadResponse.ok) {
    const raw = await uploadResponse.text();
    return NextResponse.json(
      { error: `Upload Supabase fallito: ${raw}` },
      { status: 500 }
    );
  }

  const created = await prisma.maintenanceDocument.create({
    data: {
      maintenanceId,
      fileName: file.name,
      filePath,
      mimeType: file.type || null,
      sizeBytes: file.size,
    },
  });

  return NextResponse.json({
    success: true,
    document: {
      id: created.id,
      fileName: created.fileName,
      filePath: created.filePath,
    },
  });
}