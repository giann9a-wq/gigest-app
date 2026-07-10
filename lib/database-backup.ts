import { prisma } from "@/lib/prisma";

type ModelConfig = {
  key: string;
  label: string;
};

const MODEL_ORDER: ModelConfig[] = [
  { key: "user", label: "User" },
  { key: "dashboardTask", label: "DashboardTask" },
  { key: "accessRequest", label: "AccessRequest" },
  { key: "adminPanelCredential", label: "AdminPanelCredential" },
  { key: "adminPanelSession", label: "AdminPanelSession" },
  { key: "appSetting", label: "AppSetting" },
  { key: "automationEmailLog", label: "AutomationEmailLog" },
  { key: "account", label: "Account" },
  { key: "session", label: "Session" },
  { key: "verificationToken", label: "VerificationToken" },
  { key: "person", label: "Person" },
  { key: "equipment", label: "Equipment" },
  { key: "jobOrder", label: "JobOrder" },
  { key: "externalResource", label: "ExternalResource" },
  { key: "calendarIntegration", label: "CalendarIntegration" },
  { key: "invoiceImportSession", label: "InvoiceImportSession" },
  { key: "costImportSession", label: "CostImportSession" },
  { key: "personCost", label: "PersonCost" },
  { key: "equipmentCost", label: "EquipmentCost" },
  { key: "maintenance", label: "Maintenance" },
  { key: "maintenanceDocument", label: "MaintenanceDocument" },
  { key: "training", label: "Training" },
  { key: "trainingDocument", label: "TrainingDocument" },
  { key: "diaryReminderEmailLog", label: "DiaryReminderEmailLog" },
  { key: "autoDiaryEntryProposal", label: "AutoDiaryEntryProposal" },
  { key: "diaryActivity", label: "DiaryActivity" },
  { key: "externalDiaryActivity", label: "ExternalDiaryActivity" },
  { key: "materialUsage", label: "MaterialUsage" },
  { key: "deliveryNoteUsage", label: "DeliveryNoteUsage" },
  { key: "deliveryNoteDocument", label: "DeliveryNoteDocument" },
  { key: "scannedDeliveryNote", label: "ScannedDeliveryNote" },
  { key: "deadline", label: "Deadline" },
  { key: "calendarEventMapping", label: "CalendarEventMapping" },
  { key: "costImportRowStaging", label: "CostImportRowStaging" },
  { key: "costActualEntry", label: "CostActualEntry" },
  { key: "costImportCorrectionRule", label: "CostImportCorrectionRule" },
  { key: "invoiceImportRowStaging", label: "InvoiceImportRowStaging" },
  { key: "issuedInvoiceActual", label: "IssuedInvoiceActual" },
  { key: "jobOrderAdvance", label: "JobOrderAdvance" },
];

export type DatabaseBackupPayload = {
  format: "gigest-db-backup";
  version: 1;
  exportedAt: string;
  models: string[];
  rows: Record<string, unknown[]>;
};

function delegate(modelKey: string) {
  return (prisma as any)[modelKey];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex]);
      }
    })
  );

  return results;
}

export function buildBackupFileName(date = new Date()) {
  const stamp = date.toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
  return `gigest-db-backup-${stamp}.json`;
}

export async function createDatabaseBackup(): Promise<DatabaseBackupPayload> {
  const rows: Record<string, unknown[]> = {};

  const modelRows = await mapWithConcurrency(MODEL_ORDER, 6, async (model) => ({
    label: model.label,
    rows: await delegate(model.key).findMany(),
  }));

  for (const model of modelRows) {
    rows[model.label] = model.rows;
  }

  return {
    format: "gigest-db-backup",
    version: 1,
    exportedAt: new Date().toISOString(),
    models: MODEL_ORDER.map((model) => model.label),
    rows,
  };
}

export function summarizeBackup(payload: DatabaseBackupPayload) {
  return MODEL_ORDER.map((model) => ({
    model: model.label,
    rows: Array.isArray(payload.rows[model.label]) ? payload.rows[model.label].length : 0,
  }));
}

export async function restoreDatabaseBackup(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    throw new Error("File backup non valido.");
  }

  const backup = payload as Partial<DatabaseBackupPayload>;

  if (backup.format !== "gigest-db-backup" || backup.version !== 1 || !backup.rows) {
    throw new Error("Formato backup non riconosciuto.");
  }

  for (const model of MODEL_ORDER) {
    if (!Array.isArray(backup.rows[model.label])) {
      if (model.label === "DashboardTask") {
        backup.rows[model.label] = [];
        continue;
      }

      throw new Error(`Backup incompleto: tabella ${model.label} mancante.`);
    }
  }

  await prisma.$transaction(
    async (tx) => {
      for (const model of [...MODEL_ORDER].reverse()) {
        await (tx as any)[model.key].deleteMany();
      }

      for (const model of MODEL_ORDER) {
        const data = backup.rows?.[model.label] ?? [];
        if (data.length === 0) continue;

        await (tx as any)[model.key].createMany({
          data,
        });
      }
    },
    {
      maxWait: 10_000,
      timeout: 120_000,
    }
  );

  return summarizeBackup(backup as DatabaseBackupPayload);
}
