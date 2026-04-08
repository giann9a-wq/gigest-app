import { NextResponse } from "next/server";
import { hasElevatedAdminPanelAccess, requireAdminUser } from "@/lib/admin-panel";
import { getImportDomain } from "@/lib/import-domain";
import { buildCreateManyInput, parseWorkbookRows, validateImportRows } from "@/lib/mass-import";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  }

  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  if (!hasElevatedAccess) {
    return NextResponse.json({ error: "Area admin non sbloccata" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Seleziona un file Excel valido." }, { status: 400 });
  }

  const domain = await getImportDomain();
  const parsedRows = parseWorkbookRows(await file.arrayBuffer());
  const { validRows, errors } = validateImportRows(parsedRows, domain);

  const createManyInput = buildCreateManyInput(validRows, adminUser.id);

  if (createManyInput.length > 0) {
    await prisma.diaryActivity.createMany({
      data: createManyInput,
    });
  }

  return NextResponse.json({
    success: errors.length === 0,
    importedRows: createManyInput.length,
    rejectedRows: errors.length,
    errors,
  });
}
