"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { hasElevatedAdminPanelAccess, requireAdminUser } from "@/lib/admin-panel";
import { saveHeaderNews } from "@/lib/app-news";

function buildRedirect(message: string, type: "success" | "error" = "success"): Route {
  const params = new URLSearchParams({ message, type });
  return `/admin/news?${params.toString()}` as Route;
}

export async function saveHeaderNewsAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  if (!hasAccess) {
    redirect(buildRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  try {
    await saveHeaderNews({
      title: String(formData.get("title") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
  } catch (error) {
    redirect(buildRedirect(error instanceof Error ? error.message : "Salvataggio news non riuscito.", "error"));
  }

  revalidatePath("/", "layout");
  revalidatePath("/admin/news");
  redirect(buildRedirect("News header aggiornata."));
}
