import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJobOrderDashboard } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";
import { ResourceStatus, UserStatus } from "@prisma/client";

export async function GET() {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { id: true, status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const visibleJobOrders = await prisma.jobOrder.findMany({
    where: {
      status: { in: [ResourceStatus.ACTIVE, ResourceStatus.COMPLETED] },
      type: { in: ["SITE", "OTHER"] },
    },
    orderBy: [{ name: "asc" }],
    select: { id: true },
  });

  const dashboards = await Promise.all(visibleJobOrders.map((jobOrder) => getJobOrderDashboard(jobOrder.id)));

  return NextResponse.json({
    rows: dashboards.filter(Boolean),
  });
}
