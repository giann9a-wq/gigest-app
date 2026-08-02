import { createHash } from "crypto";
import * as XLSX from "xlsx";
import {
  CostActualCategory,
  CostImportMatchStatus,
  CostImportSessionStatus,
  CostImportSourceType,
  CostImportValidationStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type ParsedAccountContext = {
  code: string;
  description: string;
};

type ParsedSupplierContext = {
  code: string | null;
  name: string | null;
};

type ParsedMovementDraft = {
  rowIndex: number;
  rawData: unknown;
  sourceAccountCode: string | null;
  sourceAccountDescription: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  descriptionOriginal: string | null;
  descriptionNormalized: string | null;
  amount: number | null;
  quantity: number | null;
  suggestedCategory: CostActualCategory | null;
  sourceRowFingerprint: string | null;
  sourceRowFingerprintSource: string | null;
  fingerprint: string | null;
  fingerprintSource: string | null;
  matchStatus: CostImportMatchStatus;
  validationStatus: CostImportValidationStatus;
  validationNote: string | null;
  finalCategory: CostActualCategory | null;
  finalDescription: string | null;
};

type ParsedWorkbookResult = {
  rows: ParsedMovementDraft[];
  summary: {
    totalRows: number;
    parsedRows: number;
    invalidRows: number;
    duplicateRows: number;
    possibleDuplicateRows: number;
    newRows: number;
    ignoredRows: number;
    warnings: string[];
  };
};

type CleanWorkbookRow = {
  jobOrderId: string;
  jobOrderName: string;
  category: CostActualCategory | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  sourceAccountCode: string | null;
  sourceAccountDescription: string | null;
  description: string | null;
  amount: number | null;
  quantity: number | null;
  sourceRowIndex: number;
  parsingNote: string | null;
};

type ImportSessionDetails = Awaited<ReturnType<typeof getCostImportSessionDetails>>;
type PrismaKnownError = {
  code?: string;
  message?: string;
};

const HEADER_PREFIXES = ["PARTITARI", "Agenzia:", "Data esportazione:"];
const ACCOUNT_CODE_REGEX = /^303\.\d{2}\.\d{5}\s*-\s*(.+)$/i;
const SUPPLIER_CODE_REGEX = /^(212\.\d{5})\s*-\s*(.+)$/i;
const GENERIC_ACCOUNT_REGEX = /^(\d{3}\.\d{2}\.\d{5})\s*-\s*(.+)$/i;
const ITALIAN_DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;
const CLEAN_COST_SHEET_NAME = "Costi puliti";
const JOB_ORDER_DOMAIN_SHEET_NAME = "Dominio commesse";
const CLEAN_COST_COLUMNS = [
  "CommessaId",
  "CommessaNome",
  "CategoriaFinale",
  "DataDocumento",
  "DataRegistrazione",
  "NumeroDocumento",
  "FornitoreCodice",
  "FornitoreNome",
  "ContoCodice",
  "ContoDescrizione",
  "Descrizione",
  "Importo",
  "Quantita",
  "RigaOrigine",
  "NoteParsing",
] as const;

export function isCostImportSchemaMissingError(error: unknown) {
  const candidate = error as PrismaKnownError | undefined;
  const message = candidate?.message ?? "";

  return (
    candidate?.code === "P2021" ||
    candidate?.code === "P2022" ||
    message.includes('relation "CostImportSession" does not exist') ||
    message.includes('relation "CostImportRowStaging" does not exist') ||
    message.includes('relation "CostActualEntry" does not exist') ||
    message.includes('The table `public.CostImportSession` does not exist') ||
    message.includes('The table `public.CostImportRowStaging` does not exist') ||
    message.includes('The table `public.CostActualEntry` does not exist')
  );
}

export function getCostImportSchemaMissingMessage() {
  return "Il database dell'ambiente non ha ancora la migration dei costi actual. Esegui `prisma migrate deploy` prima di usare questa sezione.";
}

function normalizeText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cleanCell(value: unknown) {
  if (value == null) return "";
  return String(value).replace(/\r/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function parseItalianDate(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = cleanCell(value);
  if (!ITALIAN_DATE_REGEX.test(cleaned)) return null;
  const [day, month, year] = cleaned.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function parseDateInput(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = cleanCell(value);
  if (!cleaned) return null;

  if (ITALIAN_DATE_REGEX.test(cleaned)) {
    return parseItalianDate(cleaned);
  }

  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!isoMatch) return null;

  const [, year, month, day] = isoMatch;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

type ImportedSourceAllocation = {
  actualEntryId: string;
  jobOrderId: string;
  jobOrderName: string;
};

async function getImportedSourceAllocations(sourceFingerprints: Array<string | null>) {
  const uniqueFingerprints = [
    ...new Set(sourceFingerprints.filter((value): value is string => Boolean(value))),
  ];
  const allocationsByFingerprint = new Map<string, ImportedSourceAllocation[]>();

  if (uniqueFingerprints.length === 0) {
    return allocationsByFingerprint;
  }

  const historicalRows = await prisma.costImportRowStaging.findMany({
    where: {
      sourceRowFingerprint: { in: uniqueFingerprints },
      costActualEntries: { some: {} },
    },
    select: {
      sourceRowFingerprint: true,
      costActualEntries: {
        select: {
          id: true,
          jobOrderId: true,
          jobOrder: { select: { name: true } },
        },
      },
    },
  });

  const seenEntryIds = new Set<string>();

  for (const historicalRow of historicalRows) {
    if (!historicalRow.sourceRowFingerprint) continue;
    const bucket = allocationsByFingerprint.get(historicalRow.sourceRowFingerprint) ?? [];

    for (const entry of historicalRow.costActualEntries) {
      if (seenEntryIds.has(entry.id)) continue;
      seenEntryIds.add(entry.id);
      bucket.push({
        actualEntryId: entry.id,
        jobOrderId: entry.jobOrderId,
        jobOrderName: entry.jobOrder.name,
      });
    }

    allocationsByFingerprint.set(historicalRow.sourceRowFingerprint, bucket);
  }

  return allocationsByFingerprint;
}

function getAlreadyImportedSourceNote(
  currentJobOrderId: string,
  allocations: ImportedSourceAllocation[]
) {
  const jobOrders = [
    ...new Map(
      allocations.map((allocation) => [allocation.jobOrderId, allocation.jobOrderName])
    ).entries(),
  ].map(([id, name]) => ({ id, name }));
  const otherJobOrders = jobOrders.filter((jobOrder) => jobOrder.id !== currentJobOrderId);

  if (otherJobOrders.length === 1 && jobOrders.length === 1) {
    return `Gia importata in precedenza e spostata sulla commessa "${otherJobOrders[0].name}".`;
  }

  if (otherJobOrders.length > 0) {
    return `Gia importata in precedenza e ripartita/spostata sulle commesse: ${jobOrders
      .map((jobOrder) => jobOrder.name)
      .join(", ")}.`;
  }

  return "Riga sorgente gia importata in passato per questa commessa.";
}

function formatExcelDate(value: Date | null) {
  return value?.toISOString().slice(0, 10) ?? "";
}

function parseAmount(value: unknown) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(value.toFixed(2));
  }

  const cleaned = cleanCell(value);
  if (!cleaned) return null;
  const normalized = cleaned.includes(",") ? cleaned.replace(/\./g, "").replace(",", ".") : cleaned;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Number(parsed.toFixed(2));
}

function parseSignedMovementAmount(row: string[]) {
  const amountDare = parseAmount(row[11]);
  if (amountDare != null && amountDare !== 0) {
    return amountDare;
  }

  const amountAvere = parseAmount(row[12]);
  if (amountAvere != null && amountAvere !== 0) {
    return Number((-amountAvere).toFixed(2));
  }

  return null;
}

function toDecimal(value: number | null) {
  if (value == null) return null;
  return new Prisma.Decimal(value.toFixed(2));
}

function getCategoryFromSource(
  sourceAccountCode: string | null,
  sourceAccountDescription: string | null
) {
  const text = `${sourceAccountCode ?? ""} ${normalizeText(sourceAccountDescription)}`.trim();

  if (!text) return null;
  if (text.includes("MATERIE PRIME")) return CostActualCategory.MATERIE_PRIME;
  if (text.includes("PRESTAZIONI PROFESSIONALI") || text.includes("PROFESSIONISTI")) {
    return CostActualCategory.PRESTAZIONI_PROFESSIONALI;
  }
  if (text.includes("PRESTAZIONE TERZI") || text.includes("PRESTAZIONI TERZI")) {
    return CostActualCategory.PRESTAZIONI_TERZI;
  }
  if (text.includes("SPESE VARIE")) return CostActualCategory.SPESE_VARIE;
  return null;
}

function buildRowValidationState(input: {
  jobOrderId: string;
  sourceAccountCode: string | null;
  sourceAccountDescription: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  amount: number | null;
  finalCategory: CostActualCategory | null;
}) {
  const fingerprintData = buildFingerprintInput({
    jobOrderId: input.jobOrderId,
    sourceAccountCode: input.sourceAccountCode,
    supplierCode: input.supplierCode,
    supplierName: input.supplierName,
    documentDate: input.documentDate,
    registrationDate: input.registrationDate,
    documentNumber: input.documentNumber,
    amount: input.amount,
  });

  const notes = new Set<string>();

  if (!input.sourceAccountCode) {
    notes.add("Conto sorgente 303.* non rilevato.");
  }
  if (!input.finalCategory) {
    notes.add("Categoria non mappata automaticamente.");
  }
  if (!input.amount) {
    notes.add("Importo movimento non leggibile.");
  }
  if (!input.documentDate && !input.registrationDate) {
    notes.add("Data documento/registrazione assente.");
  }
  if (!input.supplierCode && !input.supplierName) {
    notes.add("Fornitore non rilevato dalle contropartite.");
  }
  if (!fingerprintData.fingerprint) {
    notes.add("Fingerprint incompleto: servono fornitore, documento, data e importo affidabili.");
  }

  return {
    fingerprint: fingerprintData.fingerprint,
    fingerprintSource: fingerprintData.fingerprintSource,
    matchStatus: notes.size > 0 ? CostImportMatchStatus.INVALID : CostImportMatchStatus.NEW,
    validationNote: notes.size > 0 ? `${[...notes].join(". ")}.` : null,
  };
}

function buildFingerprintInput(input: {
  jobOrderId: string;
  sourceAccountCode: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  amount: number | null;
}) {
  const supplierStable = input.supplierCode || normalizeText(input.supplierName) || "";
  const documentStable = normalizeText(input.documentNumber);
  const documentDateStable = input.documentDate?.toISOString().slice(0, 10) ?? "";
  const registrationDateStable = input.registrationDate?.toISOString().slice(0, 10) ?? "";
  const amountStable = input.amount == null ? "" : input.amount.toFixed(2);

  const requiredParts = [
    input.jobOrderId,
    input.sourceAccountCode ?? "",
    supplierStable,
    documentDateStable,
    documentStable,
    amountStable,
  ];

  const hasMinimumIdentity =
    Boolean(input.sourceAccountCode) &&
    Boolean(supplierStable) &&
    Boolean(amountStable) &&
    Boolean(documentDateStable || registrationDateStable) &&
    Boolean(documentStable);

  if (!hasMinimumIdentity) {
    return { fingerprint: null, fingerprintSource: requiredParts.join("|") };
  }

  const source = [
    input.jobOrderId,
    input.sourceAccountCode ?? "",
    supplierStable,
    documentDateStable,
    registrationDateStable,
    documentStable,
    amountStable,
  ].join("|");

  return {
    fingerprint: createHash("sha256").update(source).digest("hex"),
    fingerprintSource: source,
  };
}

function buildSourceRowFingerprintInput(input: {
  jobOrderId: string;
  sourceAccountCode: string | null;
  sourceAccountDescription: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  descriptionOriginal: string | null;
  amount: number | null;
}) {
  const parts = [
    input.jobOrderId,
    input.sourceAccountCode ?? "",
    normalizeText(input.sourceAccountDescription),
    input.supplierCode ?? "",
    normalizeText(input.supplierName),
    input.documentDate?.toISOString().slice(0, 10) ?? "",
    input.registrationDate?.toISOString().slice(0, 10) ?? "",
    normalizeText(input.documentNumber),
    normalizeText(input.descriptionOriginal),
    input.amount == null ? "" : input.amount.toFixed(2),
  ];

  const meaningfulParts = parts.filter(Boolean).length;
  const source = parts.join("|");

  if (meaningfulParts < 5) {
    return { fingerprint: null, fingerprintSource: source };
  }

  return {
    fingerprint: createHash("sha256").update(source).digest("hex"),
    fingerprintSource: source,
  };
}

function buildApprovedFallbackFingerprint(input: {
  jobOrderId: string;
  sourceRowFingerprint: string | null;
  rowId: string;
  sourceAccountCode: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  amount: number | null;
}) {
  const source = [
    "MANUAL_OVERRIDE",
    input.jobOrderId,
    input.sourceRowFingerprint ?? "",
    input.rowId,
    input.sourceAccountCode ?? "",
    input.supplierCode ?? "",
    normalizeText(input.supplierName),
    input.documentDate?.toISOString().slice(0, 10) ?? "",
    input.registrationDate?.toISOString().slice(0, 10) ?? "",
    normalizeText(input.documentNumber),
    input.amount == null ? "" : input.amount.toFixed(2),
  ].join("|");

  return {
    fingerprint: createHash("sha256").update(source).digest("hex"),
    fingerprintSource: source,
  };
}

function buildSplitFingerprint(input: {
  jobOrderId: string;
  sourceRowFingerprint: string | null;
  rowId: string;
  splitIndex: number;
  sourceAccountCode: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  amount: number | null;
}) {
  const source = [
    "SPLIT_ALLOCATION",
    input.jobOrderId,
    input.sourceRowFingerprint ?? "",
    input.rowId,
    String(input.splitIndex),
    input.sourceAccountCode ?? "",
    input.supplierCode ?? "",
    normalizeText(input.supplierName),
    input.documentDate?.toISOString().slice(0, 10) ?? "",
    input.registrationDate?.toISOString().slice(0, 10) ?? "",
    normalizeText(input.documentNumber),
    input.amount == null ? "" : input.amount.toFixed(2),
  ].join("|");

  return {
    fingerprint: createHash("sha256").update(source).digest("hex"),
    fingerprintSource: source,
  };
}

function extractAccountContext(row: string[]) {
  const cell = cleanCell(row[0]);
  const match = cell.match(ACCOUNT_CODE_REGEX);
  if (!match) return null;

  return {
    code: cell.split(" - ")[0] ?? "",
    description: match[1] ?? "",
  } satisfies ParsedAccountContext;
}

function extractSupplierContext(row: string[]) {
  const cell = cleanCell(row[8]);
  const match = cell.match(SUPPLIER_CODE_REGEX);
  if (!match) return null;

  return {
    code: match[1] ?? null,
    name: match[2] ?? null,
  } satisfies ParsedSupplierContext;
}

function extractFallbackCounterparty(row: string[]) {
  const cell = cleanCell(row[8]);
  const match = cell.match(GENERIC_ACCOUNT_REGEX);
  if (!match) return null;

  return {
    code: match[1] ?? null,
    name: match[2] ?? null,
  } satisfies ParsedSupplierContext;
}

function isMovementRow(row: string[]) {
  return Boolean(parseItalianDate(cleanCell(row[1]))) && Boolean(cleanCell(row[6]));
}

function isIgnorableRow(row: string[]) {
  const joined = row.map(cleanCell).filter(Boolean).join(" ");
  if (!joined) return true;
  if (HEADER_PREFIXES.some((prefix) => joined.startsWith(prefix))) return true;

  const marker = normalizeText(joined);
  return (
    marker.includes("SALDO PRECEDENTE") ||
    marker.includes("TOTALI") ||
    marker.includes("CONTROPARTITE")
  );
}

function createMovementDraft(
  row: string[],
  rowIndex: number,
  jobOrderId: string,
  accountContext: ParsedAccountContext | null
) {
  const registrationDate = parseItalianDate(cleanCell(row[1]));
  const documentDate = parseItalianDate(cleanCell(row[9]));
  const amount = parseSignedMovementAmount(row);
  const descriptionOriginal = cleanCell(row[6]) || cleanCell(row[5]) || null;
  const descriptionNormalized = normalizeText(descriptionOriginal);
  const sourceAccountCode = accountContext?.code ?? null;
  const sourceAccountDescription = accountContext?.description ?? null;
  const suggestedCategory = getCategoryFromSource(sourceAccountCode, sourceAccountDescription);
  const sourceRowData = buildSourceRowFingerprintInput({
    jobOrderId,
    sourceAccountCode,
    sourceAccountDescription,
    supplierCode: null,
    supplierName: null,
    documentDate,
    registrationDate,
    documentNumber: cleanCell(row[10]) || null,
    descriptionOriginal,
    amount,
  });

  const fingerprintData = buildFingerprintInput({
    jobOrderId,
    sourceAccountCode,
    supplierCode: null,
    supplierName: null,
    documentDate,
    registrationDate,
    documentNumber: cleanCell(row[10]) || null,
    amount,
  });

  const validationNoteParts: string[] = [];

  if (!accountContext) {
    validationNoteParts.push("Conto sorgente 303.* non rilevato.");
  }
  if (!documentDate && !registrationDate) {
    validationNoteParts.push("Data documento/registrazione assente.");
  }
  if (!amount) {
    validationNoteParts.push("Importo movimento non leggibile.");
  }
  if (!suggestedCategory) {
    validationNoteParts.push("Categoria non mappata automaticamente.");
  }

  const isInvalid = validationNoteParts.length > 0;

  return {
    rowIndex,
    rawData: row,
    sourceAccountCode,
    sourceAccountDescription,
    supplierCode: null,
    supplierName: null,
    documentDate,
    registrationDate,
    documentNumber: cleanCell(row[10]) || null,
    descriptionOriginal,
    descriptionNormalized: descriptionNormalized || null,
    amount,
    quantity: null,
    suggestedCategory,
    sourceRowFingerprint: sourceRowData.fingerprint,
    sourceRowFingerprintSource: sourceRowData.fingerprintSource,
    fingerprint: fingerprintData.fingerprint,
    fingerprintSource: fingerprintData.fingerprintSource,
    matchStatus: isInvalid ? CostImportMatchStatus.INVALID : CostImportMatchStatus.NEW,
    validationStatus: CostImportValidationStatus.PENDING,
    validationNote: validationNoteParts.length > 0 ? validationNoteParts.join(" ") : null,
    finalCategory: suggestedCategory,
    finalDescription: descriptionOriginal,
  } satisfies ParsedMovementDraft;
}

function attachSupplierToDraft(
  draft: ParsedMovementDraft,
  supplierContext: ParsedSupplierContext,
  jobOrderId: string
) {
  draft.supplierCode = supplierContext.code;
  draft.supplierName = supplierContext.name;

  const sourceRowData = buildSourceRowFingerprintInput({
    jobOrderId,
    sourceAccountCode: draft.sourceAccountCode,
    sourceAccountDescription: draft.sourceAccountDescription,
    supplierCode: draft.supplierCode,
    supplierName: draft.supplierName,
    documentDate: draft.documentDate,
    registrationDate: draft.registrationDate,
    documentNumber: draft.documentNumber,
    descriptionOriginal: draft.descriptionOriginal,
    amount: draft.amount,
  });

  draft.sourceRowFingerprint = sourceRowData.fingerprint;
  draft.sourceRowFingerprintSource = sourceRowData.fingerprintSource;

  const fingerprintData = buildFingerprintInput({
    jobOrderId,
    sourceAccountCode: draft.sourceAccountCode,
    supplierCode: draft.supplierCode,
    supplierName: draft.supplierName,
    documentDate: draft.documentDate,
    registrationDate: draft.registrationDate,
    documentNumber: draft.documentNumber,
    amount: draft.amount,
  });

  draft.fingerprint = fingerprintData.fingerprint;
  draft.fingerprintSource = fingerprintData.fingerprintSource;

  const notes = new Set((draft.validationNote ?? "").split(". ").map((item) => item.trim()).filter(Boolean));

  if (!draft.supplierCode && !draft.supplierName) {
    notes.add("Fornitore non rilevato dalle contropartite.");
  } else {
    notes.delete("Fornitore non rilevato dalle contropartite.");
  }

  if (!draft.fingerprint) {
    notes.add("Fingerprint incompleto: servono fornitore, documento, data e importo affidabili.");
  } else {
    notes.delete("Fingerprint incompleto: servono fornitore, documento, data e importo affidabili.");
  }

  const hasCriticalIssue =
    !draft.sourceAccountCode ||
    !draft.amount ||
    !draft.documentNumber ||
    (!draft.documentDate && !draft.registrationDate) ||
    (!draft.supplierCode && !draft.supplierName) ||
    !draft.finalCategory;

  draft.matchStatus = hasCriticalIssue ? CostImportMatchStatus.INVALID : CostImportMatchStatus.NEW;
  draft.validationNote = notes.size > 0 ? `${[...notes].join(". ")}.` : null;
}

export function parsePartitarioXls(buffer: Buffer, jobOrderId: string): ParsedWorkbookResult {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: false,
    raw: false,
    dense: false,
  });

  const firstSheet = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheet];
  const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    blankrows: false,
  });

  const parsedRows: ParsedMovementDraft[] = [];
  const warnings: string[] = [];
  let ignoredRows = 0;
  let currentAccount: ParsedAccountContext | null = null;
  let pendingMovement: ParsedMovementDraft | null = null;

  const flushPendingMovement = () => {
    if (!pendingMovement) return;

    if (!pendingMovement.supplierCode && !pendingMovement.supplierName) {
      attachSupplierToDraft(
        pendingMovement,
        { code: null, name: null },
        jobOrderId
      );
    }

    parsedRows.push(pendingMovement);
    pendingMovement = null;
  };

  rows.forEach((rawRow, index) => {
    const row = rawRow.map((cell) => cleanCell(cell));

    if (isIgnorableRow(row)) {
      ignoredRows += 1;
      return;
    }

    const accountContext = extractAccountContext(row);
    if (accountContext) {
      flushPendingMovement();
      currentAccount = accountContext;
      return;
    }

    if (isMovementRow(row)) {
      flushPendingMovement();
      pendingMovement = createMovementDraft(row, index + 1, jobOrderId, currentAccount);
      return;
    }

    const supplierContext = extractSupplierContext(row);
    if (supplierContext && pendingMovement) {
      attachSupplierToDraft(pendingMovement, supplierContext, jobOrderId);
      return;
    }

    const contropartitaCell = cleanCell(row[8]);
    if (pendingMovement && contropartitaCell) {
      const genericCounterparty = contropartitaCell.match(GENERIC_ACCOUNT_REGEX);
      const fallbackCounterparty = extractFallbackCounterparty(row);

      if (
        fallbackCounterparty &&
        !pendingMovement.supplierCode &&
        !pendingMovement.supplierName &&
        !String(fallbackCounterparty.code ?? "").startsWith("138.") &&
        !String(fallbackCounterparty.code ?? "").startsWith("217.")
      ) {
        attachSupplierToDraft(pendingMovement, fallbackCounterparty, jobOrderId);
      }

      if (genericCounterparty && !genericCounterparty[1].startsWith("212.")) {
        warnings.push(
          `Riga ${index + 1}: contropartita non fornitore ${genericCounterparty[1]} collegata al documento ${pendingMovement.documentNumber ?? "-"}.`
        );
      }
      ignoredRows += 1;
      return;
    }

    ignoredRows += 1;
  });

  flushPendingMovement();

  return {
    rows: parsedRows,
    summary: {
      totalRows: rows.length,
      parsedRows: parsedRows.length,
      invalidRows: parsedRows.filter((row) => row.matchStatus === CostImportMatchStatus.INVALID).length,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      newRows: parsedRows.filter((row) => row.matchStatus === CostImportMatchStatus.NEW).length,
      ignoredRows,
      warnings,
    },
  };
}

async function classifyParsedRows(
  jobOrderId: string,
  rows: ParsedMovementDraft[]
) {
  const [existingEntries, importedSourceAllocations] = await Promise.all([
    prisma.costActualEntry.findMany({
      where: { jobOrderId },
      select: {
        id: true,
        fingerprint: true,
        amount: true,
        documentDate: true,
        supplierCode: true,
        supplierName: true,
        documentNumber: true,
      },
    }),
    getImportedSourceAllocations(rows.map((row) => row.sourceRowFingerprint)),
  ]);

  const fingerprintSet = new Set(existingEntries.map((entry) => entry.fingerprint));

  for (const row of rows) {
    if (
      row.matchStatus === CostImportMatchStatus.INVALID
    ) {
      continue;
    }

    const sourceAllocations = row.sourceRowFingerprint
      ? importedSourceAllocations.get(row.sourceRowFingerprint) ?? []
      : [];

    if (sourceAllocations.length > 0) {
      row.matchStatus = CostImportMatchStatus.ALREADY_IMPORTED;
      row.validationNote = getAlreadyImportedSourceNote(jobOrderId, sourceAllocations);
      continue;
    }

    if (row.matchStatus === CostImportMatchStatus.UPDATED_DUPLICATE) {
      continue;
    }

    if (row.fingerprint && fingerprintSet.has(row.fingerprint)) {
      row.matchStatus = CostImportMatchStatus.ALREADY_IMPORTED;
      row.validationNote = "Fingerprint gia importato in passato per questa commessa.";
      continue;
    }

    const possibleDuplicate = existingEntries.find((entry) => {
      const sameDate =
        entry.documentDate?.toISOString().slice(0, 10) === row.documentDate?.toISOString().slice(0, 10);
      const sameAmount = Number(entry.amount) === (row.amount ?? Number.NaN);
      const sameSupplier =
        (entry.supplierCode && entry.supplierCode === row.supplierCode) ||
        normalizeText(entry.supplierName) === normalizeText(row.supplierName);
      const sameDocumentNumber =
        normalizeText(entry.documentNumber) === normalizeText(row.documentNumber);

      return sameDate && sameAmount && sameSupplier && !sameDocumentNumber;
    });

    if (possibleDuplicate) {
      row.matchStatus = CostImportMatchStatus.POSSIBLE_DUPLICATE;
      row.validationNote = "Possibile duplicato: data/importo/fornitore coincidono ma il fingerprint non e completo.";
    }
  }

  return {
    duplicateRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.ALREADY_IMPORTED).length,
    updatedDuplicateRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.UPDATED_DUPLICATE).length,
    possibleDuplicateRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.POSSIBLE_DUPLICATE).length,
    newRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.NEW).length,
    invalidRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.INVALID).length,
  };
}

async function classifyParsedRowsByJobOrder(rows: ParsedMovementDraft[]) {
  const rowsByJobOrder = new Map<string, ParsedMovementDraft[]>();

  for (const row of rows) {
    const assignedJobOrderId = (row as ParsedMovementDraft & { assignedJobOrderId?: string }).assignedJobOrderId ?? "";
    const bucket = rowsByJobOrder.get(assignedJobOrderId) ?? [];
    bucket.push(row);
    rowsByJobOrder.set(assignedJobOrderId, bucket);
  }

  for (const [jobOrderId, bucket] of rowsByJobOrder) {
    if (!jobOrderId) continue;
    await classifyParsedRows(jobOrderId, bucket);
  }

  return {
    duplicateRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.ALREADY_IMPORTED).length,
    updatedDuplicateRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.UPDATED_DUPLICATE).length,
    possibleDuplicateRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.POSSIBLE_DUPLICATE).length,
    newRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.NEW).length,
    invalidRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.INVALID).length,
  };
}

export async function createCleanCostWorkbookFromPartitario(input: {
  fileName: string;
  buffer: Buffer;
}) {
  const parsed = parsePartitarioXls(input.buffer, "__PARSING_ONLY__");
  const jobOrders = await prisma.jobOrder.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, type: true, status: true },
  });

  const workbook = XLSX.utils.book_new();
  workbook.Props = {
    Title: `Parsing costi ${input.fileName}`,
    Subject: "Template import costi pulito",
    CreatedDate: new Date(),
  };

  const costRows = parsed.rows.map((row) => ({
    CommessaId: "",
    CommessaNome: "",
    CategoriaFinale: row.finalCategory ?? "",
    DataDocumento: formatExcelDate(row.documentDate),
    DataRegistrazione: formatExcelDate(row.registrationDate),
    NumeroDocumento: row.documentNumber ?? "",
    FornitoreCodice: row.supplierCode ?? "",
    FornitoreNome: row.supplierName ?? "",
    ContoCodice: row.sourceAccountCode ?? "",
    ContoDescrizione: row.sourceAccountDescription ?? "",
    Descrizione: row.finalDescription ?? row.descriptionOriginal ?? "",
    Importo: row.amount ?? "",
    Quantita: row.quantity ?? "",
    RigaOrigine: row.rowIndex,
    NoteParsing: row.validationNote ?? "",
  }));
  const costSheet = XLSX.utils.json_to_sheet(costRows, {
    header: [...CLEAN_COST_COLUMNS],
  });
  costSheet["!cols"] = [
    { wch: 28 },
    { wch: 42 },
    { wch: 28 },
    { wch: 14 },
    { wch: 16 },
    { wch: 18 },
    { wch: 18 },
    { wch: 34 },
    { wch: 16 },
    { wch: 36 },
    { wch: 52 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 42 },
  ];
  XLSX.utils.book_append_sheet(workbook, costSheet, CLEAN_COST_SHEET_NAME);

  const domainSheet = XLSX.utils.json_to_sheet(
    jobOrders.map((jobOrder) => ({
      CommessaId: jobOrder.id,
      CommessaNome: jobOrder.name,
      Tipo: jobOrder.type,
      Stato: jobOrder.status,
    }))
  );
  domainSheet["!cols"] = [{ wch: 28 }, { wch: 48 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(workbook, domainSheet, JOB_ORDER_DOMAIN_SHEET_NAME);

  const legendSheet = XLSX.utils.aoa_to_sheet([
    ["Campo", "Uso"],
    ["CommessaId", "Obbligatorio per importare. Copialo dallo sheet Dominio commesse."],
    ["CommessaNome", "Facoltativo se CommessaId e valorizzato; utile per leggibilita."],
    ["CategoriaFinale", "Valori: MATERIE_PRIME, PRESTAZIONI_PROFESSIONALI, PRESTAZIONI_TERZI, SPESE_VARIE."],
    ["Importo", "Numero positivo o negativo. Mantieni i decimali come numero Excel."],
    ["DataDocumento/DataRegistrazione", "Formato consigliato: yyyy-mm-dd."],
  ]);
  legendSheet["!cols"] = [{ wch: 26 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(workbook, legendSheet, "Istruzioni");

  return {
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
    summary: parsed.summary,
  };
}

function getCleanWorkbookSheet(workbook: XLSX.WorkBook) {
  const sheetName =
    workbook.SheetNames.find((name) => normalizeText(name) === normalizeText(CLEAN_COST_SHEET_NAME)) ??
    workbook.SheetNames[0];
  return workbook.Sheets[sheetName];
}

function parseCleanWorkbookDate(value: unknown) {
  if (value instanceof Date) {
    const date = new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
  }

  return parseDateInput(value == null ? null : String(value));
}

function cleanWorkbookCategory(value: unknown) {
  const normalized = normalizeText(cleanCell(value)).replace(/\s+/g, "_");
  if (!normalized) return null;
  if (normalized === "MATERIE_PRIME") return CostActualCategory.MATERIE_PRIME;
  if (normalized === "PRESTAZIONI_PROFESSIONALI") return CostActualCategory.PRESTAZIONI_PROFESSIONALI;
  if (normalized === "PRESTAZIONI_TERZI") return CostActualCategory.PRESTAZIONI_TERZI;
  if (normalized === "SPESE_VARIE") return CostActualCategory.SPESE_VARIE;
  return null;
}

function cellByHeader(row: Record<string, unknown>, header: string) {
  return row[header] ?? row[header.toLowerCase()] ?? row[header.toUpperCase()] ?? "";
}

function parseCleanCostWorkbookRows(
  buffer: Buffer,
  jobOrderById: Map<string, { id: string; name: string }>,
  jobOrderByName: Map<string, { id: string; name: string }>
) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    raw: false,
  });
  const sheet = getCleanWorkbookSheet(workbook);
  if (!sheet) {
    throw new Error("Il file pulito non contiene fogli leggibili.");
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    blankrows: false,
  });
  const parsedRows: Array<ParsedMovementDraft & { assignedJobOrderId: string }> = [];
  const errors: string[] = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const isEmptyRow = CLEAN_COST_COLUMNS.every((column) => !cleanCell(cellByHeader(row, column)));
    if (isEmptyRow) return;

    const jobOrderId = cleanCell(cellByHeader(row, "CommessaId"));
    const jobOrderName = cleanCell(cellByHeader(row, "CommessaNome"));
    const jobOrder =
      (jobOrderId ? jobOrderById.get(jobOrderId) : null) ??
      (jobOrderName ? jobOrderByName.get(normalizeText(jobOrderName)) : null);

    if (!jobOrder) {
      errors.push(`Riga ${rowNumber}: commessa non valida o mancante.`);
      return;
    }

    const cleanRow: CleanWorkbookRow = {
      jobOrderId: jobOrder.id,
      jobOrderName: jobOrder.name,
      category: cleanWorkbookCategory(cellByHeader(row, "CategoriaFinale")),
      documentDate: parseCleanWorkbookDate(cellByHeader(row, "DataDocumento")),
      registrationDate: parseCleanWorkbookDate(cellByHeader(row, "DataRegistrazione")),
      documentNumber: cleanCell(cellByHeader(row, "NumeroDocumento")) || null,
      supplierCode: cleanCell(cellByHeader(row, "FornitoreCodice")) || null,
      supplierName: cleanCell(cellByHeader(row, "FornitoreNome")) || null,
      sourceAccountCode: cleanCell(cellByHeader(row, "ContoCodice")) || null,
      sourceAccountDescription: cleanCell(cellByHeader(row, "ContoDescrizione")) || null,
      description: cleanCell(cellByHeader(row, "Descrizione")) || null,
      amount: parseAmount(cellByHeader(row, "Importo")),
      quantity: parseAmount(cellByHeader(row, "Quantita")),
      sourceRowIndex: Number(cleanCell(cellByHeader(row, "RigaOrigine"))) || rowNumber,
      parsingNote: cleanCell(cellByHeader(row, "NoteParsing")) || null,
    };

    const validationState = buildRowValidationState({
      jobOrderId: cleanRow.jobOrderId,
      sourceAccountCode: cleanRow.sourceAccountCode,
      sourceAccountDescription: cleanRow.sourceAccountDescription,
      supplierCode: cleanRow.supplierCode,
      supplierName: cleanRow.supplierName,
      documentDate: cleanRow.documentDate,
      registrationDate: cleanRow.registrationDate,
      documentNumber: cleanRow.documentNumber,
      amount: cleanRow.amount,
      finalCategory: cleanRow.category,
    });
    const sourceRowData = buildSourceRowFingerprintInput({
      jobOrderId: cleanRow.jobOrderId,
      sourceAccountCode: cleanRow.sourceAccountCode,
      sourceAccountDescription: cleanRow.sourceAccountDescription,
      supplierCode: cleanRow.supplierCode,
      supplierName: cleanRow.supplierName,
      documentDate: cleanRow.documentDate,
      registrationDate: cleanRow.registrationDate,
      documentNumber: cleanRow.documentNumber,
      descriptionOriginal: cleanRow.description,
      amount: cleanRow.amount,
    });

    parsedRows.push({
      assignedJobOrderId: cleanRow.jobOrderId,
      rowIndex: cleanRow.sourceRowIndex,
      rawData: {
        ...row,
        jobOrderId: cleanRow.jobOrderId,
        jobOrderName: cleanRow.jobOrderName,
        importedFromCleanWorkbookRow: rowNumber,
      },
      sourceAccountCode: cleanRow.sourceAccountCode,
      sourceAccountDescription: cleanRow.sourceAccountDescription,
      supplierCode: cleanRow.supplierCode,
      supplierName: cleanRow.supplierName,
      documentDate: cleanRow.documentDate,
      registrationDate: cleanRow.registrationDate,
      documentNumber: cleanRow.documentNumber,
      descriptionOriginal: cleanRow.description,
      descriptionNormalized: normalizeText(cleanRow.description) || null,
      amount: cleanRow.amount,
      quantity: cleanRow.quantity,
      suggestedCategory: cleanRow.category,
      sourceRowFingerprint: sourceRowData.fingerprint,
      sourceRowFingerprintSource: sourceRowData.fingerprintSource,
      fingerprint: validationState.fingerprint,
      fingerprintSource: validationState.fingerprintSource,
      matchStatus: validationState.matchStatus,
      validationStatus: CostImportValidationStatus.PENDING,
      validationNote: [cleanRow.parsingNote, validationState.validationNote].filter(Boolean).join(" "),
      finalCategory: cleanRow.category,
      finalDescription: cleanRow.description,
    });
  });

  if (errors.length > 0) {
    throw new Error(`Correggi il file pulito prima dell'import: ${errors.slice(0, 8).join(" ")}`);
  }

  if (parsedRows.length === 0) {
    throw new Error("Il file pulito non contiene righe costo importabili.");
  }

  return parsedRows;
}

async function applySavedCorrections(jobOrderId: string, rows: ParsedMovementDraft[]) {
  const sourceFingerprints = rows
    .map((row) => row.sourceRowFingerprint)
    .filter((value): value is string => Boolean(value));

  if (sourceFingerprints.length === 0) {
    return;
  }

  const rules = await prisma.costImportCorrectionRule.findMany({
    where: {
      jobOrderId,
      sourceRowFingerprint: { in: sourceFingerprints },
    },
  });

  const rulesByFingerprint = new Map(rules.map((rule) => [rule.sourceRowFingerprint, rule]));

  for (const row of rows) {
    if (!row.sourceRowFingerprint) continue;
    const rule = rulesByFingerprint.get(row.sourceRowFingerprint);
    if (!rule) continue;

    row.sourceAccountCode = rule.sourceAccountCode ?? row.sourceAccountCode;
    row.sourceAccountDescription =
      rule.sourceAccountDescription ?? row.sourceAccountDescription;
    row.supplierCode = rule.supplierCode ?? row.supplierCode;
    row.supplierName = rule.supplierName ?? row.supplierName;
    row.documentDate = rule.documentDate ?? row.documentDate;
    row.registrationDate = rule.registrationDate ?? row.registrationDate;
    row.documentNumber = rule.documentNumber ?? row.documentNumber;
    row.amount = decimalToNumber(rule.amount) ?? row.amount;
    row.finalCategory = rule.finalCategory ?? row.finalCategory;
    row.finalDescription = rule.finalDescription ?? row.finalDescription;
    row.suggestedCategory = rule.finalCategory ?? row.suggestedCategory;

    const recalculated = buildRowValidationState({
      jobOrderId,
      sourceAccountCode: row.sourceAccountCode,
      sourceAccountDescription: row.sourceAccountDescription,
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
      documentDate: row.documentDate,
      registrationDate: row.registrationDate,
      documentNumber: row.documentNumber,
      amount: row.amount,
      finalCategory: row.finalCategory,
    });

    row.fingerprint = recalculated.fingerprint;
    row.fingerprintSource = recalculated.fingerprintSource;
    row.matchStatus = recalculated.matchStatus;
    row.validationNote = recalculated.validationNote;

    if (
      rule.finalFingerprint &&
      row.fingerprint &&
      rule.finalFingerprint !== row.fingerprint &&
      row.matchStatus !== CostImportMatchStatus.INVALID
    ) {
      row.matchStatus = CostImportMatchStatus.UPDATED_DUPLICATE;
      row.validationNote =
        "Correzione storica trovata, ma la riga sorgente risulta aggiornata rispetto all'import approvato precedente.";
    }
  }
}

async function evaluateEditedCostImportRow(input: {
  rowId: string;
  jobOrderId: string;
  sourceAccountCode: string | null;
  sourceAccountDescription: string | null;
  supplierCode: string | null;
  supplierName: string | null;
  documentDate: Date | null;
  registrationDate: Date | null;
  documentNumber: string | null;
  amount: number | null;
  finalCategory: CostActualCategory | null;
}) {
  const baseState = buildRowValidationState({
    jobOrderId: input.jobOrderId,
    sourceAccountCode: input.sourceAccountCode,
    sourceAccountDescription: input.sourceAccountDescription,
    supplierCode: input.supplierCode,
    supplierName: input.supplierName,
    documentDate: input.documentDate,
    registrationDate: input.registrationDate,
    documentNumber: input.documentNumber,
    amount: input.amount,
    finalCategory: input.finalCategory,
  });

  if (baseState.matchStatus === CostImportMatchStatus.INVALID || !baseState.fingerprint) {
    return baseState;
  }

  const currentRow = await prisma.costImportRowStaging.findUnique({
    where: { id: input.rowId },
    select: { sourceRowFingerprint: true },
  });
  const [existingEntries, importedSourceAllocations] = await Promise.all([
    prisma.costActualEntry.findMany({
      where: { jobOrderId: input.jobOrderId },
      select: {
        id: true,
        fingerprint: true,
        amount: true,
        documentDate: true,
        supplierCode: true,
        supplierName: true,
        documentNumber: true,
      },
    }),
    getImportedSourceAllocations([currentRow?.sourceRowFingerprint ?? null]),
  ]);
  const sourceAllocations = currentRow?.sourceRowFingerprint
    ? importedSourceAllocations.get(currentRow.sourceRowFingerprint) ?? []
    : [];

  if (sourceAllocations.length > 0) {
    return {
      ...baseState,
      matchStatus: CostImportMatchStatus.ALREADY_IMPORTED,
      validationNote: getAlreadyImportedSourceNote(input.jobOrderId, sourceAllocations),
    };
  }

  if (existingEntries.some((entry) => entry.fingerprint === baseState.fingerprint)) {
    return {
      ...baseState,
      matchStatus: CostImportMatchStatus.ALREADY_IMPORTED,
      validationNote: "Fingerprint gia importato in passato per questa commessa.",
    };
  }

  const possibleDuplicate = existingEntries.find((entry) => {
    const sameDate =
      entry.documentDate?.toISOString().slice(0, 10) === input.documentDate?.toISOString().slice(0, 10);
    const sameAmount = Number(entry.amount) === (input.amount ?? Number.NaN);
    const sameSupplier =
      (entry.supplierCode && entry.supplierCode === input.supplierCode) ||
      normalizeText(entry.supplierName) === normalizeText(input.supplierName);
    const sameDocumentNumber =
      normalizeText(entry.documentNumber) === normalizeText(input.documentNumber);

    return sameDate && sameAmount && sameSupplier && !sameDocumentNumber;
  });

  if (possibleDuplicate) {
    return {
      ...baseState,
      matchStatus: CostImportMatchStatus.POSSIBLE_DUPLICATE,
      validationNote:
        "Possibile duplicato: data/importo/fornitore coincidono ma il fingerprint non e completo.",
    };
  }

  return baseState;
}

export async function createCostImportSession(input: {
  jobOrderId: string;
  fileName: string;
  buffer: Buffer;
  uploadedById?: string | null;
}) {
  const jobOrder = await prisma.jobOrder.findUnique({
    where: { id: input.jobOrderId },
    select: { id: true },
  });

  if (!jobOrder) {
    throw new Error("Commessa non trovata.");
  }

  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const fileSizeBytes = input.buffer.byteLength;

  const parsed = parsePartitarioXls(input.buffer, input.jobOrderId);
  await applySavedCorrections(input.jobOrderId, parsed.rows);
  const classification = await classifyParsedRows(input.jobOrderId, parsed.rows);

  const summary = {
    ...parsed.summary,
    ...classification,
  };

  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.costImportSession.create({
      data: {
        jobOrderId: input.jobOrderId,
        fileName: input.fileName,
        fileHash,
        fileSizeBytes,
        storagePath: null,
        sourceType: CostImportSourceType.PARTITARIO_XLS,
        uploadedById: input.uploadedById ?? null,
        status: CostImportSessionStatus.PARSED,
        parseSummary: summary,
      },
      select: { id: true },
    });

    if (parsed.rows.length > 0) {
      await tx.costImportRowStaging.createMany({
        data: parsed.rows.map((row) => ({
          importSessionId: createdSession.id,
          jobOrderId: input.jobOrderId,
          rowIndex: row.rowIndex,
          rawData: row.rawData as Prisma.InputJsonValue,
          sourceAccountCode: row.sourceAccountCode,
          sourceAccountDescription: row.sourceAccountDescription,
          supplierCode: row.supplierCode,
          supplierName: row.supplierName,
          documentDate: row.documentDate,
          registrationDate: row.registrationDate,
          documentNumber: row.documentNumber,
          descriptionOriginal: row.descriptionOriginal,
          descriptionNormalized: row.descriptionNormalized,
          amount: toDecimal(row.amount),
          quantity: toDecimal(row.quantity),
          suggestedCategory: row.suggestedCategory,
          sourceRowFingerprint: row.sourceRowFingerprint,
          sourceRowFingerprintSource: row.sourceRowFingerprintSource,
          fingerprint: row.fingerprint,
          fingerprintSource: row.fingerprintSource,
          matchStatus: row.matchStatus,
          validationStatus: row.validationStatus,
          validationNote: row.validationNote,
          finalCategory: row.finalCategory,
          finalDescription: row.finalDescription,
        })),
      });
    }

    return createdSession;
  });

  return {
    sessionId: session.id,
    summary,
  };
}

export async function createCostImportSessionFromCleanWorkbook(input: {
  fileName: string;
  buffer: Buffer;
  uploadedById?: string | null;
}) {
  const jobOrders = await prisma.jobOrder.findMany({
    select: { id: true, name: true },
  });
  const jobOrderById = new Map(jobOrders.map((jobOrder) => [jobOrder.id, jobOrder]));
  const jobOrderByName = new Map(jobOrders.map((jobOrder) => [normalizeText(jobOrder.name), jobOrder]));
  const parsedRows = parseCleanCostWorkbookRows(input.buffer, jobOrderById, jobOrderByName);
  const firstJobOrderId = parsedRows[0]?.assignedJobOrderId;

  if (!firstJobOrderId) {
    throw new Error("Il file pulito non contiene una commessa valida.");
  }

  const rowsByJobOrder = new Map<string, ParsedMovementDraft[]>();
  for (const row of parsedRows) {
    const bucket = rowsByJobOrder.get(row.assignedJobOrderId) ?? [];
    bucket.push(row);
    rowsByJobOrder.set(row.assignedJobOrderId, bucket);
  }

  for (const [jobOrderId, rows] of rowsByJobOrder) {
    await applySavedCorrections(jobOrderId, rows);
  }

  const classification = await classifyParsedRowsByJobOrder(parsedRows);
  const summary = {
    totalRows: parsedRows.length,
    parsedRows: parsedRows.length,
    ignoredRows: 0,
    warnings: [],
    ...classification,
    importMode: "clean-workbook",
    jobOrderCount: rowsByJobOrder.size,
  };
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const fileSizeBytes = input.buffer.byteLength;

  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.costImportSession.create({
      data: {
        jobOrderId: firstJobOrderId,
        fileName: input.fileName,
        fileHash,
        fileSizeBytes,
        storagePath: null,
        sourceType: CostImportSourceType.PARTITARIO_XLS,
        uploadedById: input.uploadedById ?? null,
        status: CostImportSessionStatus.PARSED,
        parseSummary: summary,
      },
      select: { id: true },
    });

    await tx.costImportRowStaging.createMany({
      data: parsedRows.map((row) => ({
        importSessionId: createdSession.id,
        jobOrderId: row.assignedJobOrderId,
        rowIndex: row.rowIndex,
        rawData: JSON.parse(JSON.stringify(row.rawData)) as Prisma.InputJsonValue,
        sourceAccountCode: row.sourceAccountCode,
        sourceAccountDescription: row.sourceAccountDescription,
        supplierCode: row.supplierCode,
        supplierName: row.supplierName,
        documentDate: row.documentDate,
        registrationDate: row.registrationDate,
        documentNumber: row.documentNumber,
        descriptionOriginal: row.descriptionOriginal,
        descriptionNormalized: row.descriptionNormalized,
        amount: toDecimal(row.amount),
        quantity: toDecimal(row.quantity),
        suggestedCategory: row.suggestedCategory,
        sourceRowFingerprint: row.sourceRowFingerprint,
        sourceRowFingerprintSource: row.sourceRowFingerprintSource,
        fingerprint: row.fingerprint,
        fingerprintSource: row.fingerprintSource,
        matchStatus: row.matchStatus,
        validationStatus: row.validationStatus,
        validationNote: row.validationNote || null,
        finalCategory: row.finalCategory,
        finalDescription: row.finalDescription,
      })),
    });

    return createdSession;
  });

  return {
    sessionId: session.id,
    summary,
  };
}

function decimalToNumber(value: Prisma.Decimal | null) {
  if (value == null) return null;
  return Number(value);
}

async function refreshAlreadyImportedSourceStatuses(sessionId: string) {
  const rows = await prisma.costImportRowStaging.findMany({
    where: {
      importSessionId: sessionId,
      matchStatus: { not: CostImportMatchStatus.INVALID },
      sourceRowFingerprint: { not: null },
    },
    select: {
      id: true,
      jobOrderId: true,
      sourceRowFingerprint: true,
      matchStatus: true,
      validationNote: true,
    },
  });
  const importedSourceAllocations = await getImportedSourceAllocations(
    rows.map((row) => row.sourceRowFingerprint)
  );
  const updates = rows.flatMap((row) => {
    if (!row.sourceRowFingerprint) return [];
    const allocations = importedSourceAllocations.get(row.sourceRowFingerprint) ?? [];
    if (allocations.length === 0) return [];

    const validationNote = getAlreadyImportedSourceNote(row.jobOrderId, allocations);
    if (
      row.matchStatus === CostImportMatchStatus.ALREADY_IMPORTED &&
      row.validationNote === validationNote
    ) {
      return [];
    }

    return [
      prisma.costImportRowStaging.update({
        where: { id: row.id },
        data: {
          matchStatus: CostImportMatchStatus.ALREADY_IMPORTED,
          validationNote,
        },
      }),
    ];
  });

  if (updates.length > 0) {
    await prisma.$transaction(updates);
  }
}

export async function getCostImportSessionDetails(sessionId: string) {
  await refreshAlreadyImportedSourceStatuses(sessionId);

  const session = await prisma.costImportSession.findUnique({
    where: { id: sessionId },
    include: {
      jobOrder: {
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
        },
      },
      rows: {
        orderBy: [{ rowIndex: "asc" }, { createdAt: "asc" }],
        include: {
          jobOrder: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!session) {
    return null;
  }

  const stats = {
    total: session.rows.length,
    pending: session.rows.filter((row) => row.validationStatus === CostImportValidationStatus.PENDING).length,
    approved: session.rows.filter((row) => row.validationStatus === CostImportValidationStatus.APPROVED).length,
    rejected: session.rows.filter((row) => row.validationStatus === CostImportValidationStatus.REJECTED).length,
    alreadyImported: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.ALREADY_IMPORTED).length,
    updatedDuplicate: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.UPDATED_DUPLICATE).length,
    invalid: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.INVALID).length,
    possibleDuplicate: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.POSSIBLE_DUPLICATE).length,
    newRows: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.NEW).length,
  };

  const allJobOrders = await prisma.jobOrder.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
    },
  });

  return {
    id: session.id,
    fileName: session.fileName,
    sourceType: session.sourceType,
    status: session.status,
    uploadedAt: session.uploadedAt.toISOString(),
    parseSummary: session.parseSummary,
    appliedAt: session.appliedAt?.toISOString() ?? null,
    jobOrder: session.jobOrder,
    allJobOrders,
    stats,
    rows: session.rows.map((row) => ({
      id: row.id,
      jobOrderId: row.jobOrderId,
      jobOrderName: row.jobOrder.name,
      rowIndex: row.rowIndex,
      sourceAccountCode: row.sourceAccountCode,
      sourceAccountDescription: row.sourceAccountDescription,
      supplierCode: row.supplierCode,
      supplierName: row.supplierName,
      documentDate: row.documentDate?.toISOString().slice(0, 10) ?? "",
      registrationDate: row.registrationDate?.toISOString().slice(0, 10) ?? "",
      documentNumber: row.documentNumber ?? "",
      descriptionOriginal: row.descriptionOriginal ?? "",
      descriptionNormalized: row.descriptionNormalized ?? "",
      amount: decimalToNumber(row.amount),
      quantity: decimalToNumber(row.quantity),
      suggestedCategory: row.suggestedCategory,
      sourceRowFingerprint: row.sourceRowFingerprint,
      fingerprint: row.fingerprint,
      matchStatus: row.matchStatus,
      validationStatus: row.validationStatus,
      validationNote: row.validationNote ?? "",
      finalCategory: row.finalCategory,
      finalDescription: row.finalDescription ?? "",
    })),
  };
}

export async function updateCostImportRows(
  sessionId: string,
  input: {
    rowIds: string[];
    action: "approve" | "reject" | "set-category";
    category?: CostActualCategory | null;
  }
) {
  if (input.rowIds.length === 0) {
    return { updated: 0 };
  }

  const data =
    input.action === "approve"
      ? { validationStatus: CostImportValidationStatus.APPROVED }
      : input.action === "reject"
        ? { validationStatus: CostImportValidationStatus.REJECTED }
        : { finalCategory: input.category ?? null };

  const result = await prisma.costImportRowStaging.updateMany({
    where: {
      importSessionId: sessionId,
      id: { in: input.rowIds },
    },
    data,
  });

  await refreshImportSessionStatus(sessionId);

  return { updated: result.count };
}

export async function updateCostImportRow(
  sessionId: string,
  rowId: string,
  input: {
    sourceAccountCode?: string | null;
    sourceAccountDescription?: string | null;
    supplierCode?: string | null;
    supplierName?: string | null;
    documentDate?: string | null;
    registrationDate?: string | null;
    documentNumber?: string | null;
    amount?: number | string | null;
    finalDescription?: string;
    finalCategory?: CostActualCategory | null;
    jobOrderId?: string;
    validationNote?: string;
  }
) {
  const existing = await prisma.costImportRowStaging.findUnique({
    where: { id: rowId },
    select: {
      id: true,
      importSessionId: true,
      jobOrderId: true,
      sourceAccountCode: true,
      sourceAccountDescription: true,
      supplierCode: true,
      supplierName: true,
      documentDate: true,
      registrationDate: true,
      documentNumber: true,
      amount: true,
      finalCategory: true,
    },
  });

  if (!existing || existing.importSessionId !== sessionId) {
    throw new Error("Riga staging non coerente con la sessione.");
  }

  const jobOrderId =
    input.jobOrderId !== undefined ? cleanCell(input.jobOrderId) : existing.jobOrderId;

  if (!jobOrderId) {
    throw new Error("Commessa obbligatoria.");
  }

  if (input.jobOrderId !== undefined && input.jobOrderId !== existing.jobOrderId) {
    const targetJobOrder = await prisma.jobOrder.findUnique({
      where: { id: jobOrderId },
      select: { id: true },
    });

    if (!targetJobOrder) {
      throw new Error("Commessa non trovata.");
    }
  }

  const sourceAccountCode =
    input.sourceAccountCode !== undefined
      ? cleanCell(input.sourceAccountCode) || null
      : existing.sourceAccountCode;
  const sourceAccountDescription =
    input.sourceAccountDescription !== undefined
      ? cleanCell(input.sourceAccountDescription) || null
      : existing.sourceAccountDescription;
  const supplierCode =
    input.supplierCode !== undefined ? cleanCell(input.supplierCode) || null : existing.supplierCode;
  const supplierName =
    input.supplierName !== undefined ? cleanCell(input.supplierName) || null : existing.supplierName;
  const documentDate =
    input.documentDate !== undefined
      ? parseDateInput(typeof input.documentDate === "string" ? input.documentDate : null)
      : existing.documentDate;
  const registrationDate =
    input.registrationDate !== undefined
      ? parseDateInput(typeof input.registrationDate === "string" ? input.registrationDate : null)
      : existing.registrationDate;
  const documentNumber =
    input.documentNumber !== undefined
      ? cleanCell(input.documentNumber) || null
      : existing.documentNumber;
  const amount =
    input.amount !== undefined
      ? typeof input.amount === "number"
        ? Number(input.amount.toFixed(2))
        : parseAmount(input.amount)
      : decimalToNumber(existing.amount);
  const finalCategory =
    input.finalCategory !== undefined ? input.finalCategory : existing.finalCategory;

  const recalculatedState = await evaluateEditedCostImportRow({
    rowId,
    jobOrderId,
    sourceAccountCode,
    sourceAccountDescription,
    supplierCode,
    supplierName,
    documentDate,
    registrationDate,
    documentNumber,
    amount,
    finalCategory,
  });

  const updated = await prisma.costImportRowStaging.update({
    where: { id: rowId },
    data: {
      ...(input.sourceAccountCode !== undefined ? { sourceAccountCode } : {}),
      ...(input.sourceAccountDescription !== undefined ? { sourceAccountDescription } : {}),
      ...(input.supplierCode !== undefined ? { supplierCode } : {}),
      ...(input.supplierName !== undefined ? { supplierName } : {}),
      ...(input.documentDate !== undefined ? { documentDate } : {}),
      ...(input.registrationDate !== undefined ? { registrationDate } : {}),
      ...(input.documentNumber !== undefined ? { documentNumber } : {}),
      ...(input.amount !== undefined ? { amount: toDecimal(amount) } : {}),
      ...(input.finalDescription !== undefined ? { finalDescription: input.finalDescription } : {}),
      ...(input.finalCategory !== undefined ? { finalCategory } : {}),
      ...(input.jobOrderId !== undefined ? { jobOrderId } : {}),
      fingerprint: recalculatedState.fingerprint,
      fingerprintSource: recalculatedState.fingerprintSource,
      matchStatus: recalculatedState.matchStatus,
      validationNote:
        input.validationNote !== undefined
          ? input.validationNote
          : recalculatedState.validationNote,
    },
    select: { id: true, importSessionId: true },
  });

  await refreshImportSessionStatus(sessionId);

  return updated;
}

export async function splitCostImportRow(
  sessionId: string,
  rowId: string,
  input: {
    splits: Array<{
      jobOrderId: string;
      amount: number | string;
      finalCategory?: CostActualCategory | null;
      finalDescription?: string | null;
    }>;
  }
) {
  if (!Array.isArray(input.splits) || input.splits.length < 2) {
    throw new Error("Servono almeno due righe per dividere il costo.");
  }

  const existing = await prisma.costImportRowStaging.findUnique({
    where: { id: rowId },
    include: {
      importSession: {
        select: { id: true, status: true },
      },
    },
  });

  if (!existing || existing.importSessionId !== sessionId) {
    throw new Error("Riga staging non coerente con la sessione.");
  }

  if (existing.importSession.status === CostImportSessionStatus.APPLIED) {
    throw new Error("Non puoi dividere una sessione gia confermata.");
  }

  const originalAmount = decimalToNumber(existing.amount);
  if (originalAmount == null) {
    throw new Error("La riga origine non ha un importo valido da dividere.");
  }

  const normalizedSplits = input.splits.map((split, index) => {
    const amount =
      typeof split.amount === "number"
        ? Number(split.amount.toFixed(2))
        : parseAmount(split.amount);

    return {
      index,
      jobOrderId: cleanCell(split.jobOrderId),
      amount,
      finalCategory: split.finalCategory ?? existing.finalCategory,
      finalDescription:
        split.finalDescription === undefined || split.finalDescription === null
          ? existing.finalDescription
          : cleanCell(split.finalDescription),
    };
  });

  for (const split of normalizedSplits) {
    if (!split.jobOrderId) {
      throw new Error("Ogni riga di split deve avere una commessa.");
    }
    if (split.amount == null || split.amount <= 0) {
      throw new Error("Ogni riga di split deve avere un importo positivo.");
    }
    if (!split.finalCategory) {
      throw new Error("Ogni riga di split deve avere una categoria finale.");
    }
  }

  const originalCents = Math.round(originalAmount * 100);
  const splitCents = normalizedSplits.reduce(
    (total, split) => total + Math.round((split.amount ?? 0) * 100),
    0
  );

  if (splitCents !== originalCents) {
    throw new Error(
      `Il totale dello split deve essere ${originalAmount.toFixed(2)}. Totale inserito: ${(splitCents / 100).toFixed(2)}.`
    );
  }

  const jobOrderIds = [...new Set(normalizedSplits.map((split) => split.jobOrderId))];
  const jobOrders = await prisma.jobOrder.findMany({
    where: { id: { in: jobOrderIds } },
    select: { id: true },
  });
  const foundJobOrderIds = new Set(jobOrders.map((jobOrder) => jobOrder.id));

  if (jobOrderIds.some((id) => !foundJobOrderIds.has(id))) {
    throw new Error("Una o piu commesse dello split non esistono.");
  }

  const baseSplitSource = existing.sourceRowFingerprint ?? existing.id;
  const rowsToWrite = normalizedSplits.map((split) => {
    const sourceRowFingerprintSource = [
      existing.sourceRowFingerprintSource ?? "",
      `SPLIT:${split.index + 1}`,
      split.jobOrderId,
      split.amount?.toFixed(2) ?? "",
    ].join("|");
    const sourceRowFingerprint = createHash("sha256").update(sourceRowFingerprintSource || `${baseSplitSource}|${split.index + 1}`).digest("hex");
    const validationState = buildRowValidationState({
      jobOrderId: split.jobOrderId,
      sourceAccountCode: existing.sourceAccountCode,
      sourceAccountDescription: existing.sourceAccountDescription,
      supplierCode: existing.supplierCode,
      supplierName: existing.supplierName,
      documentDate: existing.documentDate,
      registrationDate: existing.registrationDate,
      documentNumber: existing.documentNumber,
      amount: split.amount,
      finalCategory: split.finalCategory,
    });
    const splitFingerprint = buildSplitFingerprint({
      jobOrderId: split.jobOrderId,
      sourceRowFingerprint,
      rowId: existing.id,
      splitIndex: split.index + 1,
      sourceAccountCode: existing.sourceAccountCode,
      supplierCode: existing.supplierCode,
      supplierName: existing.supplierName,
      documentDate: existing.documentDate,
      registrationDate: existing.registrationDate,
      documentNumber: existing.documentNumber,
      amount: split.amount,
    });

    return {
      split,
      sourceRowFingerprint,
      sourceRowFingerprintSource,
      fingerprint:
        validationState.matchStatus === CostImportMatchStatus.INVALID
          ? validationState.fingerprint
          : splitFingerprint.fingerprint,
      fingerprintSource:
        validationState.matchStatus === CostImportMatchStatus.INVALID
          ? validationState.fingerprintSource
          : splitFingerprint.fingerprintSource,
      matchStatus: validationState.matchStatus,
      validationNote:
        validationState.matchStatus === CostImportMatchStatus.INVALID
          ? validationState.validationNote
          : "Riga generata da split manuale. Verificare e approvare.",
    };
  });

  await prisma.$transaction(async (tx) => {
    const first = rowsToWrite[0];

    await tx.costImportRowStaging.update({
      where: { id: existing.id },
      data: {
        jobOrderId: first.split.jobOrderId,
        amount: toDecimal(first.split.amount),
        finalCategory: first.split.finalCategory,
        finalDescription: first.split.finalDescription,
        sourceRowFingerprint: first.sourceRowFingerprint,
        sourceRowFingerprintSource: first.sourceRowFingerprintSource,
        fingerprint: first.fingerprint,
        fingerprintSource: first.fingerprintSource,
        matchStatus: first.matchStatus,
        validationStatus: CostImportValidationStatus.PENDING,
        validationNote: first.validationNote,
      },
    });

    for (const item of rowsToWrite.slice(1)) {
      await tx.costImportRowStaging.create({
        data: {
          importSessionId: existing.importSessionId,
          jobOrderId: item.split.jobOrderId,
          rowIndex: existing.rowIndex,
          rawData: existing.rawData as Prisma.InputJsonValue,
          sourceAccountCode: existing.sourceAccountCode,
          sourceAccountDescription: existing.sourceAccountDescription,
          supplierCode: existing.supplierCode,
          supplierName: existing.supplierName,
          documentDate: existing.documentDate,
          registrationDate: existing.registrationDate,
          documentNumber: existing.documentNumber,
          descriptionOriginal: existing.descriptionOriginal,
          descriptionNormalized: existing.descriptionNormalized,
          amount: toDecimal(item.split.amount),
          quantity: existing.quantity,
          suggestedCategory: existing.suggestedCategory,
          sourceRowFingerprint: item.sourceRowFingerprint,
          sourceRowFingerprintSource: item.sourceRowFingerprintSource,
          fingerprint: item.fingerprint,
          fingerprintSource: item.fingerprintSource,
          matchStatus: item.matchStatus,
          validationStatus: CostImportValidationStatus.PENDING,
          validationNote: item.validationNote,
          finalCategory: item.split.finalCategory,
          finalDescription: item.split.finalDescription,
        },
      });
    }
  });

  await refreshImportSessionStatus(sessionId);

  return { splitCount: rowsToWrite.length };
}

async function refreshImportSessionStatus(sessionId: string) {
  const [session, rows] = await Promise.all([
    prisma.costImportSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    }),
    prisma.costImportRowStaging.findMany({
      where: { importSessionId: sessionId },
      select: { validationStatus: true },
    }),
  ]);

  if (!session || session.status === CostImportSessionStatus.APPLIED || session.status === CostImportSessionStatus.FAILED) {
    return;
  }

  const hasApproved = rows.some((row) => row.validationStatus === CostImportValidationStatus.APPROVED);

  await prisma.costImportSession.update({
    where: { id: sessionId },
    data: {
      status: hasApproved ? CostImportSessionStatus.VALIDATED : CostImportSessionStatus.PARSED,
    },
  });
}

export async function applyApprovedCostImportRows(sessionId: string) {
  const session = await prisma.costImportSession.findUnique({
    where: { id: sessionId },
    include: {
      rows: {
        where: { validationStatus: CostImportValidationStatus.APPROVED },
        orderBy: { rowIndex: "asc" },
      },
    },
  });

  if (!session) {
    throw new Error("Sessione import non trovata.");
  }

  const rowIds = session.rows.map((row) => row.id);
  const fingerprints = session.rows.map((row) => row.fingerprint).filter((value): value is string => Boolean(value));
  const targetJobOrderIds = [...new Set(session.rows.map((row) => row.jobOrderId))];
  const importedSourceAllocations = await getImportedSourceAllocations(
    session.rows.map((row) => row.sourceRowFingerprint)
  );
  const existingEntries =
    rowIds.length === 0
      ? []
      : await prisma.costActualEntry.findMany({
          where: {
            OR: [
              { sourceImportRowId: { in: rowIds } },
              ...(fingerprints.length > 0
                ? [{ jobOrderId: { in: targetJobOrderIds }, fingerprint: { in: fingerprints } }]
                : []),
            ],
          },
          select: {
            id: true,
            jobOrderId: true,
            amount: true,
            fingerprint: true,
            sourceImportRowId: true,
          },
        });

  type ExistingCostEntry = (typeof existingEntries)[number];
  const existingBySourceRow = new Map<string, ExistingCostEntry[]>();
  const existingByJobOrderAndFingerprint = new Map<string, ExistingCostEntry[]>();
  const fingerprintKey = (jobOrderId: string, fingerprint: string) =>
    `${jobOrderId}\u0000${fingerprint}`;

  const addExistingEntry = (entry: ExistingCostEntry) => {
    if (entry.sourceImportRowId) {
      const sourceBucket = existingBySourceRow.get(entry.sourceImportRowId) ?? [];
      sourceBucket.push(entry);
      existingBySourceRow.set(entry.sourceImportRowId, sourceBucket);
    }

    const key = fingerprintKey(entry.jobOrderId, entry.fingerprint);
    const fingerprintBucket = existingByJobOrderAndFingerprint.get(key) ?? [];
    fingerprintBucket.push(entry);
    existingByJobOrderAndFingerprint.set(key, fingerprintBucket);
  };

  const removeExistingEntry = (entry: ExistingCostEntry) => {
    if (entry.sourceImportRowId) {
      existingBySourceRow.set(
        entry.sourceImportRowId,
        (existingBySourceRow.get(entry.sourceImportRowId) ?? []).filter((item) => item.id !== entry.id)
      );
    }

    const key = fingerprintKey(entry.jobOrderId, entry.fingerprint);
    existingByJobOrderAndFingerprint.set(
      key,
      (existingByJobOrderAndFingerprint.get(key) ?? []).filter((item) => item.id !== entry.id)
    );
  };

  for (const entry of existingEntries) addExistingEntry(entry);

  const affectedJobOrderIds = new Set<string>(
    session.rows.length > 0 ? session.rows.map((row) => row.jobOrderId) : [session.jobOrderId]
  );

  let createdCount = 0;
  let updatedCount = 0;
  let removedDuplicateCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of session.rows) {
      if (!row.finalCategory || row.amount == null) {
        await tx.costImportRowStaging.update({
          where: { id: row.id },
          data: {
            matchStatus: CostImportMatchStatus.INVALID,
            validationNote: "Riga approvata ma ancora incompleta: servono almeno categoria finale e importo.",
          },
        });
        continue;
      }

      const resolvedFingerprint =
        row.fingerprint ??
        buildApprovedFallbackFingerprint({
          jobOrderId: row.jobOrderId,
          sourceRowFingerprint: row.sourceRowFingerprint,
          rowId: row.id,
          sourceAccountCode: row.sourceAccountCode,
          supplierCode: row.supplierCode,
          supplierName: row.supplierName,
          documentDate: row.documentDate,
          registrationDate: row.registrationDate,
          documentNumber: row.documentNumber,
          amount: decimalToNumber(row.amount),
        }).fingerprint;

      const resolvedFingerprintSource =
        row.fingerprintSource ??
        buildApprovedFallbackFingerprint({
          jobOrderId: row.jobOrderId,
          sourceRowFingerprint: row.sourceRowFingerprint,
          rowId: row.id,
          sourceAccountCode: row.sourceAccountCode,
          supplierCode: row.supplierCode,
          supplierName: row.supplierName,
          documentDate: row.documentDate,
          registrationDate: row.registrationDate,
          documentNumber: row.documentNumber,
          amount: decimalToNumber(row.amount),
        }).fingerprintSource;

      const allSourceEntries = [...(existingBySourceRow.get(row.id) ?? [])];
      const matchingAmountEntries = allSourceEntries.filter(
        (entry) => Math.round(Number(entry.amount) * 100) === Math.round(Number(row.amount) * 100)
      );

      if (allSourceEntries.length > 1 && matchingAmountEntries.length === 0) {
        throw new Error(
          `Impossibile riallineare in sicurezza la riga ${row.rowIndex}: esistono piu costi storici collegati con importi differenti.`
        );
      }

      // Gli split storici potevano condividere lo stesso sourceImportRowId. Quando esistono
      // piu importi, solo le registrazioni con l'importo corrente rappresentano questa riga.
      const sourceEntries =
        allSourceEntries.length > 1 ? matchingAmountEntries : allSourceEntries;
      const sourceEntryIds = new Set(sourceEntries.map((entry) => entry.id));
      const historicalSourceAllocations = row.sourceRowFingerprint
        ? importedSourceAllocations.get(row.sourceRowFingerprint) ?? []
        : [];

      if (sourceEntries.length === 0 && historicalSourceAllocations.length > 0) {
        await tx.costImportRowStaging.update({
          where: { id: row.id },
          data: {
            matchStatus: CostImportMatchStatus.ALREADY_IMPORTED,
            validationNote: getAlreadyImportedSourceNote(
              row.jobOrderId,
              historicalSourceAllocations
            ),
          },
        });
        continue;
      }

      const conflictingEntry = (
        existingByJobOrderAndFingerprint.get(fingerprintKey(row.jobOrderId, resolvedFingerprint)) ?? []
      ).find((entry) => !sourceEntryIds.has(entry.id));

      if (conflictingEntry) {
        if (sourceEntries.length > 0) {
          await tx.costActualEntry.deleteMany({
            where: { id: { in: sourceEntries.map((entry) => entry.id) } },
          });
          for (const entry of sourceEntries) {
            affectedJobOrderIds.add(entry.jobOrderId);
            removeExistingEntry(entry);
          }
          removedDuplicateCount += sourceEntries.length;
        }

        await tx.costImportRowStaging.update({
          where: { id: row.id },
          data: {
            matchStatus: CostImportMatchStatus.ALREADY_IMPORTED,
            validationNote:
              "Costo riallineato: la voce equivalente era gia presente nella commessa di destinazione.",
          },
        });
        continue;
      }

      const actualEntryData = {
        jobOrderId: row.jobOrderId,
        category: row.finalCategory,
        amount: row.amount,
        sourceAccountCode: row.sourceAccountCode,
        sourceAccountDescription: row.sourceAccountDescription,
        supplierCode: row.supplierCode,
        supplierName: row.supplierName,
        documentDate: row.documentDate,
        documentNumber: row.documentNumber,
        descriptionOriginal: row.descriptionOriginal,
        descriptionCustom: row.finalDescription || null,
        fingerprint: resolvedFingerprint,
        sourceImportSessionId: session.id,
        sourceImportRowId: row.id,
      };

      if (sourceEntries.length > 0) {
        const canonicalEntry =
          sourceEntries.find(
            (entry) =>
              entry.jobOrderId === row.jobOrderId && entry.fingerprint === resolvedFingerprint
          ) ??
          sourceEntries.find((entry) => entry.jobOrderId === row.jobOrderId) ??
          sourceEntries[0];
        const duplicateEntries = sourceEntries.filter((entry) => entry.id !== canonicalEntry.id);

        if (duplicateEntries.length > 0) {
          await tx.costActualEntry.deleteMany({
            where: { id: { in: duplicateEntries.map((entry) => entry.id) } },
          });
          for (const entry of duplicateEntries) {
            affectedJobOrderIds.add(entry.jobOrderId);
            removeExistingEntry(entry);
          }
          removedDuplicateCount += duplicateEntries.length;
        }

        affectedJobOrderIds.add(canonicalEntry.jobOrderId);
        removeExistingEntry(canonicalEntry);
        const updatedEntry = await tx.costActualEntry.update({
          where: { id: canonicalEntry.id },
          data: actualEntryData,
          select: {
            id: true,
            jobOrderId: true,
            amount: true,
            fingerprint: true,
            sourceImportRowId: true,
          },
        });
        addExistingEntry(updatedEntry);
        updatedCount += 1;
      } else {
        const createdEntry = await tx.costActualEntry.create({
          data: actualEntryData,
          select: {
            id: true,
            jobOrderId: true,
            amount: true,
            fingerprint: true,
            sourceImportRowId: true,
          },
        });
        addExistingEntry(createdEntry);
        createdCount += 1;
      }

      const previousJobOrderIds = [
        ...new Set(
          sourceEntries
            .map((entry) => entry.jobOrderId)
            .filter((jobOrderId) => jobOrderId !== row.jobOrderId)
        ),
      ];

      if (row.sourceRowFingerprint && previousJobOrderIds.length > 0) {
        await tx.costImportCorrectionRule.deleteMany({
          where: {
            jobOrderId: { in: previousJobOrderIds },
            sourceRowFingerprint: row.sourceRowFingerprint,
          },
        });
      }

      if (row.sourceRowFingerprint) {
        await tx.costImportCorrectionRule.upsert({
          where: {
            jobOrderId_sourceRowFingerprint: {
              jobOrderId: row.jobOrderId,
              sourceRowFingerprint: row.sourceRowFingerprint,
            },
          },
          create: {
            jobOrderId: row.jobOrderId,
            sourceRowFingerprint: row.sourceRowFingerprint,
            sourceRowFingerprintSource: row.sourceRowFingerprintSource,
            sourceAccountCode: row.sourceAccountCode,
            sourceAccountDescription: row.sourceAccountDescription,
            supplierCode: row.supplierCode,
            supplierName: row.supplierName,
            documentDate: row.documentDate,
            registrationDate: row.registrationDate,
            documentNumber: row.documentNumber,
            amount: row.amount,
            finalCategory: row.finalCategory,
            finalDescription: row.finalDescription,
            finalFingerprint: resolvedFingerprint,
            finalFingerprintSource: resolvedFingerprintSource,
          },
          update: {
            sourceRowFingerprintSource: row.sourceRowFingerprintSource,
            sourceAccountCode: row.sourceAccountCode,
            sourceAccountDescription: row.sourceAccountDescription,
            supplierCode: row.supplierCode,
            supplierName: row.supplierName,
            documentDate: row.documentDate,
            registrationDate: row.registrationDate,
            documentNumber: row.documentNumber,
            amount: row.amount,
            finalCategory: row.finalCategory,
            finalDescription: row.finalDescription,
            finalFingerprint: resolvedFingerprint,
            finalFingerprintSource: resolvedFingerprintSource,
          },
        });
      }

      await tx.costImportRowStaging.update({
        where: { id: row.id },
        data: {
          fingerprint: resolvedFingerprint,
          fingerprintSource: resolvedFingerprintSource,
          validationNote:
            row.fingerprint == null
              ? "Import forzato da approvazione manuale con fingerprint tecnico di fallback."
              : row.validationNote,
        },
      });

    }

    await tx.costImportSession.update({
      where: { id: session.id },
      data: {
        status: CostImportSessionStatus.APPLIED,
        appliedAt: new Date(),
      },
    });
  });

  for (const jobOrderId of affectedJobOrderIds) {
    await recalculateJobOrderActualCosts(jobOrderId);
  }

  return {
    createdCount,
    updatedCount,
    removedDuplicateCount,
    approvedCount: session.rows.length,
  };
}

export async function recalculateJobOrderActualCosts(jobOrderId: string) {
  const grouped = await prisma.costActualEntry.groupBy({
    by: ["category"],
    where: { jobOrderId },
    _sum: {
      amount: true,
    },
  });

  const totals = {
    materials: 0,
    professionalServices: 0,
    thirdPartyServices: 0,
    misc: 0,
  };

  for (const row of grouped) {
    const amount = Number(row._sum.amount ?? 0);
    if (row.category === CostActualCategory.MATERIE_PRIME) totals.materials = amount;
    if (row.category === CostActualCategory.PRESTAZIONI_PROFESSIONALI) totals.professionalServices = amount;
    if (row.category === CostActualCategory.PRESTAZIONI_TERZI) totals.thirdPartyServices = amount;
    if (row.category === CostActualCategory.SPESE_VARIE) totals.misc = amount;
  }

  await prisma.jobOrder.update({
    where: { id: jobOrderId },
    data: {
      actualMaterialsCost: new Prisma.Decimal(totals.materials.toFixed(2)),
      actualProfessionalServicesCost: new Prisma.Decimal(totals.professionalServices.toFixed(2)),
      actualThirdPartyServicesCost: new Prisma.Decimal(totals.thirdPartyServices.toFixed(2)),
      actualMiscCost: new Prisma.Decimal(totals.misc.toFixed(2)),
    },
  });
}

export async function listRecentCostImportSessions(limit = 8) {
  const sessions = await prisma.$queryRaw<
    Array<{
      id: string;
      fileName: string;
      status: CostImportSessionStatus;
      uploadedAt: Date;
      rowCount: bigint;
      jobOrderId: string;
      jobOrderName: string;
    }>
  >`
    SELECT
      cis."id",
      cis."fileName",
      cis."status",
      cis."uploadedAt",
      COUNT(cir."id") AS "rowCount",
      jo."id" AS "jobOrderId",
      jo."name" AS "jobOrderName"
    FROM "CostImportSession" cis
    INNER JOIN "JobOrder" jo ON jo."id" = cis."jobOrderId"
    LEFT JOIN "CostImportRowStaging" cir ON cir."importSessionId" = cis."id"
    WHERE cis."jobOrderId" IS NOT NULL
    GROUP BY cis."id", jo."id", jo."name"
    ORDER BY cis."uploadedAt" DESC
    LIMIT ${limit}
  `;

  return sessions.map((session) => ({
    id: session.id,
    fileName: session.fileName,
    status: session.status,
    uploadedAt: session.uploadedAt.toISOString(),
    rowCount: Number(session.rowCount),
    jobOrder: {
      id: session.jobOrderId,
      name: session.jobOrderName,
    },
  }));
}

export type CostImportSessionPayload = NonNullable<ImportSessionDetails>;
