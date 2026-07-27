import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

const ONLINE_WINDOW_MS = 60_000;

function userLabel(user: { firstName: string | null; lastName: string | null; email: string }) {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
}

export async function POST() {
  const appUser = await getActiveAppUser();

  if (!appUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const onlineSince = new Date(now.getTime() - ONLINE_WINDOW_MS);

  const [currentUser, onlineUsers] = await prisma.$transaction([
    prisma.user.update({
      where: { id: appUser.id },
      data: { lastSeenAt: now },
      select: { chatLastReadAt: true },
    }),
    prisma.user.findMany({
      where: {
        id: { not: appUser.id },
        status: "ACTIVE",
        lastSeenAt: { gte: onlineSince },
      },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
      select: { id: true, firstName: true, lastName: true, email: true },
    }),
  ]);

  const unreadCount = await prisma.appChatMessage.count({
    where: {
      senderId: { not: appUser.id },
      ...(currentUser.chatLastReadAt ? { createdAt: { gt: currentUser.chatLastReadAt } } : {}),
    },
  });

  return NextResponse.json({
    users: onlineUsers.map((user) => ({ id: user.id, label: userLabel(user) })),
    unreadCount,
  });
}
