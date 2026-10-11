import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";
import { simulationSchema } from "@/lib/discount-calculator";
import { serializeSimulation, simulationData, simulationInclude } from "@/lib/discount-simulation-store";
type Context = { params: Promise<{ id: string }> };
const missing = () => NextResponse.json({ error: "Simulazione non trovata" }, { status: 404 });
export async function GET(_: Request, context: Context) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const row = await prisma.discountSimulation.findUnique({ where: { id }, include: simulationInclude });
  return row ? NextResponse.json({ simulation: serializeSimulation(row) }) : missing();
}
export async function PUT(request: Request, context: Context) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  let value;
  try { value = simulationSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Dati non validi: verifica nome, parametri e piano acconti." }, { status: 400 }); }
  try {
    const data = simulationData(value);
    const row = await prisma.discountSimulation.update({ where: { id }, data: { ...data, advances: { deleteMany: {}, ...data.advances } }, include: simulationInclude });
    return NextResponse.json({ simulation: serializeSimulation(row) });
  } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return missing(); throw error; }
}
export async function DELETE(_: Request, context: Context) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const { id } = await context.params;
  const result = await prisma.discountSimulation.deleteMany({ where: { id } });
  return result.count ? NextResponse.json({ success: true }) : missing();
}
