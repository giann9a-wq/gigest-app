import { NextResponse } from "next/server";
import { hasElevatedAdminPanelAccess, requireAdminUser } from "@/lib/admin-panel";
import { makeExcelResponse } from "@/lib/excel";
import { getImportDomain } from "@/lib/import-domain";
import { buildTemplateWorkbook } from "@/lib/mass-import";

export async function GET() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  if (!hasElevatedAccess) {
    return NextResponse.json({ error: "Area admin non sbloccata" }, { status: 403 });
  }

  const domain = await getImportDomain();
  const workbook = buildTemplateWorkbook(domain);

  return makeExcelResponse(workbook, "template-import-massivo-gigest.xlsx");
}
