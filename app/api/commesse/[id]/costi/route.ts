import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJobOrderCostActualView } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";
import { UserStatus } from "@prisma/client";

async function getAuthorizedUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return { error: NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 }) };
  }

  return { appUser };
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const { id } = await context.params;
  const view = await getJobOrderCostActualView(id);

  if (!view) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  return NextResponse.json(view);
}
