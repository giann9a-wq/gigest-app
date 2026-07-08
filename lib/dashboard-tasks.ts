import { DashboardTaskStatus, UserStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ActiveAppUser } from "@/lib/app-user";
import { sendGmailTextEmail } from "@/lib/gmail-mailer";

export type DashboardTaskRow = Awaited<ReturnType<typeof getDashboardTasksForUser>>[number];
export type DashboardTaskUserOption = Awaited<ReturnType<typeof getDashboardTaskUserOptions>>[number];

export async function getDashboardTasksForUser(userId: string, options?: { includeArchived?: boolean }) {
  return prisma.dashboardTask.findMany({
    where: {
      ...(options?.includeArchived ? {} : { status: { not: DashboardTaskStatus.ARCHIVED } }),
      OR: [{ ownerId: userId }, { assigneeId: userId }],
    },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
    include: {
      owner: { select: { id: true, firstName: true, lastName: true, email: true } },
      assignee: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
  });
}

export async function getArchivedDashboardTaskCount(userId: string) {
  return prisma.dashboardTask.count({
    where: {
      status: DashboardTaskStatus.ARCHIVED,
      OR: [{ ownerId: userId }, { assigneeId: userId }],
    },
  });
}

export async function getDashboardTaskUserOptions() {
  return prisma.user.findMany({
    where: { status: UserStatus.ACTIVE },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { email: "asc" }],
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  });
}

export function getUserDisplayName(user: {
  firstName: string | null;
  lastName: string | null;
  email: string;
}) {
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return fullName || user.email;
}

function getDashboard2Url() {
  if (process.env.AUTH_URL) return `${process.env.AUTH_URL.replace(/\/$/, "")}/dashboard2`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/dashboard2`;
  return "/dashboard2";
}

function formatTaskDueDate(value: Date | null) {
  if (!value) return "Non impostata";
  return value.toLocaleDateString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function notifyTaskAssignment(input: {
  assignee: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  };
  owner: ActiveAppUser;
  description: string;
  dueDate: Date | null;
}) {
  const assigneeName = getUserDisplayName(input.assignee);
  const body = [
    `Ciao ${assigneeName},`,
    "",
    `${input.owner.email} ti ha assegnato una nuova task su GiGEST.`,
    "",
    `Descrizione: ${input.description}`,
    `Scadenza: ${formatTaskDueDate(input.dueDate)}`,
    "",
    `Puoi vederla dalla dashboard: ${getDashboard2Url()}`,
    "",
    "Ti chiediamo di non rispondere a questa comunicazione.",
    "",
  ].join("\n");

  await sendGmailTextEmail({
    to: [input.assignee.email],
    subject: "Nuova task assegnata su GiGEST",
    body,
  });
}

export async function createDashboardTask(input: {
  activeUser: ActiveAppUser;
  description: string;
  dueDate?: string;
  assigneeId?: string;
}) {
  const description = input.description.trim();

  if (description.length < 3) {
    throw new Error("Inserisci una descrizione di almeno 3 caratteri.");
  }

  if (description.length > 500) {
    throw new Error("La descrizione puo contenere al massimo 500 caratteri.");
  }

  let assigneeId = input.assigneeId?.trim() || input.activeUser.id;
  const assignee = await prisma.user.findFirst({
    where: { id: assigneeId, status: UserStatus.ACTIVE },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  if (!assignee) {
    assigneeId = input.activeUser.id;
  }

  const dueDate = input.dueDate ? new Date(`${input.dueDate}T00:00:00.000Z`) : null;

  await prisma.dashboardTask.create({
    data: {
      description,
      dueDate,
      ownerId: input.activeUser.id,
      assigneeId,
      createdByUserId: input.activeUser.id,
    },
  });

  if (assignee && assignee.id !== input.activeUser.id) {
    await notifyTaskAssignment({
      assignee,
      owner: input.activeUser,
      description,
      dueDate,
    });
  }
}

export async function updateDashboardTaskStatus(input: {
  activeUser: ActiveAppUser;
  taskId: string;
  status: DashboardTaskStatus;
}) {
  const task = await prisma.dashboardTask.findFirst({
    where: {
      id: input.taskId,
      OR: [{ ownerId: input.activeUser.id }, { assigneeId: input.activeUser.id }],
    },
    select: { id: true },
  });

  if (!task) {
    throw new Error("Task non trovata o non disponibile per questo utente.");
  }

  await prisma.dashboardTask.update({
    where: { id: task.id },
    data: { status: input.status },
  });
}

export async function deleteDashboardTask(input: {
  activeUser: ActiveAppUser;
  taskId: string;
}) {
  const task = await prisma.dashboardTask.findFirst({
    where: {
      id: input.taskId,
      OR: [{ ownerId: input.activeUser.id }, { assigneeId: input.activeUser.id }],
    },
    select: { id: true },
  });

  if (!task) {
    throw new Error("Task non trovata o non disponibile per questo utente.");
  }

  await prisma.dashboardTask.delete({
    where: { id: task.id },
  });
}
