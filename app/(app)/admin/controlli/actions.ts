"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { hasElevatedAdminPanelAccess, requireAdminUser } from "@/lib/admin-panel";
import { linkExternalResourceToSupplier } from "@/lib/admin-supplier-links";
import { updateAutoDiaryProposal, validateAutoDiaryProposals } from "@/lib/auto-diary-proposals";
import { saveMonthlyResourceReportSettings } from "@/lib/monthly-automation-settings";
import { prisma } from "@/lib/prisma";
import { Prisma, ResourceStatus } from "@prisma/client";

function buildRedirect(message: string, type: "success" | "error" = "success"): Route {
  const params = new URLSearchParams({
    message,
    type,
  });
  return `/admin/controlli?${params.toString()}` as Route;
}

export async function linkExternalSupplierAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  if (!hasAccess) {
    redirect(buildRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const externalResourceId = String(formData.get("externalResourceId") ?? "").trim();
  const supplierName = String(formData.get("supplierName") ?? "").trim();

  try {
    await linkExternalResourceToSupplier(externalResourceId, supplierName);
  } catch (error) {
    redirect(buildRedirect(error instanceof Error ? error.message : "Collegamento non riuscito.", "error"));
  }

  revalidatePath("/admin/controlli");
  revalidatePath("/diario");
  redirect(buildRedirect("Anagrafica collegata e storico aggiornato."));
}

export async function saveMonthlyResourceReportRecipientsAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  if (!hasAccess) {
    redirect(buildRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  try {
    const includedResourceIds = formData
      .getAll("includedResourceIds")
      .map((value) => String(value).trim())
      .filter(Boolean);

    await saveMonthlyResourceReportSettings({
      rawRecipients: String(formData.get("recipients") ?? ""),
      includedResourceIds,
    });
  } catch (error) {
    redirect(buildRedirect(error instanceof Error ? error.message : "Salvataggio destinatari non riuscito.", "error"));
  }

  revalidatePath("/admin/controlli");
  redirect(buildRedirect("Destinatari automatismo mensile salvati."));
}

export async function updateAutoDiaryProposalAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  if (!hasAccess) {
    redirect(buildRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  try {
    await updateAutoDiaryProposal({
      proposalId: String(formData.get("proposalId") ?? "").trim(),
      jobOrderId: String(formData.get("jobOrderId") ?? "").trim(),
      hours: Number(formData.get("hours") ?? ""),
    });
  } catch (error) {
    redirect(buildRedirect(error instanceof Error ? error.message : "Modifica proposta non riuscita.", "error"));
  }

  revalidatePath("/admin/controlli");
  redirect(buildRedirect("Proposta autocompilazione aggiornata."));
}

export async function validateAutoDiaryProposalsAction() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  if (!hasAccess) {
    redirect(buildRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const result = await validateAutoDiaryProposals();

  revalidatePath("/admin/controlli");
  revalidatePath("/dashboard");
  revalidatePath("/diario");
  redirect(buildRedirect(`Autocompilazione validata. Inserite: ${result.applied}, saltate: ${result.skipped}.`));
}

function parseIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isWeekendDate(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function getEasterMondayDate(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day + 1));
}

function dateFromHolidayKey(year: number, key: string) {
  if (key === "EASTER_MONDAY") return getEasterMondayDate(year);
  if (!/^\d{2}-\d{2}$/.test(key)) return null;
  return parseIsoDate(`${year}-${key}`);
}

function getExpectedHours(person: { isPartTime: boolean; partTimeHours: Prisma.Decimal | null }) {
  const partTimeHours = person.partTimeHours ? Number(person.partTimeHours) : 0;
  return person.isPartTime && partTimeHours > 0 ? partTimeHours : 8;
}

export async function createNationalHolidayEntriesAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  if (!hasAccess) {
    redirect(buildRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const jobOrderId = String(formData.get("holidayJobOrderId") ?? "").trim();
  const holidayYear = Number(formData.get("holidayYear") ?? "");
  const selectedHolidayKeys = formData
    .getAll("holidayKeys")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const manualDates = String(formData.get("manualHolidayDates") ?? "")
    .split(/[\s,;]+/g)
    .map((value) => value.trim())
    .filter(Boolean);

  if (!Number.isInteger(holidayYear) || holidayYear < 2000 || holidayYear > 2100) {
    redirect(buildRedirect("Anno festivita non valido.", "error"));
  }

  const selectedDates = selectedHolidayKeys
    .map((key) => dateFromHolidayKey(holidayYear, key))
    .filter((date): date is Date => Boolean(date));
  const manualParsedDates = manualDates.map(parseIsoDate).filter((date): date is Date => Boolean(date));
  const dates = [
    ...new Map(
      [...selectedDates, ...manualParsedDates]
        .filter((date) => !isWeekendDate(date))
        .map((date) => [date.toISOString().slice(0, 10), date])
    ).values(),
  ];

  if (!jobOrderId) {
    redirect(buildRedirect("Seleziona la commessa festivita nazionale.", "error"));
  }

  if (dates.length === 0) {
    redirect(buildRedirect("Seleziona almeno una festivita feriale o inserisci una data manuale feriale.", "error"));
  }

  const jobOrder = await prisma.jobOrder.findFirst({
    where: { id: jobOrderId, status: ResourceStatus.ACTIVE },
    select: { id: true },
  });

  if (!jobOrder) {
    redirect(buildRedirect("Commessa non valida o non attiva.", "error"));
  }

  const people = await prisma.person.findMany({
    where: { status: ResourceStatus.ACTIVE },
    select: {
      id: true,
      isPartTime: true,
      partTimeHours: true,
    },
  });

  let created = 0;
  let skipped = 0;

  await prisma.$transaction(async (tx) => {
    for (const person of people) {
      for (const date of dates) {
        const existing = await tx.diaryActivity.findFirst({
          where: {
            resourceType: "PERSON",
            personId: person.id,
            jobOrderId,
            referenceDate: date,
          },
          select: { id: true },
        });

        if (existing) {
          skipped += 1;
          continue;
        }

        await tx.diaryActivity.create({
          data: {
            referenceDate: date,
            resourceType: "PERSON",
            personId: person.id,
            jobOrderId,
            hours: new Prisma.Decimal(getExpectedHours(person).toFixed(1)),
            activityDescription: "Festivita nazionale",
            source: "AUTO",
            createdByUserId: adminUser.id,
          },
        });
        created += 1;
      }
    }
  });

  revalidatePath("/admin/controlli");
  revalidatePath("/diario");
  revalidatePath("/stampa-risorse-mese");
  redirect(buildRedirect(`Festivita nazionali inserite. Create: ${created}, gia presenti: ${skipped}.`));
}
