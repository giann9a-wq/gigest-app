import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { SalesError } from "@/lib/property-sales";
export function salesApiError(error: unknown) {
  if (error instanceof ZodError) return NextResponse.json({ error: error.issues[0]?.message ?? "Dati non validi" }, { status: 400 });
  if (error instanceof SalesError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code))
    return NextResponse.json({ error: "Dati già presenti o modificati da un altro utente. Ricarica e riprova." }, { status: 409 });
  if (error instanceof SyntaxError) return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  console.error("Property sales error", error);
  return NextResponse.json({ error: "Errore nella gestione vendite" }, { status: 500 });
}
