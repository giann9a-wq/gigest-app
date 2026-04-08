import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCaricamentiRows, validateCaricamentiFilters } from "@/lib/caricamenti";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const resourceValue = request.nextUrl.searchParams.get("resourceValue")?.trim() ?? "";
  const jobOrderId = request.nextUrl.searchParams.get("jobOrderId")?.trim() ?? "";
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";

  if (!resourceValue) {
    return NextResponse.json({ rows: [] });
  }

  const validation = validateCaricamentiFilters({
    resourceValue,
    jobOrderId,
    from,
    to,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const rows = await getCaricamentiRows({ resourceValue, jobOrderId, from, to });

  return NextResponse.json({ rows });
}
