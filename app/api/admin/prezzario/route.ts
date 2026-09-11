import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { importPriceList } from "@/lib/price-list-import";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await requireElevatedAdminUser())) return NextResponse.json({ error: "Accesso admin richiesto" }, { status: 403 });
  const versions = await prisma.priceListVersion.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ versions });
}

export async function POST(request: NextRequest) {
  const user = await requireElevatedAdminUser();
  if (!user) return NextResponse.json({ error: "Accesso admin richiesto" }, { status: 403 });
  try {
    const form = await request.formData();
    const files = (form.getAll("files") as File[]).filter((file) => file.size > 0);
    const sources: Array<{ name: string; buffer: Buffer }> = [];
    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (/\.zip$/i.test(file.name)) {
        const zip = await JSZip.loadAsync(buffer);
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || !/\.xlsx?$/i.test(entry.name)) continue;
          sources.push({ name: entry.name.split("/").pop() || entry.name, buffer: Buffer.from(await entry.async("uint8array")) });
        }
      } else {
        sources.push({ name: file.name, buffer });
      }
    }
    const result = await importPriceList({ name: String(form.get("name") ?? "").trim(), sourceLabel: String(form.get("sourceLabel") ?? "").trim(), createdById: user.id, files: sources });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import non riuscito" }, { status: 400 });
  }
}
