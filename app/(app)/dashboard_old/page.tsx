import { DashboardExperience } from "@/app/(app)/dashboard/dashboard-experience";

type DashboardOldPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardOldPage({ searchParams }: DashboardOldPageProps) {
  return <DashboardExperience searchParams={searchParams} variant="standard" weatherActionPath="/dashboard_old" />;
}
