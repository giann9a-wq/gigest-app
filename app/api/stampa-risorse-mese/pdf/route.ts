import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildMonthlyResourceReport } from "@/lib/monthly-resource-report";
import {
  buildMonthlyResourceReportFileName,
  buildMonthlyResourceReportPdf,
} from "@/lib/monthly-resource-report-pdf";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const now = new Date();
  const year = Number(request.nextUrl.searchParams.get("year") || now.getUTCFullYear());
  const month = Number(request.nextUrl.searchParams.get("month") || now.getUTCMonth() + 1);
  const includedPersonIds = request.nextUrl.searchParams
    .getAll("includedPersonId")
    .map((value) => value.trim())
    .filter(Boolean);
  const legacyPersonIds = request.nextUrl.searchParams
    .getAll("personId")
    .map((value) => value.trim())
    .filter(Boolean);
  const personIds = includedPersonIds.length > 0 ? includedPersonIds : legacyPersonIds;

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return NextResponse.json({ error: "Anno non valido" }, { status: 400 });
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Mese non valido" }, { status: 400 });
  }

  const report = await buildMonthlyResourceReport(year, month, {
    personIds: personIds.length > 0 ? personIds : undefined,
  });
  const pdf = buildMonthlyResourceReportPdf(report);

  return new NextResponse(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${buildMonthlyResourceReportFileName(month, year)}"`,
      "Cache-Control": "no-store",
    },
  });
}
