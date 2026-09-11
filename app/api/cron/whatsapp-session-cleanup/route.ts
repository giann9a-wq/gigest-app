import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { removeMockMedia } from "@/lib/whatsapp/mock-media";
import { processWhatsAppInboxBatch } from "@/lib/whatsapp/inbox";

function bearerToken(request: Request) {
  return request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || "";
}

export async function GET(request: Request) {
  const configuredSecret = process.env.CRON_SECRET || process.env.WHATSAPP_CLEANUP_SECRET || "";
  const isCron = request.headers.get("x-vercel-cron") === "1";
  const appUser = await getActiveAppUser();
  const authorized = isCron || (configuredSecret && bearerToken(request) === configuredSecret) || appUser?.role === UserRole.ADMIN;
  if (!authorized) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

  const expired = await prisma.whatsAppUploadSession.findMany({
    where: {
      expiresAt: { lte: new Date() },
      status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] },
    },
  });

  for (const session of expired) {
    await prisma.$transaction([
      prisma.whatsAppUploadSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED", activeKey: null, lastInteractionAt: new Date() },
      }),
      prisma.photoAuditEvent.create({
        data: {
          action: "SESSION_EXPIRED",
          actorUserId: session.userId,
          whatsappPhone: session.whatsappPhone,
          jobOrderId: session.jobOrderId,
          details: { sessionId: session.id, cleanup: "scheduled" },
        },
      }),
    ]);
    if (Array.isArray(session.media)) {
      await Promise.allSettled(
        session.media.map(async (item) => {
          if (item && typeof item === "object" && !Array.isArray(item) && typeof item.id === "string" && item.id.startsWith("mock-")) {
            await removeMockMedia(item.id);
          }
        })
      );
    }
  }

  let inbox: { completed: number; failed: number; error?: string } = { completed: 0, failed: 0 };
  try {
    inbox = await processWhatsAppInboxBatch(50);
  } catch (error) {
    console.error("WhatsApp scheduled inbox processing failed", error);
    inbox.error = error instanceof Error ? error.message : "Elaborazione inbox fallita";
  }

  return NextResponse.json({ success: !inbox.error, expired: expired.length, inbox }, { status: inbox.error ? 500 : 200 });
}
