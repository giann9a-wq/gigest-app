import { getJobOrderDashboard } from "@/lib/job-order-dashboard";
import { prisma } from "@/lib/prisma";

export type NegativeMarginSiteAlert = {
  id: string;
  name: string;
  margin: number;
  snoozedUntil: string | null;
};

export async function getNegativeMarginSiteAlerts(options?: { includeSnoozed?: boolean }) {
  const jobOrders = await prisma.jobOrder.findMany({
    where: {
      status: "ACTIVE",
      type: "SITE",
      isOwnAccountSite: false,
    },
    orderBy: { name: "asc" },
    select: { id: true },
  });

  const dashboards = await Promise.all(jobOrders.map((jobOrder) => getJobOrderDashboard(jobOrder.id)));
  const now = Date.now();

  return dashboards
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .filter((row) => row.actual.grossMargin < 0)
    .map((row): NegativeMarginSiteAlert => ({
      id: row.jobOrder.id,
      name: row.jobOrder.name,
      margin: row.actual.grossMargin,
      snoozedUntil: row.jobOrder.negativeMarginAlertSnoozedUntil,
    }))
    .filter(
      (alert) =>
        options?.includeSnoozed ||
        !alert.snoozedUntil ||
        new Date(alert.snoozedUntil).getTime() <= now
    );
}
