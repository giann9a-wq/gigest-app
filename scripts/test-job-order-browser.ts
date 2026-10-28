import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import assert from "node:assert/strict";

async function main() {
  process.loadEnvFile(".env.production.local");
  const original = process.env.DATABASE_URL!;
  const schema = `ui_test_${Date.now()}`;
  assert.match(schema, /^ui_test_\d+$/);
  const admin = new PrismaClient({ datasourceUrl: original });
  let db: PrismaClient | undefined;
  try {
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    const url = new URL(original); url.searchParams.set("schema", schema); process.env.DATABASE_URL = url.toString();
    // Migration deployment is covered by test:commesse; UI uses an empty disposable schema.
    execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate"], { env: process.env, stdio: "pipe" });
    console.log("Schema UI pronto; verifica browser desktop/mobile…");
    const { prisma } = await import("../lib/prisma"); db = prisma;
    const actor = `${schema}@example.invalid`;
    const user = await db.user.create({ data: { email: actor, role: "ADMIN", status: "ACTIVE" } });
    const job = await db.jobOrder.create({ data: { name: "Nuovo nome", type: "SITE", clientDossierEnabled: true, technicalBookEnabled: true, salesPriceListEnabled: true, budgetExpectedRevenue: 500000 } });
    const { verifyWorkspaceUI } = await import("./verify-job-order-ui");
    await verifyWorkspaceUI({ databaseUrl: process.env.DATABASE_URL!, actor, userId: user.id, jobOrderId: job.id, db });
  } finally {
    await db?.$disconnect();
    await admin.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await admin.$disconnect();
    process.env.DATABASE_URL = original;
  }
}
main().catch(e => { console.error(e instanceof Error ? e.message : "Verifica browser fallita"); process.exitCode = 1; });
