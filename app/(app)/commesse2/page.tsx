import { redirect } from "next/navigation";
import type { Route } from "next";

export default async function LegacyCommessePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const values = await searchParams; const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (typeof value === "string") query.set(key, value);
  redirect(`/commesse${query.size ? `?${query}` : ""}` as Route);
}
