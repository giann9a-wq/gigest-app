"use server";

import type { Route } from "next";
import { AccessRequestStatus, UserRole, UserStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  clearAdminPanelSession,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
  unlockAdminPanel,
} from "@/lib/admin-panel";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/photo-repository";

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

export async function updateUserRoleAction(formData: FormData) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  if (!hasAccess) {
    redirect(buildAdminRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const userId = String(formData.get("userId") ?? "");
  const nextRole = String(formData.get("role") ?? "");

  if (nextRole !== UserRole.ADMIN && nextRole !== UserRole.OPERATOR) {
    redirect(buildAdminRedirect("Ruolo selezionato non valido.", "error"));
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  if (!targetUser || targetUser.status !== UserStatus.ACTIVE) {
    redirect(buildAdminRedirect("Utente attivo non trovato.", "error"));
  }

  if (targetUser.role === UserRole.ADMIN && nextRole === UserRole.OPERATOR) {
    const activeAdminCount = await prisma.user.count({
      where: {
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      },
    });

    if (activeAdminCount <= 1) {
      redirect(buildAdminRedirect("Deve restare almeno un utente admin attivo.", "error"));
    }
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: {
      role: nextRole,
    },
  });

  revalidatePath("/admin/accessi");
  redirect(buildAdminRedirect(`Ruolo aggiornato per ${targetUser.email}.`));
}

export async function updateUserWhatsappAction(formData: FormData) {
  const adminUser = await requireAdminUser();
  if (!adminUser) redirect("/dashboard");

  const hasAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  if (!hasAccess) {
    redirect(buildAdminRedirect("Sblocca prima l'area admin con la password aggiuntiva.", "error"));
  }

  const userId = String(formData.get("userId") ?? "");
  const internationalPrefix = String(formData.get("internationalPrefix") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const whatsappId = String(formData.get("whatsappId") ?? "").trim();
  const whatsappEnabled = formData.get("whatsappEnabled") === "on";
  const whatsappPhone = phone ? normalizeWhatsappPhone(phone.startsWith("+") ? phone : `${internationalPrefix}${phone}`) : "";

  if (whatsappEnabled && !/^\+\d{8,15}$/.test(whatsappPhone)) {
    redirect(buildAdminRedirect("Inserisci un numero WhatsApp valido prima di abilitarlo.", "error"));
  }

  const targetUser = await prisma.user.findFirst({ where: { id: userId, status: UserStatus.ACTIVE }, select: { email: true } });
  if (!targetUser) redirect(buildAdminRedirect("Utente attivo non trovato.", "error"));

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        phone: phone || null,
        internationalPrefix: internationalPrefix || null,
        whatsappPhone: whatsappPhone || null,
        whatsappEnabled,
        whatsappId: whatsappId || null,
      },
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2002") {
      redirect(buildAdminRedirect("Numero o identificativo WhatsApp già associato a un altro utente.", "error"));
    }
    throw error;
  }

  revalidatePath("/admin/accessi");
  redirect(buildAdminRedirect(`Configurazione WhatsApp aggiornata per ${targetUser.email}.`));
}
