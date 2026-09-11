import * as XLSX from "xlsx";
import { Prisma, PriceListVersionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type PriceListSource = {
  name: string;
  buffer: Buffer;
};

type ParsedItem = {
  code: string;
  description: string;
  unit: string | null;
  price: Prisma.Decimal;
  sourceFile: string;
  category: string | null;
};

const ALLOWED_FILE_PREFIXES = ["A)", "C)", "E)", "F)"];

function cleanText(value: unknown) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}
function parsePrice(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = cleanText(value).replace(/\./g, "").replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUnit(value: unknown) {
  const unit = cleanText(value).replace(/^1\s+/, "");
  return unit || null;
}

export function isSupportedPriceListFile(name: string) {
  return /\.xlsx?$/i.test(name) && ALLOWED_FILE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

export function parsePriceListWorkbook(source: PriceListSource): ParsedItem[] {
  if (!isSupportedPriceListFile(source.name)) return [];

  const workbook = XLSX.read(source.buffer, { type: "buffer", dense: true, cellDates: false });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  });
  const headers = (rows[0] ?? []).map(cleanText);
  const codeIndex = headers.indexOf("Codice");
  const descriptionIndex = headers.indexOf("Declaratoria");
  const priceIndex = headers.indexOf("Prezzo");
  const unitIndex = headers.findIndex((header) => header === "U.M." || header === "U. M.");
  const categoryIndex = headers.indexOf("Descr. Liv. 1");

  if (codeIndex < 0 || descriptionIndex < 0 || priceIndex < 0) {
    throw new Error(`Il file ${source.name} non contiene le colonne Codice, Declaratoria e Prezzo.`);
  }

  const seen = new Set<string>();
  const items: ParsedItem[] = [];

  for (const row of rows.slice(1)) {
    const code = cleanText(row[codeIndex]);
    const description = cleanText(row[descriptionIndex]);
    const price = parsePrice(row[priceIndex]);
    if (!code || !description || price === null) continue;

    const uniqueKey = `${code}\u0000${source.name}`;
    if (seen.has(uniqueKey)) continue;
    seen.add(uniqueKey);

    items.push({
      code,
      description,
      unit: unitIndex >= 0 ? normalizeUnit(row[unitIndex]) : null,
      price: new Prisma.Decimal(price.toFixed(4)),
      sourceFile: source.name,
      category: categoryIndex >= 0 ? cleanText(row[categoryIndex]) || null : null,
    });
  }

  return items;
}

export async function importPriceList(input: {
  name: string;
  sourceLabel?: string;
  createdById?: string;
  files: PriceListSource[];
}) {
  const supportedFiles = input.files.filter((file) => isSupportedPriceListFile(file.name));
  if (supportedFiles.length === 0) {
    throw new Error("Carica almeno uno dei file A, C, E o F del prezzario in formato XLSX.");
  }

  const version = await prisma.priceListVersion.create({
    data: {
      name: input.name.trim() || `Prezzario ${new Date().getFullYear()}`,
      sourceLabel: input.sourceLabel?.trim() || null,
      createdById: input.createdById || null,
      status: PriceListVersionStatus.IMPORTING,
    },
  });

  try {
    const items = supportedFiles.flatMap(parsePriceListWorkbook);
    if (items.length === 0) throw new Error("Nessuna voce di listino valida trovata nei file caricati.");

    for (let index = 0; index < items.length; index += 1_000) {
      await prisma.priceListItem.createMany({
        data: items.slice(index, index + 1_000).map((item) => ({ ...item, versionId: version.id })),
        skipDuplicates: true,
      });
    }

    const itemCount = await prisma.priceListItem.count({ where: { versionId: version.id } });
    await prisma.$transaction([
      prisma.priceListVersion.updateMany({
        where: { id: { not: version.id }, status: PriceListVersionStatus.ACTIVE },
        data: { status: PriceListVersionStatus.ARCHIVED },
      }),
      prisma.priceListVersion.update({
        where: { id: version.id },
        data: { status: PriceListVersionStatus.ACTIVE, itemCount, importedAt: new Date() },
      }),
    ]);

    return { versionId: version.id, itemCount, fileCount: supportedFiles.length };
  } catch (error) {
    await prisma.priceListVersion.update({
      where: { id: version.id },
      data: { status: PriceListVersionStatus.FAILED },
    });
    throw error;
  }
}
