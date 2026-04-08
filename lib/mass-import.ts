import { Prisma, ResourceType } from "@prisma/client";
import * as XLSX from "xlsx";

export type ImportDomain = {
  resources: Array<{
    value: string;
    label: string;
    type: "PERSON" | "EQUIPMENT";
  }>;
  jobOrders: Array<{
    id: string;
    name: string;
    type: string;
  }>;
};

export type ParsedImportRow = {
  rowNumber: number;
  referenceDate: string;
  resourceLabel: string;
  jobOrderName: string;
  hours: string;
  activityDescription: string;
};

export type ImportValidationError = {
  rowNumber: number;
  error: string;
};

export type ValidatedImportRow = {
  rowNumber: number;
  referenceDate: string;
  resourceValue: string;
  resourceType: ResourceType;
  personId: string | null;
  equipmentId: string | null;
  resourceLabel: string;
  jobOrderId: string;
  jobOrderName: string;
  hours: number;
  activityDescription: string;
};

const IMPORT_HEADERS = [
  "Data",
  "Risorsa",
  "Commessa",
  "Ore",
  "Descrizione",
] as const;

function normalizeValue(value: string) {
  return value.trim().toLowerCase();
}

export function buildTemplateWorkbook(domain: ImportDomain) {
  const workbook = XLSX.utils.book_new();

  const importSheet = XLSX.utils.aoa_to_sheet([
    [...IMPORT_HEADERS],
    ["2026-04-08", domain.resources[0]?.label ?? "", domain.jobOrders[0]?.name ?? "", "8", "Descrizione attivita"],
  ]);
  const resourcesSheet = XLSX.utils.json_to_sheet(
    domain.resources.map((resource) => ({
      Risorsa: resource.label,
      Tipo: resource.type,
      Chiave: resource.value,
    }))
  );
  const jobOrdersSheet = XLSX.utils.json_to_sheet(
    domain.jobOrders.map((jobOrder) => ({
      Commessa: jobOrder.name,
      Tipo: jobOrder.type,
      Id: jobOrder.id,
    }))
  );

  XLSX.utils.book_append_sheet(workbook, importSheet, "Import");
  XLSX.utils.book_append_sheet(workbook, resourcesSheet, "Dominio Risorse");
  XLSX.utils.book_append_sheet(workbook, jobOrdersSheet, "Dominio Commesse");

  return workbook;
}

export function parseWorkbookRows(fileBuffer: ArrayBuffer): ParsedImportRow[] {
  const workbook = XLSX.read(Buffer.from(fileBuffer), { type: "buffer" });
  const importSheet = workbook.Sheets["Import"];

  if (!importSheet) {
    throw new Error('Il file deve contenere un foglio chiamato "Import"');
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(importSheet, {
    defval: "",
  });

  return rows.map((row, index) => ({
    rowNumber: index + 2,
    referenceDate: String(row.Data ?? "").trim(),
    resourceLabel: String(row.Risorsa ?? "").trim(),
    jobOrderName: String(row.Commessa ?? "").trim(),
    hours: String(row.Ore ?? "").trim(),
    activityDescription: String(row.Descrizione ?? "").trim(),
  }));
}

export function validateImportRows(rows: ParsedImportRow[], domain: ImportDomain) {
  const resourceIndex = new Map(
    domain.resources.map((resource) => [normalizeValue(resource.label), resource] as const)
  );
  const jobOrderIndex = new Map(
    domain.jobOrders.map((jobOrder) => [normalizeValue(jobOrder.name), jobOrder] as const)
  );

  const validRows: ValidatedImportRow[] = [];
  const errors: ImportValidationError[] = [];

  for (const row of rows) {
    if (
      !row.referenceDate &&
      !row.resourceLabel &&
      !row.jobOrderName &&
      !row.hours &&
      !row.activityDescription
    ) {
      continue;
    }

    if (!row.referenceDate || !row.resourceLabel || !row.jobOrderName || !row.hours) {
      errors.push({
        rowNumber: row.rowNumber,
        error: "Ogni riga compilata deve avere Data, Risorsa, Commessa e Ore.",
      });
      continue;
    }

    const parsedDate = new Date(`${row.referenceDate}T00:00:00.000Z`);
    if (Number.isNaN(parsedDate.getTime())) {
      errors.push({
        rowNumber: row.rowNumber,
        error: "Data non valida. Usa il formato AAAA-MM-GG.",
      });
      continue;
    }

    const resource = resourceIndex.get(normalizeValue(row.resourceLabel));
    if (!resource) {
      errors.push({
        rowNumber: row.rowNumber,
        error: `Risorsa non riconosciuta: "${row.resourceLabel}". Usa una voce del template.`,
      });
      continue;
    }

    const jobOrder = jobOrderIndex.get(normalizeValue(row.jobOrderName));
    if (!jobOrder) {
      errors.push({
        rowNumber: row.rowNumber,
        error: `Commessa non riconosciuta: "${row.jobOrderName}". Usa una voce del template.`,
      });
      continue;
    }

    const hours = Number(row.hours.replace(",", "."));
    if (Number.isNaN(hours) || hours <= 0) {
      errors.push({
        rowNumber: row.rowNumber,
        error: "Ore non valide. Inserisci un numero maggiore di zero.",
      });
      continue;
    }

    const [resourceType, resourceId] = resource.value.split(":");

    validRows.push({
      rowNumber: row.rowNumber,
      referenceDate: row.referenceDate,
      resourceValue: resource.value,
      resourceType: resourceType as ResourceType,
      personId: resourceType === "PERSON" ? resourceId : null,
      equipmentId: resourceType === "EQUIPMENT" ? resourceId : null,
      resourceLabel: resource.label,
      jobOrderId: jobOrder.id,
      jobOrderName: jobOrder.name,
      hours: Math.round(hours * 10) / 10,
      activityDescription: row.activityDescription,
    });
  }

  return {
    validRows,
    errors,
  };
}

export function buildCreateManyInput(
  rows: ValidatedImportRow[],
  userId: string
): Prisma.DiaryActivityCreateManyInput[] {
  return rows.map((row) => ({
    referenceDate: new Date(`${row.referenceDate}T00:00:00.000Z`),
    resourceType: row.resourceType,
    personId: row.personId,
    equipmentId: row.equipmentId,
    jobOrderId: row.jobOrderId,
    hours: new Prisma.Decimal(row.hours.toFixed(1)),
    activityDescription: row.activityDescription || null,
    createdByUserId: userId,
    updatedByUserId: userId,
  }));
}
