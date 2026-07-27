import { NextRequest, NextResponse } from "next/server";
import { UserStatus } from "@prisma/client";
import { auth } from "@/auth";
import { getJobOrderDashboard } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: { status: true },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const { id } = await context.params;
  const dashboard = await getJobOrderDashboard(id);

  if (!dashboard) {
    return NextResponse.json({ error: "Commessa non trovata" }, { status: 404 });
  }

  const isAlertActive =
    dashboard.jobOrder.status === "ACTIVE" &&
    dashboard.jobOrder.type === "SITE" &&
    !dashboard.jobOrder.isOwnAccountSite &&
    dashboard.actual.grossMargin < 0;

  if (!isAlertActive) {
    return NextResponse.json({ error: "L'alert non è più attivo per questa commessa" }, { status: 409 });
  }

  const snoozedUntil = new Date();
  snoozedUntil.setUTCDate(snoozedUntil.getUTCDate() + 30);

  await prisma.jobOrder.update({
    where: { id },
    data: { negativeMarginAlertSnoozedUntil: snoozedUntil },
  });

  return NextResponse.json({ success: true, snoozedUntil: snoozedUntil.toISOString() });
}
