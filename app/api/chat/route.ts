import { NextRequest, NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { hasChatMention } from "@/lib/chat-mentions";

function senderLabel(sender: { firstName: string | null; lastName: string | null; email: string }) {
  return [sender.firstName, sender.lastName].filter(Boolean).join(" ").trim() || sender.email;
}

function serializeMessage(row: {
  id: string;
  senderId: string;
  message: string;
  createdAt: Date;
  sender: { firstName: string | null; lastName: string | null; email: string };
  mentions: { userId: string; token: string }[];
}) {
  return {
    id: row.id,
    senderId: row.senderId,
    senderLabel: senderLabel(row.sender),
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    mentions: row.mentions,
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
  const recentRows = await prisma.appChatMessage.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { sender: { select: senderSelect }, mentions: { select: { userId: true, token: true } } },
  });
  // Include older unread mentions too, so opening the notification always shows them.
  const mentionedRows = await prisma.appChatMessage.findMany({
    where: { mentions: { some: { userId: appUser.id, readAt: null } } },
    include: { sender: { select: senderSelect }, mentions: { select: { userId: true, token: true } } },
  });
  const rows = [...new Map([...recentRows, ...mentionedRows].map((row) => [row.id, row])).values()]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return NextResponse.json({
    currentUserId: appUser.id,
    messages: rows.map(serializeMessage),
    readAt: readAt.toISOString(),
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

  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", id: { not: appUser.id } },
    select: { id: true, email: true },
  });
  const created = await prisma.appChatMessage.create({
    data: {
      senderId: appUser.id, message,
      mentions: { create: users.filter((user) => hasChatMention(message, user.email))
        .map((user) => ({ userId: user.id, token: `@${user.email}` })) },
    },
    include: { sender: { select: senderSelect }, mentions: { select: { userId: true, token: true } } },
  });

  return NextResponse.json({ message: serializeMessage(created) });
}
