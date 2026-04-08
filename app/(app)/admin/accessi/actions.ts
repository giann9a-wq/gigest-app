"use server";

import type { Route } from "next";
import { AccessRequestStatus, UserStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearAdminPanelSession,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
  unlockAdminPanel,
} from "@/lib/admin-panel";
import { prisma } from "@/lib/prisma";

function buildAdminRedirect(message: string, type: "success" | "error" = "success"): Route {
  const params = new URLSearchParams({
    feedback: message,
    feedbackType: type,
  });

  return `/admin/accessi?${params.toString()}` as Route;
}

export async function unlockAdminPanelAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const password = String(formData.get("password") ?? "").trim();

  if (!password) {
    redirect(buildAdminRedirect("Inserisci la password aggiuntiva admin.", "error"));
  }

  const result = await unlockAdminPanel(adminUser.id, password);

  if (!result.ok) {
    const message =
      result.reason === "missing-credential"
        ? "Password admin non inizializzata nel database. Imposta SEED_ADMIN_PANEL_PASSWORD e riesegui il seed."
        : "Password admin non corretta.";

    redirect(buildAdminRedirect(message, "error"));
  }

  redirect(buildAdminRedirect("Area admin sbloccata."));
}

export async function lockAdminPanelAction() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  await clearAdminPanelSession();
  redirect(buildAdminRedirect("Area admin bloccata."));
}

export async function approveAccessRequestAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  if (!hasAccess) {
    redirect(buildAdminRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const accessRequestId = String(formData.get("accessRequestId") ?? "");

  const accessRequest = await prisma.accessRequest.findUnique({
    where: { id: accessRequestId },
  });

  if (!accessRequest) {
    redirect(buildAdminRedirect("Richiesta non trovata.", "error"));
  }

  await prisma.$transaction([
    prisma.user.upsert({
      where: { email: accessRequest.email.toLowerCase() },
      update: {
        firstName: accessRequest.firstName,
        lastName: accessRequest.lastName,
        status: UserStatus.ACTIVE,
      },
      create: {
        email: accessRequest.email.toLowerCase(),
        firstName: accessRequest.firstName,
        lastName: accessRequest.lastName,
        status: UserStatus.ACTIVE,
      },
    }),
    prisma.accessRequest.update({
      where: { id: accessRequest.id },
      data: {
        status: AccessRequestStatus.APPROVED,
        handledAt: new Date(),
        handledByUserId: adminUser.id,
      },
    }),
  ]);

  revalidatePath("/admin/accessi");
  redirect(buildAdminRedirect(`Richiesta approvata per ${accessRequest.email}.`));
}

export async function rejectAccessRequestAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  if (!hasAccess) {
    redirect(buildAdminRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const accessRequestId = String(formData.get("accessRequestId") ?? "");

  const accessRequest = await prisma.accessRequest.findUnique({
    where: { id: accessRequestId },
  });

  if (!accessRequest) {
    redirect(buildAdminRedirect("Richiesta non trovata.", "error"));
  }

  await prisma.accessRequest.update({
    where: { id: accessRequest.id },
    data: {
      status: AccessRequestStatus.REJECTED,
      handledAt: new Date(),
      handledByUserId: adminUser.id,
    },
  });

  revalidatePath("/admin/accessi");
  redirect(buildAdminRedirect(`Richiesta rifiutata per ${accessRequest.email}.`));
}
