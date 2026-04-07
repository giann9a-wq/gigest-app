import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; documentId: string }> }
) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id: equipmentId, documentId } = await context.params;

  const document = await prisma.maintenanceDocument.findFirst({
    where: {
      id: documentId,
      maintenance: {
        equipmentId,
      },
    },
    include: {
      maintenance: {
        select: {
          equipmentId: true,
        },
      },
    },
  });

  if (!document) {
    return NextResponse.json({ error: "Documento non trovato" }, { status: 404 });
  }

  const bucket = process.env.SUPABASE_STORAGE_BUCKET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!bucket || !supabaseUrl) {
    return NextResponse.json({ error: "Configurazione Supabase mancante" }, { status: 500 });
  }

  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${document.filePath}`;

  return NextResponse.json({
    url: publicUrl,
    fileName: document.fileName,
  });
}