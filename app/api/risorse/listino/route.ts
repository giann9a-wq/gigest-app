import { NextRequest, NextResponse } from "next/server";
import { Prisma, ResourcePriceListKind } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { normalizeResourcePriceName, syncRegisteredResourcePrices } from "@/lib/resource-price-list";

const allowedKinds = new Set<ResourcePriceListKind>([
  ResourcePriceListKind.PERSON_ROLE,
  ResourcePriceListKind.EQUIPMENT,
]);

type PriceUpdateBody = {
  id?: unknown;
  name?: unknown;
  hourlyPrice?: unknown;
  active?: unknown;
};

async function registeredRoleNames() {
  const people = await prisma.person.findMany({
    where: { roleDescription: { not: null } },
    select: { roleDescription: true },
  });
  return new Set(
    people
      .map((person) => normalizeResourcePriceName(person.roleDescription ?? ""))
      .filter(Boolean),
  );
}

export async function GET() {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  await syncRegisteredResourcePrices();
  const [items, roles] = await Promise.all([
    prisma.resourcePriceListItem.findMany({ orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    registeredRoleNames(),
  ]);
  return NextResponse.json({
    rows: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      name: item.name,
      hourlyPrice: Number(item.hourlyPrice),
      active: item.active,
      isRegistered: Boolean(item.equipmentId) || (item.kind === ResourcePriceListKind.PERSON_ROLE && roles.has(item.normalizedName)),
    })),
  });
}

export async function POST(request: NextRequest) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const body = await request.json();
  const kind = body.kind as ResourcePriceListKind;
  const name = String(body.name ?? "").trim().replace(/\s+/g, " ");
  const price = Number(body.hourlyPrice);
  if (!allowedKinds.has(kind)) return NextResponse.json({ error: "Tipo voce non valido" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Descrizione obbligatoria" }, { status: 400 });
  if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Prezzo orario non valido" }, { status: 400 });
  try {
    const item = await prisma.resourcePriceListItem.create({
      data: {
        kind,
        name,
        normalizedName: normalizeResourcePriceName(name),
        hourlyPrice: new Prisma.Decimal(price.toFixed(2)),
        active: body.active !== false,
      },
    });
    return NextResponse.json({ id: item.id });
  } catch {
    return NextResponse.json({ error: "Esiste già una voce con questa descrizione" }, { status: 409 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const body = await request.json();
  const updates: PriceUpdateBody[] = Array.isArray(body.rows) ? body.rows : [body];
  if (!updates.length) return NextResponse.json({ error: "Nessuna voce da salvare" }, { status: 400 });

  const ids = updates.map((row) => String(row.id ?? ""));
  const items = await prisma.resourcePriceListItem.findMany({ where: { id: { in: ids } } });
  const itemsById = new Map(items.map((item) => [item.id, item]));
  if (items.length !== new Set(ids).size) return NextResponse.json({ error: "Una o più voci non sono state trovate" }, { status: 404 });

  const prepared: Array<{ id: string; name: string; hourlyPrice: Prisma.Decimal; active: boolean }> = [];
  for (const row of updates) {
    const id = String(row.id ?? "");
    const item = itemsById.get(id)!;
    const price = Number(row.hourlyPrice);
    if (!Number.isFinite(price) || price < 0) return NextResponse.json({ error: "Prezzo orario non valido" }, { status: 400 });
    const requestedName = String(row.name ?? item.name).trim().replace(/\s+/g, " ");
    const name = item.equipmentId ? item.name : requestedName;
    if (!name) return NextResponse.json({ error: "Descrizione obbligatoria" }, { status: 400 });
    prepared.push({ id, name, hourlyPrice: new Prisma.Decimal(price.toFixed(2)), active: row.active !== false });
  }

  try {
    await prisma.$transaction(prepared.map((row) => prisma.resourcePriceListItem.update({
      where: { id: row.id },
      data: {
        name: row.name,
        normalizedName: normalizeResourcePriceName(row.name),
        hourlyPrice: row.hourlyPrice,
        active: row.active,
      },
    })));
    return NextResponse.json({ success: true, updated: prepared.length });
  } catch {
    return NextResponse.json({ error: "Esiste già una voce con questa descrizione" }, { status: 409 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  const item = await prisma.resourcePriceListItem.findUnique({ where: { id } });
  if (!item) return NextResponse.json({ error: "Voce non trovata" }, { status: 404 });
  if (item.equipmentId) return NextResponse.json({ error: "Le risorse registrate non possono essere eliminate" }, { status: 409 });
  if (item.kind === ResourcePriceListKind.PERSON_ROLE) {
    const roles = await registeredRoleNames();
    if (roles.has(item.normalizedName)) return NextResponse.json({ error: "I ruoli assegnati al personale non possono essere eliminati" }, { status: 409 });
  }
  await prisma.resourcePriceListItem.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
