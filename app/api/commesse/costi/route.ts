import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  assertActiveUser,
  COST_CATEGORY_OPTIONS,
  getCostActualRows,
  getCostCategoryLabel,
  parseCostFilters,
} from "@/lib/cost-actual-queries";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.email) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const appUser = await assertActiveUser(session.user.email);
  if (!appUser) {
    return NextResponse.json({ error: "Utente non autorizzato" }, { status: 403 });
  }

  const mode = request.nextUrl.searchParams.get("mode") ?? "";

  if (mode === "options") {
    const [jobOrders, suppliers] = await Promise.all([
      prisma.jobOrder.findMany({
        orderBy: [{ name: "asc" }, { createdAt: "asc" }],
        select: { id: true, name: true },
      }),
      prisma.costActualEntry.findMany({
        distinct: ["supplierName"],
        where: { supplierName: { not: null } },
        orderBy: { supplierName: "asc" },
        select: { supplierName: true },
      }),
    ]);

    return NextResponse.json({
      jobOrders,
      suppliers: suppliers.map((supplier) => supplier.supplierName).filter(Boolean),
      categories: COST_CATEGORY_OPTIONS.map((category) => ({
        key: category,
        label: getCostCategoryLabel(category),
      })),
    });
  }

  const filters = parseCostFilters(request.nextUrl.searchParams);
  const rows = await getCostActualRows(filters);
  const totalAmount = rows.reduce((sum, row) => sum + row.amount, 0);

  return NextResponse.json({
    rows,
    totalAmount,
    appliedFilters: filters,
  });
}

