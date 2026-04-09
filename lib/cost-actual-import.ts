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

type ImportSessionDetails = Awaited<ReturnType<typeof getCostImportSessionDetails>>;

const HEADER_PREFIXES = ["PARTITARI", "Agenzia:", "Data esportazione:"];
const ACCOUNT_CODE_REGEX = /^303\.\d{2}\.\d{5}\s*-\s*(.+)$/i;
const SUPPLIER_CODE_REGEX = /^(212\.\d{5})\s*-\s*(.+)$/i;
const GENERIC_ACCOUNT_REGEX = /^(\d{3}\.\d{2}\.\d{5})\s*-\s*(.+)$/i;
const ITALIAN_DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

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

function isMovementRow(row: string[]) {
  return Boolean(parseItalianDate(cleanCell(row[1]))) && Boolean(cleanCell(row[10]));
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
  const amount = parseAmount(row[11]);
  const descriptionOriginal = cleanCell(row[6]) || cleanCell(row[5]) || null;
  const descriptionNormalized = normalizeText(descriptionOriginal);
  const sourceAccountCode = accountContext?.code ?? null;
  const sourceAccountDescription = accountContext?.description ?? null;
  const suggestedCategory = getCategoryFromSource(sourceAccountCode, sourceAccountDescription);

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
    validationNoteParts.push("Importo dare non leggibile.");
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
  const existingEntries = await prisma.costActualEntry.findMany({
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
  });

  const fingerprintSet = new Set(existingEntries.map((entry) => entry.fingerprint));

  for (const row of rows) {
    if (row.matchStatus === CostImportMatchStatus.INVALID) {
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
    possibleDuplicateRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.POSSIBLE_DUPLICATE).length,
    newRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.NEW).length,
    invalidRows: rows.filter((row) => row.matchStatus === CostImportMatchStatus.INVALID).length,
  };
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

  const parsed = parsePartitarioXls(input.buffer, input.jobOrderId);
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

function decimalToNumber(value: Prisma.Decimal | null) {
  if (value == null) return null;
  return Number(value);
}

export async function getCostImportSessionDetails(sessionId: string) {
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
    invalid: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.INVALID).length,
    possibleDuplicate: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.POSSIBLE_DUPLICATE).length,
    newRows: session.rows.filter((row) => row.matchStatus === CostImportMatchStatus.NEW).length,
  };

  return {
    id: session.id,
    fileName: session.fileName,
    sourceType: session.sourceType,
    status: session.status,
    uploadedAt: session.uploadedAt.toISOString(),
    parseSummary: session.parseSummary,
    appliedAt: session.appliedAt?.toISOString() ?? null,
    jobOrder: session.jobOrder,
    stats,
    rows: session.rows.map((row) => ({
      id: row.id,
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
    finalDescription?: string;
    finalCategory?: CostActualCategory | null;
    validationNote?: string;
  }
) {
  const existing = await prisma.costImportRowStaging.findUnique({
    where: { id: rowId },
    select: { id: true, importSessionId: true },
  });

  if (!existing || existing.importSessionId !== sessionId) {
    throw new Error("Riga staging non coerente con la sessione.");
  }

  const updated = await prisma.costImportRowStaging.update({
    where: { id: rowId },
    data: {
      ...(input.finalDescription !== undefined ? { finalDescription: input.finalDescription } : {}),
      ...(input.finalCategory !== undefined ? { finalCategory: input.finalCategory } : {}),
      ...(input.validationNote !== undefined ? { validationNote: input.validationNote } : {}),
    },
    select: { id: true, importSessionId: true },
  });

  await refreshImportSessionStatus(sessionId);

  return updated;
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

  const fingerprints = session.rows.map((row) => row.fingerprint).filter((value): value is string => Boolean(value));
  const existingByFingerprint = new Set(
    (
      await prisma.costActualEntry.findMany({
        where: {
          jobOrderId: session.jobOrderId,
          fingerprint: { in: fingerprints },
        },
        select: { fingerprint: true },
      })
    ).map((entry) => entry.fingerprint)
  );

  let createdCount = 0;

  await prisma.$transaction(async (tx) => {
    for (const row of session.rows) {
      if (!row.fingerprint || !row.finalCategory || row.amount == null) {
        await tx.costImportRowStaging.update({
          where: { id: row.id },
          data: {
            matchStatus: CostImportMatchStatus.INVALID,
            validationNote: "Riga approvata ma ancora incompleta: servono fingerprint, categoria finale e importo.",
          },
        });
        continue;
      }

      if (existingByFingerprint.has(row.fingerprint)) {
        await tx.costImportRowStaging.update({
          where: { id: row.id },
          data: {
            matchStatus: CostImportMatchStatus.ALREADY_IMPORTED,
            validationNote: "Fingerprint gia presente nei costi actual definitivi.",
          },
        });
        continue;
      }

      await tx.costActualEntry.create({
        data: {
          jobOrderId: session.jobOrderId,
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
          fingerprint: row.fingerprint,
          sourceImportSessionId: session.id,
          sourceImportRowId: row.id,
        },
      });

      existingByFingerprint.add(row.fingerprint);
      createdCount += 1;
    }

    await tx.costImportSession.update({
      where: { id: session.id },
      data: {
        status: CostImportSessionStatus.APPLIED,
        appliedAt: new Date(),
      },
    });
  });

  await recalculateJobOrderActualCosts(session.jobOrderId);

  return {
    createdCount,
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
  const sessions = await prisma.costImportSession.findMany({
    orderBy: { uploadedAt: "desc" },
    take: limit,
    include: {
      jobOrder: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          rows: true,
        },
      },
    },
  });

  return sessions.map((session) => ({
    id: session.id,
    fileName: session.fileName,
    status: session.status,
    uploadedAt: session.uploadedAt.toISOString(),
    rowCount: session._count.rows,
    jobOrder: session.jobOrder,
  }));
}

export type CostImportSessionPayload = NonNullable<ImportSessionDetails>;
