import * as XLSX from "xlsx";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getLoadingDashboard,
  validateLoadingDashboardFilters,
  type LoadingDashboardTypeFilter,
} from "@/lib/caricamenti-dashboard";
import { makeExcelResponse } from "@/lib/excel";

function safeFileSegment(value: string) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const year = Number(request.nextUrl.searchParams.get("year") ?? new Date().getFullYear());
  const resourceType = (request.nextUrl.searchParams.get("resourceType") || "ALL") as LoadingDashboardTypeFilter;
  const resourceValue = request.nextUrl.searchParams.get("resourceValue")?.trim() ?? "";
  const jobOrderId = request.nextUrl.searchParams.get("jobOrderId")?.trim() ?? "";
  const includeEmpty = request.nextUrl.searchParams.get("includeEmpty") === "true";
  const filters = { year, resourceType, resourceValue, jobOrderId, includeEmpty };
  const validation = validateLoadingDashboardFilters(filters);

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const dashboard = await getLoadingDashboard(filters);
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      dashboard.rows.map((row) => ({
        Risorsa: row.resourceLabel,
        "Tipo risorsa": row.resourceTypeLabel,
        "Ore caricate YTD": row.totalHours,
        "Costo cumulato YTD": row.totalCost,
        "Commessa prevalente": row.prevalentJobOrder,
        "% allocazione prevalente": row.prevalentJobOrderPercentage,
        "Numero commesse lavorate": row.jobOrderCount,
        "Ultimo caricamento": row.lastLoading,
      }))
    ),
    "Riepilogo"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      dashboard.rows.flatMap((row) =>
        row.detail.jobOrders.map((jobOrder) => ({
          Risorsa: row.resourceLabel,
          "Tipo risorsa": row.resourceTypeLabel,
          Commessa: jobOrder.jobOrderName,
          "Ore caricate": jobOrder.hours,
          "Costo imputato": jobOrder.cost,
          "% allocazione": jobOrder.percentage,
        }))
      )
    ),
    "Distribuzione"
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.json_to_sheet(
      dashboard.rows.flatMap((row) =>
        row.detail.monthlyRows.map((monthRow) => ({
          Risorsa: row.resourceLabel,
          "Tipo risorsa": row.resourceTypeLabel,
          Mese: monthRow.monthLabel,
          Commessa: monthRow.jobOrderName,
          Ore: monthRow.hours,
          Costo: monthRow.cost,
          "% sul mese": monthRow.percentage,
        }))
      )
    ),
    "Mensile"
  );

  const fileName = `dashboard-caricamenti-${year}-${safeFileSegment(resourceType)}.xlsx`;

  return makeExcelResponse(workbook, fileName);
}
