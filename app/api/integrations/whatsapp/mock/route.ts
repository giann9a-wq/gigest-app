import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone, PHOTO_ALLOWED_MIME_TYPES, PHOTO_MAX_SIZE_BYTES } from "@/lib/photo-repository";
import { loadMockMedia, removeMockMedia, saveMockMedia } from "@/lib/whatsapp/mock-media";
import { RecordingWhatsAppProvider } from "@/lib/whatsapp/provider";
import { processWhatsAppMessage, type IncomingWhatsAppMessage } from "@/lib/whatsapp/workflow";

export const runtime = "nodejs";

function mockEnabled() {
  return process.env.NODE_ENV !== "production" || process.env.WHATSAPP_MOCK_ENABLED === "true";
}

function defaultMockPhone(userId: string) {
  const numeric = BigInt(`0x${crypto.createHash("sha256").update(userId).digest("hex").slice(0, 12)}`) % 10_000_000_000n;
  return `+399${numeric.toString().padStart(10, "0")}`;
}

async function currentSession(phone: string) {
  const session = await prisma.whatsAppUploadSession.findUnique({
    where: { activeKey: phone },
    include: {
      jobOrder: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
    },
  });
  return session
    ? {
        id: session.id,
        status: session.status,
        mediaCount: Array.isArray(session.media) ? session.media.length : 0,
        jobOrder: session.jobOrder,
        phase: session.phase,
        note: session.note,
        expiresAt: session.expiresAt.toISOString(),
      }
    : null;
}

export async function GET(request: NextRequest) {
  if (!mockEnabled()) return NextResponse.json({ error: "Simulatore disabilitato" }, { status: 404 });
  const appUser = await getActiveAppUser();
  if (!appUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const phone = normalizeWhatsappPhone(request.nextUrl.searchParams.get("phone") || defaultMockPhone(appUser.id));
  return NextResponse.json({ phone, session: await currentSession(phone) });
}

export async function POST(request: NextRequest) {
  if (!mockEnabled()) return NextResponse.json({ error: "Simulatore disabilitato" }, { status: 404 });
  const appUser = await getActiveAppUser();
  if (!appUser) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  let savedMediaId = "";
  try {
    const form = await request.formData();
    const type = String(form.get("type") || "text") as IncomingWhatsAppMessage["type"];
    const phone = normalizeWhatsappPhone(String(form.get("phone") || defaultMockPhone(appUser.id)));
    if (!phone) return NextResponse.json({ error: "Numero mock non valido" }, { status: 400 });

    const message: IncomingWhatsAppMessage = {
      providerMessageId: String(form.get("providerMessageId") || `mock-message-${crypto.randomUUID()}`),
      from: phone,
      type,
    };
    if (type === "image") {
      const file = form.get("photo");
      if (!(file instanceof File)) return NextResponse.json({ error: "Allega una fotografia" }, { status: 400 });
      if (!PHOTO_ALLOWED_MIME_TYPES.has(file.type)) return NextResponse.json({ error: "Formato immagine non supportato" }, { status: 400 });
      if (file.size > PHOTO_MAX_SIZE_BYTES) return NextResponse.json({ error: "La fotografia supera 15 MB" }, { status: 400 });
      savedMediaId = await saveMockMedia(file);
      message.media = { id: savedMediaId, mimeType: file.type, filename: file.name };
    } else if (type === "interactive") {
      message.interactiveId = String(form.get("interactiveId") || "");
    } else {
      message.text = String(form.get("text") || "");
    }

    const provider = new RecordingWhatsAppProvider(loadMockMedia, removeMockMedia);
    await processWhatsAppMessage(provider, message, { authenticatedUserId: appUser.id });
    return NextResponse.json({
      success: true,
      phone,
      replies: provider.messages,
      session: await currentSession(phone),
    });
  } catch (error) {
    if (savedMediaId) await removeMockMedia(savedMediaId);
    console.error("WhatsApp mock failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Simulazione fallita" }, { status: 400 });
  }
}
