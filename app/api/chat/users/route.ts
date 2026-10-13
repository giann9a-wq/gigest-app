import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const users = await prisma.user.findMany({
    where: { status: "ACTIVE", id: { not: user.id } },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }, { email: "asc" }],
    select: { id: true, firstName: true, lastName: true, email: true },
  });
  return NextResponse.json({ users: users.map((row) => ({
    id: row.id, email: row.email,
    label: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
  })) });
}
