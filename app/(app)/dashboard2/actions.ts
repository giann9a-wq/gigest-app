"use server";

import { DashboardTaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getActiveAppUser } from "@/lib/app-user";
import { createDashboardTask, deleteDashboardTask, updateDashboardTaskStatus } from "@/lib/dashboard-tasks";

export async function createDashboardTaskAction(formData: FormData) {
  const activeUser = await getActiveAppUser();

  if (!activeUser) {
    redirect("/login");
  }

  await createDashboardTask({
    activeUser,
    description: String(formData.get("description") ?? ""),
    dueDate: String(formData.get("dueDate") ?? ""),
    assigneeId: String(formData.get("assigneeId") ?? ""),
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard2");
  revalidatePath("/dashboard_old");
}

export async function updateDashboardTaskStatusAction(formData: FormData) {
  const activeUser = await getActiveAppUser();

  if (!activeUser) {
    redirect("/login");
  }

  const rawStatus = String(formData.get("status") ?? "");
  const status = Object.values(DashboardTaskStatus).includes(rawStatus as DashboardTaskStatus)
    ? (rawStatus as DashboardTaskStatus)
    : null;

  if (!status) {
    throw new Error("Stato task non valido.");
  }

  await updateDashboardTaskStatus({
    activeUser,
    taskId: String(formData.get("taskId") ?? ""),
    status,
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard2");
  revalidatePath("/dashboard_old");
}

export async function deleteDashboardTaskAction(formData: FormData) {
  const activeUser = await getActiveAppUser();

  if (!activeUser) {
    redirect("/login");
  }

  await deleteDashboardTask({
    activeUser,
    taskId: String(formData.get("taskId") ?? ""),
  });

  revalidatePath("/dashboard");
  revalidatePath("/dashboard2");
  revalidatePath("/dashboard_old");
}
