export type CostImportAccount = {
  code: string;
  description: string;
  rows: number;
  amount: number;
  invalidRows: number;
};

export type CostImportGroup = {
  code: string;
  accounts: CostImportAccount[];
};

export function groupCostImportRows(rows: Array<{
  sourceAccountCode: string | null;
  sourceAccountDescription: string | null;
  amount: number | null;
  matchStatus: string;
}>) {
  const groups = new Map<string, Map<string, CostImportAccount>>();
  let unassignedRows = 0;
  for (const row of rows) {
    if (!row.sourceAccountCode) { unassignedRows++; continue; }
    const code = row.sourceAccountCode.split(".").slice(0, 2).join(".");
    const accounts = groups.get(code) ?? new Map<string, CostImportAccount>();
    const account = accounts.get(row.sourceAccountCode) ?? {
      code: row.sourceAccountCode, description: row.sourceAccountDescription ?? "",
      rows: 0, amount: 0, invalidRows: 0,
    };
    account.rows++;
    account.amount = Math.round((account.amount + (row.amount ?? 0)) * 100) / 100;
    account.invalidRows += Number(row.matchStatus === "INVALID");
    accounts.set(account.code, account);
    groups.set(code, accounts);
  }
  return {
    groups: [...groups].map(([code, accounts]) => ({ code, accounts: [...accounts.values()] })),
    unassignedRows,
  };
}
