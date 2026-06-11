import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getJobOrderDashboard } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";
import { UserStatus } from "@prisma/client";

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

  const activeJobOrders = await prisma.jobOrder.findMany({
    where: {
      status: "ACTIVE",
      type: { in: ["SITE", "OTHER"] },
    },
    orderBy: [{ name: "asc" }],
    select: { id: true },
  });

  const dashboards = await Promise.all(activeJobOrders.map((jobOrder) => getJobOrderDashboard(jobOrder.id)));

  return NextResponse.json({
    rows: dashboards.filter(Boolean),
  });
}
