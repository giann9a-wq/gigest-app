import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getCaricamentiRows, validateCaricamentiFilters } from "@/lib/caricamenti";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const resourceValues = request.nextUrl.searchParams.getAll("resourceValue");
  const jobOrderId = request.nextUrl.searchParams.get("jobOrderId")?.trim() ?? "";
  const from = request.nextUrl.searchParams.get("from") ?? "";
  const to = request.nextUrl.searchParams.get("to") ?? "";

  if (resourceValues.length === 0) {
    return NextResponse.json({ rows: [] });
  }

  const validation = validateCaricamentiFilters({
    resourceValues,
    jobOrderId,
    from,
    to,
  });

  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }

  const rows = await getCaricamentiRows({ resourceValues, jobOrderId, from, to });

  return NextResponse.json({ rows });
}
