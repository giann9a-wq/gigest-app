import * as XLSX from "xlsx";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCaricamentiRows, validateCaricamentiFilters } from "@/lib/caricamenti";
import { makeExcelResponse } from "@/lib/excel";

function safeFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function formatDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const resourceValue = request.nextUrl.searchParams.get("resourceValue")?.trim() ?? "";
  const jobOrderId = request.nextUrl.searchParams.get("jobOrderId")?.trim() ?? "";
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";

  const validation = validateCaricamentiFilters({ resourceValue, jobOrderId, from, to });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const rows = await getCaricamentiRows({ resourceValue, jobOrderId, from, to });
  const workbook = XLSX.utils.book_new();

  const exportRows = rows.map((row) => ({
    Data: row.referenceDate,
    Risorsa: row.resourceLabel,
    TipoRisorsa: row.resourceType,
    Commessa: row.jobOrderLabel,
    TipoCommessa: row.jobOrderType,
    Ore: row.hours,
    Descrizione: row.activityDescription,
    CreatoIl: formatDateTime(row.createdAt),
    AggiornatoIl: formatDateTime(row.updatedAt),
  }));

  const sheet = XLSX.utils.json_to_sheet(exportRows);
  XLSX.utils.book_append_sheet(workbook, sheet, "Caricamenti");

  const [resourceType, resourceId] = resourceValue.split(":");
  const fileName = `caricamenti-${safeFileSegment(resourceType)}-${safeFileSegment(resourceId)}.xlsx`;

  return makeExcelResponse(workbook, fileName);
}
