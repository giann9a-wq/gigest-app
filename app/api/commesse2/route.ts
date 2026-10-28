import { NextResponse } from "next/server";
import { getActiveAppUser } from "@/lib/app-user";
import { getJobOrdersOverview } from "@/lib/job-orders-overview";

export async function GET() {
  if (!await getActiveAppUser()) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  return NextResponse.json({ rows: await getJobOrdersOverview() });
}
