import Link from "next/link";
import type { Route } from "next";

type JobOrderTabKey = "list" | "dashboard" | "overview" | "statistics" | "costs";

const JOB_ORDER_TABS: Array<{ key: JobOrderTabKey; href: Route; label: string }> = [
  { key: "dashboard", href: "/dashboard-commessa" as Route, label: "Dashboard commesse" },
  { key: "overview", href: "/commesse/overview" as Route, label: "Overview commesse" },
  { key: "list", href: "/commesse" as Route, label: "Elenco commesse" },
  { key: "costs", href: "/commesse/costi" as Route, label: "Costi" },
  { key: "statistics", href: "/statistiche-risorse-commesse" as Route, label: "Estrazione Statistiche" },
];

export function JobOrderTabs({ current }: { current: JobOrderTabKey }) {
  return (
    <div className="job-order-tabs">
      {JOB_ORDER_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={`job-order-tab ${tab.key === current ? "job-order-tab-active" : ""}`}
          aria-current={tab.key === current ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
