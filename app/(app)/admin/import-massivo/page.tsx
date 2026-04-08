import type { Route } from "next";
import { redirect } from "next/navigation";

export default function LegacyAdminImportMassivoPage() {
  redirect("/admin/import-diario-manuale" as Route);
}
