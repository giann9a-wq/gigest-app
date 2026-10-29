import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardExperience } from "@/app/(app)/dashboard/dashboard-experience";
import { getActiveAppUser } from "@/lib/app-user";

export const metadata: Metadata = { title: "Dashboard anteprima | GiGEST", robots: { index: false, follow: false } };
export default async function DashboardPreviewPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await getActiveAppUser()) redirect("/login");
  return <DashboardExperience searchParams={searchParams} variant="wide" weatherActionPath="/dashboard002" planningPreview />;
}
