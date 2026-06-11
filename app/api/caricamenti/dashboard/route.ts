import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  getLoadingDashboard,
  getLoadingDashboardOptions,
  validateLoadingDashboardFilters,
  type LoadingDashboardTypeFilter,
} from "@/lib/caricamenti-dashboard";

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

  const [options, dashboard] = await Promise.all([getLoadingDashboardOptions(), getLoadingDashboard(filters)]);

  return NextResponse.json({
    ...dashboard,
    options,
  });
}
