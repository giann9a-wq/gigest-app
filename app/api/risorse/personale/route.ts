import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, ResourceStatus, UserStatus } from "@prisma/client";

type PersonRowInput = {
  id?: string;
  fullName?: string;
  roleDescription?: string;
  contacts?: string;
  status?: ResourceStatus | string;
  hourlyCost?: number | string | null;
};

const allowedStatuses: ResourceStatus[] = ["ACTIVE", "SUSPENDED", "ENDED"];

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const people = await prisma.person.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      costHistory: {
        orderBy: { validFrom: "desc" },
        take: 1,
      },
    },
  });

  return NextResponse.json({
    rows: people.map((person) => ({
      id: person.id,
      fullName: person.fullName,
      roleDescription: person.roleDescription ?? "",
      contacts: person.contacts ?? "",
      status: person.status,
      hourlyCost:
        person.costHistory.length > 0 ? Number(person.costHistory[0].hourlyCost) : "",
    })),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const body = await request.json();
  const rows = body.rows as PersonRowInput[] | undefined;

  if (!Array.isArray(rows)) {
    return NextResponse.json({ error: "Le righe devono essere un array" }, { status: 400 });
  }

  const cleanedRows = rows
    .map((row) => ({
      id: row.id?.trim() || undefined,
      fullName: row.fullName?.trim() || "",
      roleDescription: row.roleDescription?.trim() || "",
      contacts: row.contacts?.trim() || "",
      status: (row.status || "") as ResourceStatus | "",
      hourlyCost:
        row.hourlyCost === "" || row.hourlyCost === null || row.hourlyCost === undefined
          ? ""
          : String(row.hourlyCost),
    }))
    .filter((row) => {
      return row.fullName || row.roleDescription || row.contacts || row.status || row.hourlyCost;
    });

  for (const row of cleanedRows) {
    if (!row.fullName) {
      return NextResponse.json({ error: "Il Nome e Cognome è obbligatorio" }, { status: 400 });
    }

    if (!allowedStatuses.includes(row.status as ResourceStatus)) {
      return NextResponse.json({ error: "Stato risorsa non valido" }, { status: 400 });
    }

    if (row.hourlyCost !== "") {
      const parsed = Number(row.hourlyCost);
      if (Number.isNaN(parsed) || parsed < 0) {
        return NextResponse.json(
          { error: "Il costo orario deve essere un numero maggiore o uguale a zero" },
          { status: 400 }
        );
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.person.findMany({
      select: { id: true },
    });

    const incomingIds = new Set(cleanedRows.filter((r) => r.id).map((r) => r.id!));
    const idsToDelete = existing.map((x) => x.id).filter((id) => !incomingIds.has(id));

    if (idsToDelete.length > 0) {
      const linkedActivitiesCount = await tx.diaryActivity.count({
        where: { personId: { in: idsToDelete } },
      });

      if (linkedActivitiesCount > 0) {
        throw new Error(
          "Non è possibile eliminare risorse già utilizzate nel Diario. Impostale come ENDED invece di rimuoverle."
        );
      }

      await tx.person.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    for (const row of cleanedRows) {
      let personId = row.id;

      if (row.id) {
        await tx.person.update({
          where: { id: row.id },
          data: {
            fullName: row.fullName,
            roleDescription: row.roleDescription || null,
            contacts: row.contacts || null,
            status: row.status as ResourceStatus,
          },
        });
      } else {
        const created = await tx.person.create({
          data: {
            fullName: row.fullName,
            roleDescription: row.roleDescription || null,
            contacts: row.contacts || null,
            status: row.status as ResourceStatus,
          },
        });
        personId = created.id;
      }

      if (personId && row.hourlyCost !== "") {
        const parsedCost = Number(row.hourlyCost);

        const latestCost = await tx.personCost.findFirst({
          where: { personId },
          orderBy: { validFrom: "desc" },
        });

        const latestValue = latestCost ? Number(latestCost.hourlyCost) : null;

        if (latestValue === null || latestValue !== parsedCost) {
          await tx.personCost.create({
            data: {
              personId,
              hourlyCost: new Prisma.Decimal(parsedCost.toFixed(2)),
              validFrom: new Date(),
            },
          });
        }
      }
    }
  });

  return NextResponse.json({
    success: true,
    savedRows: cleanedRows.length,
  });
}