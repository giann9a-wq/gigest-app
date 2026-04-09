import { createHash } from "crypto";
import * as XLSX from "xlsx";
import {
  InvoiceImportAssignmentSource,
  InvoiceImportMatchStatus,
  InvoiceImportSessionStatus,
  InvoiceImportSourceType,
  InvoiceImportValidationStatus,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

type PrismaKnownError = {
  code?: string;
  message?: string;
};

type ParsedAccountContext = {
  code: string;
  description: string;
};

type ParsedCounterparty = {
  code: string | null;
  description: string | null;
  amount: number | null;
  rowIndex: number;
  rawRow: string[];
};

type ParsedInvoiceBlock = {
  rowIndexStart: number;
  rowIndexEnd: number;
  sourceAccountCode: string | null;
  sourceAccountDescription: string | null;
  registrationDate: Date | null;
  registrationProtocol: string | null;
  causale: string | null;
  documentDate: Date | null;
  invoiceNumber: string | null;
  customerCode: string | null;
  customerName: string | null;
  netAmount: number | null;
  vatAmount: number | null;
  grossAmount: number | null;
  extraLinesJson: Prisma.InputJsonValue;
  rawDataJson: Prisma.InputJsonValue;
  fingerprint: string | null;
  fingerprintSource: string | null;
  matchStatus: InvoiceImportMatchStatus;
  validationStatus: InvoiceImportValidationStatus;
  jobOrderId?: string | null;
  validationNote: string | null;
  suggestedJobOrderId?: string | null;
  suggestedJobOrderReason?: string | null;
  assignmentSource?: InvoiceImportAssignmentSource | null;
};

type ParsedInvoiceDraft = {
  movementRowIndex: number;
  movementRow: string[];
  accountContext: ParsedAccountContext | null;
  registrationDate: Date | null;
  registrationProtocol: string | null;
  causale: string | null;
  documentDate: Date | null;
  invoiceNumber: string | null;
  netAmount: number | null;
  customer: ParsedCounterparty | null;
  vat: ParsedCounterparty | null;
  extraLines: ParsedCounterparty[];
  rawRows: Array<{ rowIndex: number; values: string[] }>;
};

type ParsedWorkbookResult = {
  rows: ParsedInvoiceBlock[];
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

type InvoiceImportSessionDetails = Awaited<ReturnType<typeof getInvoiceImportSessionDetails>>;

const HEADER_PREFIXES = ["PARTITARI", "AGENZIA:", "DATA ESPORTAZIONE:"];
const REVENUE_ACCOUNT_REGEX = /^(401\.\d{2}\.\d{5})\s*-\s*(.+)$/i;
const GENERIC_ACCOUNT_REGEX = /^(\d{3}(?:\.\d{2})?\.\d{5})\s*-\s*(.+)$/i;
const CUSTOMER_ACCOUNT_PREFIX = "132.";
const VAT_ACCOUNT_PREFIX = "217.";
const ITALIAN_DATE_REGEX = /^\d{2}\/\d{2}\/\d{4}$/;

export function isInvoiceImportSchemaMissingError(error: unknown) {
  const candidate = error as PrismaKnownError | undefined;
  const message = candidate?.message ?? "";

  return (
    candidate?.code === "P2021" ||
    candidate?.code === "P2022" ||
    message.includes('relation "InvoiceImportSession" does not exist') ||
    message.includes('relation "InvoiceImportRowStaging" does not exist') ||
    message.includes('relation "IssuedInvoiceActual" does not exist') ||
    message.includes('The table `public.InvoiceImportSession` does not exist') ||
    message.includes('The table `public.InvoiceImportRowStaging` does not exist') ||
    message.includes('The table `public.IssuedInvoiceActual` does not exist')
  );
}

export function getInvoiceImportSchemaMissingMessage() {
  return "Il database dell'ambiente non ha ancora la migration delle fatture emesse. Esegui `prisma migrate deploy` prima di usare questa sezione.";
}

function cleanCell(value: unknown) {
  if (value == null) return "";
  return String(value).replace(/\r/g, " ").replace(/\n/g, " ").replace(/\s+/g, " ").trim();
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

function parseItalianDate(value: string | null | undefined) {
  if (!value) return null;
  const cleaned = cleanCell(value);
  if (!ITALIAN_DATE_REGEX.test(cleaned)) return null;
  const [day, month, year] = cleaned.split("/").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseAmount(value: unknown) {
  if (value == null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Number(Math.abs(value).toFixed(2));
  }

  const cleaned = cleanCell(value);
  if (!cleaned) return null;
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return Number(Math.abs(parsed).toFixed(2));
}

function parsePostingAmount(row: string[], primaryIndex: number, secondaryIndex: number) {
  const primary = parseAmount(row[primaryIndex]);
  if (primary != null && primary > 0) return primary;
  const secondary = parseAmount(row[secondaryIndex]);
  if (secondary != null && secondary > 0) return secondary;
  return primary ?? secondary ?? null;
}

function toDecimal(value: number | null) {
  if (value == null) return null;
  return new Prisma.Decimal(value.toFixed(2));
}

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  if (value == null) return null;
  return Number(value);
}

function extractRevenueAccount(row: string[]) {
  const cell = cleanCell(row[0]);
  const match = cell.match(REVENUE_ACCOUNT_REGEX);
  if (!match) return null;

  return {
    code: match[1] ?? "",
    description: match[2] ?? "",
  } satisfies ParsedAccountContext;
}

function extractCounterparty(row: string[], rowIndex: number) {
  const cell = cleanCell(row[8]);
  const match = cell.match(GENERIC_ACCOUNT_REGEX);
  if (!match) return null;

  return {
    code: match[1] ?? null,
    description: match[2] ?? null,
    amount: parsePostingAmount(row, 11, 12),
    rowIndex,
    rawRow: row,
  } satisfies ParsedCounterparty;
}

function isIgnorableRow(row: string[]) {
  const joined = row.map(cleanCell).filter(Boolean).join(" ");
  if (!joined) return true;

  const upper = normalizeText(joined);
  if (HEADER_PREFIXES.some((prefix) => upper.startsWith(prefix))) return true;

  return (
    upper.includes("SALDO PRECEDENTE") ||
    upper.includes("TOTALI") ||
    upper.includes("CONTROPARTITE") ||
    upper.includes("DATA REGISTRAZIONE PROGRESSIVO REGISTRAZIONE")
  );
}

function isInvoiceMovementRow(row: string[]) {
  return (
    Boolean(parseItalianDate(cleanCell(row[1]))) &&
    normalizeText(row[6]) === "EMESSA FATTURA"
  );
}

function buildFingerprintInput(input: {
  sourceAccountCode: string | null;
  invoiceNumber: string | null;
  documentDate: Date | null;
  customerCode: string | null;
  customerName: string | null;
  netAmount: number | null;
  grossAmount: number | null;
  registrationProtocol: string | null;
}) {
  const customerStable = input.customerCode || normalizeText(input.customerName) || "";
  const documentDateStable = input.documentDate?.toISOString().slice(0, 10) ?? "";
  const invoiceStable = normalizeText(input.invoiceNumber);
  const netStable = input.netAmount == null ? "" : input.netAmount.toFixed(2);
  const grossStable = input.grossAmount == null ? "" : input.grossAmount.toFixed(2);
  const protocolStable = normalizeText(input.registrationProtocol);

  const source = [
    input.sourceAccountCode ?? "",
    invoiceStable,
    documentDateStable,
    customerStable,
    netStable,
    grossStable,
    protocolStable,
  ].join("|");

  const hasMinimumIdentity =
    Boolean(input.sourceAccountCode) &&
    Boolean(invoiceStable) &&
    Boolean(documentDateStable) &&
    Boolean(customerStable) &&
    Boolean(netStable) &&
    Boolean(grossStable);

  if (!hasMinimumIdentity) {
    return { fingerprint: null, fingerprintSource: source };
  }

  return {
    fingerprint: createHash("sha256").update(source).digest("hex"),
    fingerprintSource: source,
  };
}

function buildInvoiceBlock(draft: ParsedInvoiceDraft): ParsedInvoiceBlock {
  const notes = new Set<string>();

  if (!draft.accountContext?.code) {
    notes.add("Conto ricavo 401.* non rilevato.");
  }
  if (!draft.documentDate && !draft.registrationDate) {
    notes.add("Data documento/registrazione assente.");
  }
  if (!draft.invoiceNumber) {
    notes.add("Numero fattura non leggibile.");
  }
  if (draft.netAmount == null) {
    notes.add("Imponibile non ricostruito dal movimento 401.");
  }
  if (!draft.customer?.code && !draft.customer?.description) {
    notes.add("Cliente non rilevato dalle contropartite.");
  }
  if (draft.customer?.amount == null) {
    notes.add("Totale fattura non ricostruito dalla contropartita cliente.");
  }

  const vatAmount = draft.vat?.amount ?? null;
  const grossAmount = draft.customer?.amount ?? null;

  const fingerprintData = buildFingerprintInput({
    sourceAccountCode: draft.accountContext?.code ?? null,
    invoiceNumber: draft.invoiceNumber,
    documentDate: draft.documentDate ?? draft.registrationDate,
    customerCode: draft.customer?.code ?? null,
    customerName: draft.customer?.description ?? null,
    netAmount: draft.netAmount,
    grossAmount,
    registrationProtocol: draft.registrationProtocol,
  });

  if (!fingerprintData.fingerprint) {
    notes.add("Fingerprint incompleto: servono conto, cliente, data, numero e importi affidabili.");
  }

  return {
    rowIndexStart: draft.movementRowIndex,
    rowIndexEnd:
      draft.rawRows[draft.rawRows.length - 1]?.rowIndex ?? draft.movementRowIndex,
    sourceAccountCode: draft.accountContext?.code ?? null,
    sourceAccountDescription: draft.accountContext?.description ?? null,
    registrationDate: draft.registrationDate,
    registrationProtocol: draft.registrationProtocol,
    causale: draft.causale,
    documentDate: draft.documentDate,
    invoiceNumber: draft.invoiceNumber,
    customerCode: draft.customer?.code ?? null,
    customerName: draft.customer?.description ?? null,
    netAmount: draft.netAmount,
    vatAmount,
    grossAmount,
    extraLinesJson: draft.extraLines.map((line) => ({
      code: line.code,
      description: line.description,
      amount: line.amount,
      rowIndex: line.rowIndex,
    })),
    rawDataJson: {
      movementRow: draft.movementRow,
      relatedRows: draft.rawRows,
    },
    fingerprint: fingerprintData.fingerprint,
    fingerprintSource: fingerprintData.fingerprintSource,
    matchStatus: notes.size > 0 ? InvoiceImportMatchStatus.INVALID : InvoiceImportMatchStatus.NEW,
    validationStatus: InvoiceImportValidationStatus.PENDING,
    validationNote: notes.size > 0 ? `${[...notes].join(" ")} ` : null,
  };
}

export function parseIssuedInvoicePartitario(buffer: Buffer): ParsedWorkbookResult {
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

  const parsedRows: ParsedInvoiceBlock[] = [];
  const warnings: string[] = [];
  let ignoredRows = 0;
  let currentAccount: ParsedAccountContext | null = null;
  let pendingInvoice: ParsedInvoiceDraft | null = null;

  const flushPendingInvoice = () => {
    if (!pendingInvoice) return;
    parsedRows.push(buildInvoiceBlock(pendingInvoice));
    pendingInvoice = null;
  };

  rows.forEach((rawRow, index) => {
    const rowIndex = index + 1;
    const row = rawRow.map((cell) => cleanCell(cell));

    if (isIgnorableRow(row)) {
      ignoredRows += 1;
      return;
    }

    const accountContext = extractRevenueAccount(row);
    if (accountContext) {
      flushPendingInvoice();
      currentAccount = accountContext;
      return;
    }

    if (isInvoiceMovementRow(row)) {
      flushPendingInvoice();
      pendingInvoice = {
        movementRowIndex: rowIndex,
        movementRow: row,
        accountContext: currentAccount,
        registrationDate: parseItalianDate(row[1]),
        registrationProtocol: cleanCell(row[4]) || null,
        causale: cleanCell(row[5]) || null,
        documentDate: parseItalianDate(row[9]),
        invoiceNumber: cleanCell(row[10]) || null,
        netAmount: parsePostingAmount(row, 12, 11),
        customer: null,
        vat: null,
        extraLines: [],
        rawRows: [{ rowIndex, values: row }],
      };
      return;
    }

    if (!pendingInvoice) {
      ignoredRows += 1;
      return;
    }

    const counterparty = extractCounterparty(row, rowIndex);
    if (!counterparty) {
      pendingInvoice.rawRows.push({ rowIndex, values: row });
      ignoredRows += 1;
      return;
    }

    pendingInvoice.rawRows.push({ rowIndex, values: row });

    if (counterparty.code?.startsWith(CUSTOMER_ACCOUNT_PREFIX)) {
      pendingInvoice.customer = counterparty;
      return;
    }

    if (counterparty.code?.startsWith(VAT_ACCOUNT_PREFIX)) {
      pendingInvoice.vat = counterparty;
      return;
    }

    pendingInvoice.extraLines.push(counterparty);
    warnings.push(
      `Riga ${rowIndex}: contropartita accessoria ${counterparty.code ?? "-"} collegata alla fattura ${pendingInvoice.invoiceNumber ?? "-"}.`
    );
  });

  flushPendingInvoice();

  return {
    rows: parsedRows,
    summary: {
      totalRows: rows.length,
      parsedRows: parsedRows.length,
      invalidRows: parsedRows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.INVALID).length,
      duplicateRows: 0,
      possibleDuplicateRows: 0,
      newRows: parsedRows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.NEW).length,
      ignoredRows,
      warnings,
    },
  };
}

async function classifyParsedInvoiceRows(rows: ParsedInvoiceBlock[]) {
  const existingInvoices = await prisma.issuedInvoiceActual.findMany({
    select: {
      id: true,
      fingerprint: true,
      invoiceNumber: true,
      documentDate: true,
      customerCode: true,
      customerName: true,
      netAmount: true,
      grossAmount: true,
    },
  });

  const fingerprintSet = new Set(existingInvoices.map((invoice) => invoice.fingerprint));

  for (const row of rows) {
    if (row.matchStatus === InvoiceImportMatchStatus.INVALID) {
      continue;
    }

    if (row.fingerprint && fingerprintSet.has(row.fingerprint)) {
      row.matchStatus = InvoiceImportMatchStatus.ALREADY_IMPORTED;
      row.validationNote = "Fingerprint gia importato in passato.";
      continue;
    }

    const possibleDuplicate = existingInvoices.find((invoice) => {
      const sameInvoiceNumber =
        normalizeText(invoice.invoiceNumber) === normalizeText(row.invoiceNumber);
      const sameDate =
        invoice.documentDate?.toISOString().slice(0, 10) ===
        (row.documentDate ?? row.registrationDate)?.toISOString().slice(0, 10);
      const sameCustomer =
        (invoice.customerCode && invoice.customerCode === row.customerCode) ||
        normalizeText(invoice.customerName) === normalizeText(row.customerName);
      const sameNet = Number(invoice.netAmount) === (row.netAmount ?? Number.NaN);
      const sameGross = Number(invoice.grossAmount ?? 0) === (row.grossAmount ?? Number.NaN);

      return sameInvoiceNumber && sameDate && sameCustomer && (sameNet || sameGross);
    });

    if (possibleDuplicate) {
      row.matchStatus = InvoiceImportMatchStatus.POSSIBLE_DUPLICATE;
      row.validationNote =
        "Possibile duplicato: numero, data, cliente e importi coincidono con una fattura gia acquisita.";
    }
  }

  return {
    duplicateRows: rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.ALREADY_IMPORTED).length,
    possibleDuplicateRows: rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.POSSIBLE_DUPLICATE).length,
    newRows: rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.NEW).length,
    invalidRows: rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.INVALID).length,
  };
}

async function suggestJobOrdersForRows(rows: ParsedInvoiceBlock[]) {
  const customerKeys = [...new Set(
    rows.flatMap((row) => {
      const values: string[] = [];
      if (row.customerCode) values.push(`CODE:${row.customerCode}`);
      const normalizedName = normalizeText(row.customerName);
      if (normalizedName) values.push(`NAME:${normalizedName}`);
      return values;
    })
  )];

  if (customerKeys.length === 0) {
    return;
  }

  const historicalInvoices = await prisma.issuedInvoiceActual.findMany({
    where: {
      OR: [
        {
          customerCode: {
            in: rows.map((row) => row.customerCode).filter((value): value is string => Boolean(value)),
          },
        },
        {
          customerName: {
            in: rows.map((row) => row.customerName).filter((value): value is string => Boolean(value)),
          },
        },
      ],
    },
    select: {
      customerCode: true,
      customerName: true,
      jobOrderId: true,
      jobOrder: {
        select: {
          id: true,
          name: true,
        },
      },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const associations = new Map<
    string,
    Map<string, { count: number; jobOrderName: string; lastSeenAt: string }>
  >();

  for (const invoice of historicalInvoices) {
    const keys = [
      invoice.customerCode ? `CODE:${invoice.customerCode}` : null,
      invoice.customerName ? `NAME:${normalizeText(invoice.customerName)}` : null,
    ].filter((value): value is string => Boolean(value));

    for (const key of keys) {
      const bucket = associations.get(key) ?? new Map<string, { count: number; jobOrderName: string; lastSeenAt: string }>();
      const current = bucket.get(invoice.jobOrderId);
      if (current) {
        current.count += 1;
        if (invoice.createdAt.toISOString() > current.lastSeenAt) {
          current.lastSeenAt = invoice.createdAt.toISOString();
        }
      } else {
        bucket.set(invoice.jobOrderId, {
          count: 1,
          jobOrderName: invoice.jobOrder.name,
          lastSeenAt: invoice.createdAt.toISOString(),
        });
      }
      associations.set(key, bucket);
    }
  }

  for (const row of rows) {
    if (row.jobOrderId) continue;

    const keys = [
      row.customerCode ? `CODE:${row.customerCode}` : null,
      row.customerName ? `NAME:${normalizeText(row.customerName)}` : null,
    ].filter((value): value is string => Boolean(value));

    const candidateMaps = keys
      .map((key) => associations.get(key))
      .filter((value): value is Map<string, { count: number; jobOrderName: string; lastSeenAt: string }> => Boolean(value));

    if (candidateMaps.length === 0) {
      continue;
    }

    const merged = new Map<string, { count: number; jobOrderName: string; lastSeenAt: string }>();
    for (const candidateMap of candidateMaps) {
      for (const [jobOrderId, stats] of candidateMap.entries()) {
        const current = merged.get(jobOrderId);
        if (current) {
          current.count += stats.count;
          if (stats.lastSeenAt > current.lastSeenAt) {
            current.lastSeenAt = stats.lastSeenAt;
          }
        } else {
          merged.set(jobOrderId, { ...stats });
        }
      }
    }

    if (merged.size !== 1) {
      continue;
    }

    const [jobOrderId, suggestion] = [...merged.entries()][0];
    row.suggestedJobOrderId = jobOrderId;
    row.suggestedJobOrderReason = `Suggerita da storico cliente: ${suggestion.jobOrderName} (${suggestion.count} fattur${suggestion.count === 1 ? "a" : "e"} gia collegate).`;
    row.jobOrderId = jobOrderId;
    row.assignmentSource = InvoiceImportAssignmentSource.SUGGESTED;
  }
}

export async function createInvoiceImportSession(input: {
  fileName: string;
  buffer: Buffer;
  uploadedById?: string | null;
}) {
  const fileHash = createHash("sha256").update(input.buffer).digest("hex");
  const fileSizeBytes = input.buffer.byteLength;

  const parsed = parseIssuedInvoicePartitario(input.buffer);
  const classification = await classifyParsedInvoiceRows(parsed.rows);
  await suggestJobOrdersForRows(parsed.rows);

  const summary = {
    ...parsed.summary,
    ...classification,
  };

  const session = await prisma.$transaction(async (tx) => {
    const createdSession = await tx.invoiceImportSession.create({
      data: {
        fileName: input.fileName,
        fileHash,
        fileSizeBytes,
        storagePath: null,
        sourceType: InvoiceImportSourceType.PARTITARIO_XLS,
        uploadedById: input.uploadedById ?? null,
        status: InvoiceImportSessionStatus.PARSED,
        parseSummary: summary,
      },
      select: { id: true },
    });

    if (parsed.rows.length > 0) {
      await tx.invoiceImportRowStaging.createMany({
        data: parsed.rows.map((row) => ({
          importSessionId: createdSession.id,
          rowIndexStart: row.rowIndexStart,
          rowIndexEnd: row.rowIndexEnd,
          sourceAccountCode: row.sourceAccountCode,
          sourceAccountDescription: row.sourceAccountDescription,
          registrationDate: row.registrationDate,
          registrationProtocol: row.registrationProtocol,
          causale: row.causale,
          documentDate: row.documentDate,
          invoiceNumber: row.invoiceNumber,
          customerCode: row.customerCode,
          customerName: row.customerName,
          netAmount: toDecimal(row.netAmount),
          vatAmount: toDecimal(row.vatAmount),
          grossAmount: toDecimal(row.grossAmount),
          extraLinesJson: row.extraLinesJson,
          rawDataJson: row.rawDataJson,
          fingerprint: row.fingerprint,
          fingerprintSource: row.fingerprintSource,
          matchStatus: row.matchStatus,
          validationStatus: row.validationStatus,
          jobOrderId: row.jobOrderId ?? null,
          suggestedJobOrderId: row.suggestedJobOrderId ?? null,
          suggestedJobOrderReason: row.suggestedJobOrderReason ?? null,
          assignmentSource: row.assignmentSource ?? null,
          validationNote: row.validationNote,
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

export async function listRecentInvoiceImportSessions(limit = 8) {
  const sessions = await prisma.invoiceImportSession.findMany({
    orderBy: { uploadedAt: "desc" },
    take: limit,
    include: {
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
  }));
}

export async function getInvoiceImportSessionDetails(sessionId: string) {
  const session = await prisma.invoiceImportSession.findUnique({
    where: { id: sessionId },
    include: {
      rows: {
        orderBy: [{ rowIndexStart: "asc" }, { createdAt: "asc" }],
        include: {
          jobOrder: {
            select: {
              id: true,
              name: true,
              type: true,
              status: true,
            },
          },
          suggestedJobOrder: {
            select: {
              id: true,
              name: true,
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
    pending: session.rows.filter((row) => row.validationStatus === InvoiceImportValidationStatus.PENDING).length,
    approved: session.rows.filter((row) => row.validationStatus === InvoiceImportValidationStatus.APPROVED).length,
    rejected: session.rows.filter((row) => row.validationStatus === InvoiceImportValidationStatus.REJECTED).length,
    alreadyImported: session.rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.ALREADY_IMPORTED).length,
    invalid: session.rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.INVALID).length,
    possibleDuplicate: session.rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.POSSIBLE_DUPLICATE).length,
    newRows: session.rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.NEW).length,
    unassigned: session.rows.filter((row) => !row.jobOrderId).length,
  };

  return {
    id: session.id,
    fileName: session.fileName,
    sourceType: session.sourceType,
    status: session.status,
    uploadedAt: session.uploadedAt.toISOString(),
    appliedAt: session.appliedAt?.toISOString() ?? null,
    parseSummary: session.parseSummary,
    stats,
    rows: session.rows.map((row) => ({
      id: row.id,
      rowIndexStart: row.rowIndexStart,
      rowIndexEnd: row.rowIndexEnd,
      sourceAccountCode: row.sourceAccountCode,
      sourceAccountDescription: row.sourceAccountDescription,
      registrationDate: row.registrationDate?.toISOString().slice(0, 10) ?? "",
      registrationProtocol: row.registrationProtocol ?? "",
      causale: row.causale ?? "",
      documentDate: row.documentDate?.toISOString().slice(0, 10) ?? "",
      invoiceNumber: row.invoiceNumber ?? "",
      customerCode: row.customerCode,
      customerName: row.customerName,
      netAmount: decimalToNumber(row.netAmount),
      vatAmount: decimalToNumber(row.vatAmount),
      grossAmount: decimalToNumber(row.grossAmount),
      fingerprint: row.fingerprint,
      matchStatus: row.matchStatus,
      validationStatus: row.validationStatus,
      validationNote: row.validationNote ?? "",
      jobOrderId: row.jobOrderId ?? "",
      jobOrderName: row.jobOrder?.name ?? "",
      suggestedJobOrderId: row.suggestedJobOrderId ?? "",
      suggestedJobOrderName: row.suggestedJobOrder?.name ?? "",
      suggestedJobOrderReason: row.suggestedJobOrderReason ?? "",
      assignmentSource: row.assignmentSource,
    })),
  };
}

async function refreshInvoiceImportSessionStatus(sessionId: string) {
  const [session, rows] = await Promise.all([
    prisma.invoiceImportSession.findUnique({
      where: { id: sessionId },
      select: { status: true },
    }),
    prisma.invoiceImportRowStaging.findMany({
      where: { importSessionId: sessionId },
      select: { validationStatus: true },
    }),
  ]);

  if (!session || session.status === InvoiceImportSessionStatus.APPLIED || session.status === InvoiceImportSessionStatus.FAILED) {
    return;
  }

  const hasApproved = rows.some((row) => row.validationStatus === InvoiceImportValidationStatus.APPROVED);

  await prisma.invoiceImportSession.update({
    where: { id: sessionId },
    data: {
      status: hasApproved ? InvoiceImportSessionStatus.VALIDATED : InvoiceImportSessionStatus.PARSED,
    },
  });
}

export async function updateInvoiceImportRows(
  sessionId: string,
  input: {
    rowIds: string[];
    action: "assign-job-order" | "approve" | "reject";
    jobOrderId?: string | null;
  }
) {
  if (input.rowIds.length === 0) {
    return { updated: 0 };
  }

  if (input.action === "assign-job-order") {
    const result = await prisma.invoiceImportRowStaging.updateMany({
      where: {
        importSessionId: sessionId,
        id: { in: input.rowIds },
      },
      data: {
        jobOrderId: input.jobOrderId ?? null,
        assignmentSource: input.jobOrderId ? InvoiceImportAssignmentSource.MANUAL : null,
      },
    });

    await refreshInvoiceImportSessionStatus(sessionId);
    return { updated: result.count };
  }

  if (input.action === "approve") {
    const rows = await prisma.invoiceImportRowStaging.findMany({
      where: {
        importSessionId: sessionId,
        id: { in: input.rowIds },
      },
      select: {
        id: true,
        jobOrderId: true,
        matchStatus: true,
      },
    });

    const missingJobOrder = rows.filter((row) => !row.jobOrderId);
    if (missingJobOrder.length > 0) {
      throw new Error("Ogni fattura approvata deve avere una commessa assegnata.");
    }

    const invalidRows = rows.filter((row) => row.matchStatus === InvoiceImportMatchStatus.INVALID);
    if (invalidRows.length > 0) {
      throw new Error("Le righe INVALID non possono essere approvate.");
    }

    const result = await prisma.invoiceImportRowStaging.updateMany({
      where: {
        importSessionId: sessionId,
        id: { in: input.rowIds },
      },
      data: {
        validationStatus: InvoiceImportValidationStatus.APPROVED,
      },
    });

    await refreshInvoiceImportSessionStatus(sessionId);
    return { updated: result.count };
  }

  const result = await prisma.invoiceImportRowStaging.updateMany({
    where: {
      importSessionId: sessionId,
      id: { in: input.rowIds },
    },
    data: {
      validationStatus: InvoiceImportValidationStatus.REJECTED,
    },
  });

  await refreshInvoiceImportSessionStatus(sessionId);
  return { updated: result.count };
}

export async function updateInvoiceImportRow(
  sessionId: string,
  rowId: string,
  input: {
    jobOrderId?: string | null;
    validationNote?: string;
  }
) {
  const existing = await prisma.invoiceImportRowStaging.findUnique({
    where: { id: rowId },
    select: { id: true, importSessionId: true },
  });

  if (!existing || existing.importSessionId !== sessionId) {
    throw new Error("Riga staging non coerente con la sessione.");
  }

  if (input.jobOrderId) {
    const jobOrder = await prisma.jobOrder.findUnique({
      where: { id: input.jobOrderId },
      select: { id: true },
    });

    if (!jobOrder) {
      throw new Error("Commessa non trovata.");
    }
  }

  await prisma.invoiceImportRowStaging.update({
    where: { id: rowId },
    data: {
      ...(input.jobOrderId !== undefined ? { jobOrderId: input.jobOrderId || null } : {}),
      ...(input.jobOrderId !== undefined
        ? {
            assignmentSource: input.jobOrderId
              ? InvoiceImportAssignmentSource.MANUAL
              : null,
          }
        : {}),
      ...(input.validationNote !== undefined ? { validationNote: input.validationNote } : {}),
    },
  });

  await refreshInvoiceImportSessionStatus(sessionId);
}

export async function applyApprovedInvoiceImportRows(sessionId: string) {
  const session = await prisma.invoiceImportSession.findUnique({
    where: { id: sessionId },
    include: {
      rows: {
        where: { validationStatus: InvoiceImportValidationStatus.APPROVED },
        orderBy: { rowIndexStart: "asc" },
      },
    },
  });

  if (!session) {
    throw new Error("Sessione import fatture non trovata.");
  }

  const fingerprints = session.rows
    .map((row) => row.fingerprint)
    .filter((value): value is string => Boolean(value));

  const existingByFingerprint = new Set(
    (
      await prisma.issuedInvoiceActual.findMany({
        where: {
          fingerprint: { in: fingerprints },
        },
        select: { fingerprint: true },
      })
    ).map((row) => row.fingerprint)
  );

  let createdCount = 0;
  const affectedJobOrderIds = new Set<string>();

  await prisma.$transaction(async (tx) => {
    for (const row of session.rows) {
      if (!row.jobOrderId) {
        throw new Error("Ogni fattura approvata deve avere una commessa assegnata prima della conferma.");
      }

      if (!row.fingerprint || row.netAmount == null) {
        await tx.invoiceImportRowStaging.update({
          where: { id: row.id },
          data: {
            matchStatus: InvoiceImportMatchStatus.INVALID,
            validationNote: "Riga approvata ma incompleta: servono fingerprint e imponibile affidabile.",
            validationStatus: InvoiceImportValidationStatus.PENDING,
          },
        });
        continue;
      }

      if (existingByFingerprint.has(row.fingerprint)) {
        await tx.invoiceImportRowStaging.update({
          where: { id: row.id },
          data: {
            matchStatus: InvoiceImportMatchStatus.ALREADY_IMPORTED,
            validationNote: "Fingerprint gia presente nel fatturato actual definitivo.",
            validationStatus: InvoiceImportValidationStatus.REJECTED,
          },
        });
        continue;
      }

      await tx.issuedInvoiceActual.create({
        data: {
          jobOrderId: row.jobOrderId,
          sourceImportSessionId: session.id,
          sourceImportRowId: row.id,
          sourceAccountCode: row.sourceAccountCode,
          sourceAccountDescription: row.sourceAccountDescription,
          registrationDate: row.registrationDate,
          registrationProtocol: row.registrationProtocol,
          documentDate: row.documentDate,
          invoiceNumber: row.invoiceNumber,
          customerCode: row.customerCode,
          customerName: row.customerName,
          netAmount: row.netAmount,
          vatAmount: row.vatAmount,
          grossAmount: row.grossAmount,
          fingerprint: row.fingerprint,
        },
      });

      existingByFingerprint.add(row.fingerprint);
      affectedJobOrderIds.add(row.jobOrderId);
      createdCount += 1;
    }

    await tx.invoiceImportSession.update({
      where: { id: session.id },
      data: {
        status: InvoiceImportSessionStatus.APPLIED,
        appliedAt: new Date(),
      },
    });
  });

  for (const jobOrderId of affectedJobOrderIds) {
    await recalculateJobOrderActualRevenue(jobOrderId);
  }

  return {
    createdCount,
    approvedCount: session.rows.length,
  };
}

export async function recalculateJobOrderActualRevenue(jobOrderId: string) {
  const grouped = await prisma.issuedInvoiceActual.aggregate({
    where: { jobOrderId },
    _sum: {
      netAmount: true,
    },
  });

  const actualRevenue = Number(grouped._sum.netAmount ?? 0);

  await prisma.jobOrder.update({
    where: { id: jobOrderId },
    data: {
      actualRevenue: new Prisma.Decimal(actualRevenue.toFixed(2)),
    },
  });
}

export type InvoiceImportSessionPayload = NonNullable<InvoiceImportSessionDetails>;
