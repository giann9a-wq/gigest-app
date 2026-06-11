import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
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

function looksLikeTechnicalId(value: string) {
  return /^c[a-z0-9]{18,}$/i.test(value.trim());
}

export async function POST(request: NextRequest) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const body = await request.json();
  const name = String(body.name ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "Il nome della risorsa esterna e obbligatorio" }, { status: 400 });
  }

  if (looksLikeTechnicalId(name)) {
    return NextResponse.json({ error: "Il nome della risorsa esterna non puo essere un codice tecnico" }, { status: 400 });
  }

  const existing = await prisma.externalResource.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });

  if (existing) {
    return NextResponse.json({ error: "Questa risorsa esterna esiste gia" }, { status: 409 });
  }

  const resource = await prisma.externalResource.create({
    data: { name },
    select: {
      id: true,
      name: true,
    },
  });

  return NextResponse.json({ success: true, resource });
}

export async function DELETE(request: NextRequest) {
  const authResult = await getAuthorizedUser();
  if (authResult.error) return authResult.error;

  const id = request.nextUrl.searchParams.get("id")?.trim();

  if (!id) {
    return NextResponse.json({ error: "Parametro id mancante" }, { status: 400 });
  }

  const usageCount = await prisma.externalDiaryActivity.count({
    where: { externalResourceId: id },
  });

  if (usageCount > 0) {
    return NextResponse.json(
      { error: "Non puoi eliminare una risorsa esterna gia utilizzata nel diario" },
      { status: 409 }
    );
  }

  await prisma.externalResource.delete({
    where: { id },
  });

  return NextResponse.json({ success: true });
}
