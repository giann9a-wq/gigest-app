"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { requireElevatedAdminUser } from "@/lib/admin-panel";
import { restoreDatabaseBackup } from "@/lib/database-backup";

function buildRedirect(message: string, type: "success" | "error" = "success"): Route {
  const params = new URLSearchParams({
    message,
    type,
  });
  return `/admin/gestione-db?${params.toString()}` as Route;
}

export async function importDatabaseBackupAction(formData: FormData) {
  const adminUser = await requireElevatedAdminUser();

  if (!adminUser) {
    redirect(buildRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const confirmation = String(formData.get("confirmation") ?? "").trim();
  if (confirmation !== "IMPORTA DATABASE") {
    redirect(buildRedirect("Conferma import non valida. Digita IMPORTA DATABASE.", "error"));
  }

  const file = formData.get("backupFile");
  if (!(file instanceof File) || file.size === 0) {
    redirect(buildRedirect("Carica un file backup JSON valido.", "error"));
  }

  let successMessage = "";

  try {
    const rawText = await file.text();
    const payload = JSON.parse(rawText);
    const summary = await restoreDatabaseBackup(payload);
    const totalRows = summary.reduce((sum, item) => sum + item.rows, 0);
    successMessage = `Database importato correttamente. Righe ripristinate: ${totalRows}.`;
  } catch (error) {
    redirect(buildRedirect(error instanceof Error ? error.message : "Import database non riuscito.", "error"));
  }

  revalidatePath("/", "layout");
  redirect(buildRedirect(successMessage));
}
