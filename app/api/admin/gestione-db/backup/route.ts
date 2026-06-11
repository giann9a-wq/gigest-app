import { NextResponse } from "next/server";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { buildBackupFileName, createDatabaseBackup } from "@/lib/database-backup";

export async function GET() {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    return NextResponse.json({ error: "Non autorizzato" }, { status: 403 });
  }

  const backup = await createDatabaseBackup();
  const body = JSON.stringify(backup, null, 2);
  const fileName = buildBackupFileName();

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
