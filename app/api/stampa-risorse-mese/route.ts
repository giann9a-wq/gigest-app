import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildMonthlyResourceReport } from "@/lib/monthly-resource-report";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const year = Number(request.nextUrl.searchParams.get("year") || now.getUTCFullYear());
  const month = Number(request.nextUrl.searchParams.get("month") || now.getUTCMonth() + 1);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Anno non valido" }, { status: 400 });
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Mese non valido" }, { status: 400 });
  }

  return NextResponse.json(await buildMonthlyResourceReport(year, month));
}
