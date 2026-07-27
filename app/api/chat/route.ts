import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

function senderLabel(sender: { firstName: string | null; lastName: string | null; email: string }) {
  return [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim() || sender.email;
}

function serializeMessage(row: {
  id: string;
  senderId: string;
  message: string;
  createdAt: Date;
  sender: { firstName: string | null; lastName: string | null; email: string };
}) {
  return {
    id: row.id,
    senderId: row.senderId,
    senderLabel: senderLabel(row.sender),
    message: row.message,
    createdAt: row.createdAt.toISOString(),
  };
}

const senderSelect = {
  firstName: true,
  lastName: true,
  email: true,
} as const;

export async function GET() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const readAt = new Date();
  const rows = await prisma.appChatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sender: { select: senderSelect } },
  });

  await prisma.user.update({
    where: { id: appUser.id },
    data: { chatLastReadAt: readAt },
  });

  return NextResponse.json({
    currentUserId: appUser.id,
    messages: rows.reverse().map(serializeMessage),
  });
}

export async function POST(request: NextRequest) {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const message = String(body?.message ?? "").trim();

  if (!message) {
    return NextResponse.json({ error: "Scrivi un messaggio" }, { status: 400 });
  }

  if (message.length > 2000) {
    return NextResponse.json({ error: "Il messaggio non può superare 2000 caratteri" }, { status: 400 });
  }

  const created = await prisma.appChatMessage.create({
    data: { senderId: appUser.id, message },
    include: { sender: { select: senderSelect } },
  });

  await prisma.user.update({
    where: { id: appUser.id },
    data: { chatLastReadAt: created.createdAt },
  });

  return NextResponse.json({ message: serializeMessage(created) });
}
