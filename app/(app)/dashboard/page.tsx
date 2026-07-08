import { DashboardExperience } from "@/app/(app)/dashboard/dashboard-experience";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  return <DashboardExperience searchParams={searchParams} variant="wide" weatherActionPath="/dashboard" />;
}
