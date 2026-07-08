import { DashboardExperience } from "@/app/(app)/dashboard/dashboard-experience";

type Dashboard2PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Dashboard2Page({ searchParams }: Dashboard2PageProps) {
  return <DashboardExperience searchParams={searchParams} variant="wide" />;
}
