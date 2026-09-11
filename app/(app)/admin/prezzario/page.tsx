import { redirect } from "next/navigation";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import { PriceListImportPanel } from "@/components/admin/price-list-import-panel";
import { requireElevatedAdminUser } from "@/lib/admin-panel";

export default async function AdminPrezzarioPage() {
  if (!(await requireElevatedAdminUser())) redirect("/admin");
  return <div className="admin-page"><AdminFunctionsNav current="prezzario" /><PriceListImportPanel /></div>;
}
