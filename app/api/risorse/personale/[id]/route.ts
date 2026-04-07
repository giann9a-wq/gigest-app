import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma, ResourceStatus, UserStatus } from "@prisma/client";

function toInputDate(value: Date | null | undefined) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

function parseOptionalDate(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

const allowedStatuses: ResourceStatus[] = ["ACTIVE", "SUSPENDED", "ENDED"];

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const { id } = await context.params;

  const person = await prisma.person.findUnique({
    where: { id },
    include: {
      costHistory: {
        orderBy: { validFrom: "asc" },
      },
    },
  });

  if (!person) {
    return NextResponse.json({ error: "Risorsa non trovata" }, { status: 404 });
  }

  return NextResponse.json({
    person: {
      id: person.id,
      fullName: person.fullName,
      roleDescription: person.roleDescription ?? "",
      hireDate: toInputDate(person.hireDate),
      contacts: person.contacts ?? "",
      status: person.status,
    },
    costHistory: person.costHistory.map((c) => ({
      id: c.id,
      hourlyCost: Number(c.hourlyCost),
      validFrom: toInputDate(c.validFrom),
      validTo: toInputDate(c.validTo),
    })),
  });
}

function normalizeDateOnly(value?: string | null) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`);
}

function hasOverlappingRanges(
  rows: Array<{
    hourlyCost?: string | number | null;
    validFrom?: string;
    validTo?: string;
  }>
) {
  const intervals = rows
    .filter((row) => row.hourlyCost !== "" && row.hourlyCost !== null && row.hourlyCost !== undefined)
    .map((row, index) => {
      const start = normalizeDateOnly(row.validFrom);
      const end = normalizeDateOnly(row.validTo);

      if (!start) {
        throw new Error(`La riga costo ${index + 1} deve avere "Valido dal" compilato.`);
      }

      if (end && end < start) {
        throw new Error(`Nella riga costo ${index + 1}, "Valido fino al" non può essere precedente a "Valido dal".`);
      }

      return {
        index: index + 1,
        start,
        end,
      };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (let i = 0; i < intervals.length - 1; i++) {
    const current = intervals[i];
    const next = intervals[i + 1];

    const currentEnd = current.end ?? new Date("9999-12-31T00:00:00.000Z");

    if (next.start <= currentEnd) {
      throw new Error(
        `Gli intervalli di validità si sovrappongono tra le righe costo ${current.index} e ${next.index}.`
      );
    }
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
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

  const { id } = await context.params;
  const body = await request.json();

  const person = body.person;
  const costHistory = Array.isArray(body.costHistory) ? body.costHistory : [];

  if (!person?.fullName?.trim()) {
    return NextResponse.json({ error: "Nome e Cognome obbligatorio" }, { status: 400 });
  }

  if (!allowedStatuses.includes(person.status)) {
    return NextResponse.json({ error: "Stato non valido" }, { status: 400 });
  }

for (const row of costHistory) {
  if (row.hourlyCost === "" || row.hourlyCost === null || row.hourlyCost === undefined) {
    continue;
  }

  const parsed = Number(row.hourlyCost);
  if (Number.isNaN(parsed) || parsed < 0) {
    return NextResponse.json({ error: "Costo orario non valido" }, { status: 400 });
  }
}

try {
  hasOverlappingRanges(costHistory);
} catch (err) {
  return NextResponse.json(
    { error: err instanceof Error ? err.message : "Intervalli costo non validi" },
    { status: 400 }
  );
}

  await prisma.$transaction(async (tx) => {
    await tx.person.update({
      where: { id },
      data: {
        fullName: person.fullName.trim(),
        roleDescription: person.roleDescription?.trim() || null,
        hireDate: parseOptionalDate(person.hireDate),
        contacts: person.contacts?.trim() || null,
        status: person.status,
      },
    });

    const existingCostIds = (
      await tx.personCost.findMany({
        where: { personId: id },
        select: { id: true },
      })
    ).map((x) => x.id);

    const incomingIds = costHistory.filter((x: any) => x.id).map((x: any) => x.id);
    const idsToDelete = existingCostIds.filter((existingId) => !incomingIds.includes(existingId));

    if (idsToDelete.length > 0) {
      await tx.personCost.deleteMany({
        where: { id: { in: idsToDelete } },
      });
    }

    for (const row of costHistory) {
      if (row.hourlyCost === "" || row.hourlyCost === null || row.hourlyCost === undefined) {
        continue;
      }

      const data = {
        personId: id,
        hourlyCost: new Prisma.Decimal(Number(row.hourlyCost).toFixed(2)),
        validFrom: parseOptionalDate(row.validFrom) ?? new Date(),
        validTo: parseOptionalDate(row.validTo),
      };

      if (row.id) {
        await tx.personCost.update({
          where: { id: row.id },
          data,
        });
      } else {
        await tx.personCost.create({
          data,
        });
      }
    }
  });

  return NextResponse.json({ success: true });
}