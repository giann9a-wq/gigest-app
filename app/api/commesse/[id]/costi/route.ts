import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { recalculateJobOrderActualCosts } from "@/lib/cost-actual-import";
import { getJobOrderCostActualView } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";
import { CostActualCategory, Prisma, UserRole, UserStatus } from "@prisma/client";

const ALLOWED_CATEGORIES = new Set<CostActualCategory>([
  CostActualCategory.MATERIE_PRIME,
  CostActualCategory.PRESTAZIONI_PROFESSIONALI,
  CostActualCategory.PRESTAZIONI_TERZI,
  CostActualCategory.SPESE_VARIE,
]);

function parseDateFilter(value: string | null, endOfDay = false) {
  if (!value) return null;

  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

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
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const { id } = await context.params;
  const from = parseDateFilter(request.nextUrl.searchParams.get("from"));
  const to = parseDateFilter(request.nextUrl.searchParams.get("to"), true);
  const [view, allJobOrders] = await Promise.all([
    getJobOrderCostActualView(id, { from, to }),
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
  const targetJobOrderId = String(body.targetJobOrderId ?? id).trim();
  const targetCategory = body.targetCategory
    ? (String(body.targetCategory) as CostActualCategory)
    : null;

  if (!costEntryId) {
    return NextResponse.json({ error: "Dati modifica incompleti" }, { status: 400 });
  }

  if (!targetJobOrderId) {
    return NextResponse.json({ error: "Commessa di destinazione obbligatoria" }, { status: 400 });
  }

  if (targetCategory && !ALLOWED_CATEGORIES.has(targetCategory)) {
    return NextResponse.json({ error: "Tipologia spesa non valida" }, { status: 400 });
  }

  const [entry, targetJobOrder] = await Promise.all([
    prisma.costActualEntry.findUnique({
      where: { id: costEntryId },
      select: { id: true, jobOrderId: true, category: true, sourceImportRowId: true },
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

  const nextCategory = targetCategory ?? entry.category;

  if (entry.jobOrderId === targetJobOrderId && entry.category === nextCategory) {
    return NextResponse.json({ success: true });
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.costActualEntry.update({
        where: { id: costEntryId },
        data: {
          jobOrderId: targetJobOrderId,
          category: nextCategory,
        },
      });

      if (entry.sourceImportRowId) {
        await tx.costImportRowStaging.updateMany({
          where: { id: entry.sourceImportRowId },
          data: {
            jobOrderId: targetJobOrderId,
            finalCategory: nextCategory,
          },
        });
      }
    });

    await Promise.all(
      [...new Set([entry.jobOrderId, targetJobOrderId])].map((jobOrderId) =>
        recalculateJobOrderActualCosts(jobOrderId)
      )
    );
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

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  if (authResult.appUser.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Funzione riservata agli admin" }, { status: 403 });
  }

  const { id } = await context.params;
  const costEntryId = String(request.nextUrl.searchParams.get("costEntryId") ?? "").trim();

  if (!costEntryId) {
    return NextResponse.json({ error: "Costo da eliminare non specificato" }, { status: 400 });
  }

  const entry = await prisma.costActualEntry.findUnique({
    where: { id: costEntryId },
    select: { id: true, jobOrderId: true, sourceImportRowId: true },
  });

  if (!entry || entry.jobOrderId !== id) {
    return NextResponse.json({ error: "Costo non trovato nella commessa corrente" }, { status: 404 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.costActualEntry.delete({ where: { id: entry.id } });

    if (entry.sourceImportRowId) {
      await tx.costImportRowStaging.updateMany({
        where: { id: entry.sourceImportRowId },
        data: {
          validationStatus: "REJECTED",
          validationNote: "Voce eliminata manualmente dalla sezione costi.",
        },
      });
    }
  });

  await recalculateJobOrderActualCosts(entry.jobOrderId);

  return NextResponse.json({ success: true });
}
