import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJobOrderCostActualView } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";
import { Prisma, UserRole, UserStatus } from "@prisma/client";

async function getAuthorizedUser() {
  const session = await auth();

  if (!session?.user?.email) {
    return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) };
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true, role: true },
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
  const [view, allJobOrders] = await Promise.all([
    getJobOrderCostActualView(id),
    authResult.appUser.role === UserRole.ADMIN
      ? prisma.jobOrder.findMany({
          orderBy: [{ name: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
          },
        })
      : Promise.resolve([]),
  ]);

  if (!view) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  return NextResponse.json({
    ...view,
    canReassignCosts: authResult.appUser.role === UserRole.ADMIN,
    allJobOrders,
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  if (authResult.appUser.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Funzione riservata agli admin" }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json();
  const costEntryId = String(body.costEntryId ?? "").trim();
  const targetJobOrderId = String(body.targetJobOrderId ?? "").trim();

  if (!costEntryId || !targetJobOrderId) {
    return NextResponse.json({ error: "Dati spostamento incompleti" }, { status: 400 });
  }

  const [entry, targetJobOrder] = await Promise.all([
    prisma.costActualEntry.findUnique({
      where: { id: costEntryId },
      select: { id: true, jobOrderId: true },
    }),
    prisma.jobOrder.findUnique({
      where: { id: targetJobOrderId },
      select: { id: true },
    }),
  ]);

  if (!entry || entry.jobOrderId !== id) {
    return NextResponse.json({ error: "Costo non trovato nella commessa corrente" }, { status: 404 });
  }

  if (!targetJobOrder) {
    return NextResponse.json({ error: "Commessa di destinazione non trovata" }, { status: 404 });
  }

  if (entry.jobOrderId === targetJobOrderId) {
    return NextResponse.json({ success: true });
  }

  try {
    await prisma.costActualEntry.update({
      where: { id: costEntryId },
      data: { jobOrderId: targetJobOrderId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Questa spesa risulta già presente nella commessa di destinazione" },
        { status: 409 }
      );
    }

    throw error;
  }

  return NextResponse.json({ success: true });
}
