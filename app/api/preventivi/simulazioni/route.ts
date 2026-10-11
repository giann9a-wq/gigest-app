import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { simulationSchema } from "@/lib/discount-calculator";
import { serializeSimulation, simulationData, simulationInclude } from "@/lib/discount-simulation-store";

export async function GET() {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const rows = await prisma.discountSimulation.findMany({ orderBy: { updatedAt: "desc" }, include: simulationInclude });
  return NextResponse.json({ rows: rows.map(serializeSimulation) });
}
export async function POST(request: Request) {
  const user = await getActiveAppUser();
  if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  let value;
  try { value = simulationSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Dati non validi: verifica nome, parametri e piano acconti." }, { status: 400 }); }
  const row = await prisma.discountSimulation.create({ data: { ...simulationData(value), createdById: user.id }, include: simulationInclude });
  return NextResponse.json({ simulation: serializeSimulation(row) }, { status: 201 });
}
