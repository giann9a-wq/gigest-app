import { NextRequest, NextResponse } from "next/server";
import { PriceListVersionStatus } from "@prisma/client";
import { getActiveAppUser } from "@/lib/app-user";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  if (!(await getActiveAppUser())) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const search = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const page = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "0", 10) || 0);
  const pageSize = Math.min(
    200,
    Math.max(20, Number.parseInt(request.nextUrl.searchParams.get("pageSize") ?? "100", 10) || 100)
  );
  const version = await prisma.priceListVersion.findFirst({
    where: { status: PriceListVersionStatus.ACTIVE },
    orderBy: { importedAt: "desc" },
  });

  if (!version || search.length < 2) {
    return NextResponse.json({
      version: version ? { id: version.id, name: version.name, itemCount: version.itemCount } : null,
      rows: [],
      total: 0,
      page,
      pageSize,
      hasMore: false,
    });
  }

  const tokens = search.split(/\s+/).filter(Boolean).slice(0, 8);
  const where = {
    versionId: version.id,
    AND: tokens.map((token) => ({
      OR: [
        { code: { contains: token, mode: "insensitive" as const } },
        { description: { contains: token, mode: "insensitive" as const } },
        { regionalDescription: { contains: token, mode: "insensitive" as const } },
        { detailDescription: { contains: token, mode: "insensitive" as const } },
      ],
    })),
  };
  const [total, rows] = await Promise.all([
    prisma.priceListItem.count({ where }),
    prisma.priceListItem.findMany({
      where,
      orderBy: [{ code: "asc" }, { id: "asc" }],
      skip: page * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    version: { id: version.id, name: version.name, itemCount: version.itemCount },
    rows: rows.map((item) => ({
      id: item.id,
      code: item.code,
      description: item.description,
      regionalDescription: item.regionalDescription ?? item.description,
      detailDescription: item.detailDescription ?? "",
      unit: item.unit ?? "",
      price: Number(item.price),
      sourceFile: item.sourceFile,
      category: item.category ?? "",
    })),
    total,
    page,
    pageSize,
    hasMore: (page + 1) * pageSize < total,
  });
}
