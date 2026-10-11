import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "../lib/prisma";
import { createCostImportSession, parsePartitarioXls } from "../lib/cost-actual-import";
import { groupCostImportRows } from "../lib/cost-import-preview";

async function main() {
  const workbook = XLSX.utils.book_new();
  const movement = (amount: number, document: string) => {
    const row = Array(13).fill("");
    row[1] = "04/02/2026"; row[6] = "FATTURA DI ACQUISTO";
    row[9] = "31/01/2026"; row[10] = document;
    row[amount > 0 ? 11 : 12] = Math.abs(amount);
    return row;
  };
  const supplier = Array(13).fill(""); supplier[8] = "212.00020 - FORNITORE TEST";
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["303.23.00010 - MATERIE PRIME CONCOREZZO"], movement(100, "A"), supplier,
    ["303.23.00040 - SPESE VARIE CONCOREZZO"], movement(-20, "B"), supplier,
    ["303.24.00010 - MATERIE PRIME MERATE"], movement(200, "C"), supplier,
  ]), "Partitario");
  const buffer: Buffer = XLSX.write(workbook, { type: "buffer", bookType: "xls" });
  const parsed = parsePartitarioXls(buffer, "job-a");
  const preview = groupCostImportRows(parsed.rows);
  assert.equal(preview.groups.length, 2);
  assert.equal(preview.groups[0].accounts.reduce((sum, account) => sum + account.amount, 0), 80);
  assert.equal(parsed.rows[1].amount, -20);
  assert.notEqual(parsePartitarioXls(buffer, "job-b").rows[0].fingerprint, parsed.rows[0].fingerprint);

  // Mock every database boundary: these checks never read or write live records.
  let storedRows: any[] = [];
  let sessionCount = 0;
  let existing: any[] = [];
  (prisma.jobOrder.findUnique as any) = async () => ({ id: "job-a" });
  (prisma.costImportCorrectionRule.findMany as any) = async () => [];
  (prisma.costImportRowStaging.findMany as any) = async () => [];
  (prisma.costActualEntry.findMany as any) = async () => existing;
  (prisma.$transaction as any) = async (callback: any) => callback({
    costImportSession: { create: async () => ({ id: `session-${++sessionCount}` }) },
    costImportRowStaging: { createMany: async ({ data }: any) => { storedRows = data; } },
  });
  const input = { jobOrderId: "job-a", fileName: "test.xls", buffer };
  await createCostImportSession({ ...input, sourceAccountCodes: ["303.23.00010"] });
  assert.equal(storedRows.length, 1);
  assert.equal(storedRows[0].sourceAccountCode, "303.23.00010");
  assert.equal(storedRows[0].fingerprint, parsed.rows[0].fingerprint, "Existing single-job identity must remain compatible");
  assert.equal(storedRows[0].sourceRowFingerprint, parsed.rows[0].sourceRowFingerprint);
  existing = [{ ...parsed.rows[0], id: "existing-cost" }];
  const repeated = await createCostImportSession({ ...input, sourceAccountCodes: ["303.23.00010", "303.23.00040"] });
  assert.equal(repeated.summary.duplicateRows, 1);
  assert.equal(repeated.summary.newRows, 1);
  assert.equal(storedRows.length, 2);
  assert(storedRows.every((row) => row.jobOrderId === "job-a"));
  assert.equal(storedRows[0].matchStatus, "ALREADY_IMPORTED");
  assert.equal(storedRows[0].validationStatus, "PENDING");
  await assert.rejects(createCostImportSession({ ...input, sourceAccountCodes: [] }));
  await assert.rejects(createCostImportSession({ ...input, sourceAccountCodes: ["303.99.00010"] }));
  assert.equal(sessionCount, 2, "Invalid selections must not create sessions");

  if (process.argv[2]) {
    const actual = parsePartitarioXls(readFileSync(process.argv[2]), "job-a");
    const grouped = groupCostImportRows(actual.rows);
    const sourceWorkbook = XLSX.read(readFileSync(process.argv[2]), { type: "buffer" });
    const raw = XLSX.utils.sheet_to_json<any[]>(sourceWorkbook.Sheets[sourceWorkbook.SheetNames[0]], { header: 1, defval: "" });
    const movements = raw.filter((row) => /^\d{2}\/\d{2}\/\d{4}$/.test(String(row[1])) && row[6]);
    assert.equal(actual.rows.length, movements.length);
    const sourceTotal = movements.reduce((sum, row) => sum + Number(row[11] || 0) - Number(row[12] || 0), 0);
    const parsedTotal = actual.rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
    assert(Math.abs(sourceTotal - parsedTotal) < 0.01);
    assert.equal(grouped.groups.flatMap((group) => group.accounts).reduce((sum, account) => sum + account.rows, 0), actual.rows.length);
    console.log(JSON.stringify({ groups: grouped.groups.length, accounts: grouped.groups.flatMap((group) => group.accounts).length, movements: actual.rows.length, amount: Math.round(parsedTotal * 100) / 100, invalid: actual.summary.invalidRows, negative: actual.rows.filter((row) => (row.amount ?? 0) < 0).length, unassigned: grouped.unassignedRows }));
  }
  console.log("Cost import checks passed: exclusions, grouping, negative amounts, job-specific fingerprints, repeat-import detection, invalid selections.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
