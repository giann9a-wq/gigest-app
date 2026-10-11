import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { simulationSchema } from "@/lib/discount-calculator";
import { discountExcelBuffer } from "@/lib/discount-excel";
export async function POST(request: Request) {
  if (!(await getActiveAppUser())) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  let value;
  try { value = simulationSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Correggi i dati della simulazione prima di esportare." }, { status: 400 }); }
  const buffer = await discountExcelBuffer(value);
  return new Response(new Uint8Array(buffer), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="Calcolatore-sconti.xlsx"', "Cache-Control": "no-store" } });
}
