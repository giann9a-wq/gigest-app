import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const body = await request.json().catch(() => null);
  if (!Array.isArray(body?.messageIds) || body.messageIds.length > 10000 ||
      !body.messageIds.every((id: unknown) => typeof id === "string")) {
    return NextResponse.json({ error: "Messaggi non validi" }, { status: 400 });
  }
  const readAt = new Date(body.readAt);
  if (!Number.isFinite(readAt.getTime()) || readAt > new Date()) {
    return NextResponse.json({ error: "Data non valida" }, { status: 400 });
  }
  await prisma.$transaction([
    prisma.appChatMention.updateMany({
      where: { userId: user.id, readAt: null, messageId: { in: body.messageIds } },
      data: { readAt: new Date() },
    }),
    prisma.user.updateMany({
      where: { id: user.id, OR: [{ chatLastReadAt: null }, { chatLastReadAt: { lt: readAt } }] },
      data: { chatLastReadAt: readAt },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
