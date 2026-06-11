import Link from "next/link";
import type { Route } from "next";

type ResourceTabKey = "people" | "equipment" | "loadings" | "loadings-dashboard";

const RESOURCE_TABS: Array<{ key: ResourceTabKey; href: Route; label: string }> = [
  { key: "people", href: "/risorse" as Route, label: "Personale" },
  { key: "equipment", href: "/mezzi" as Route, label: "Mezzi e Attrezzature" },
  { key: "loadings", href: "/caricamenti" as Route, label: "Caricamenti" },
  { key: "loadings-dashboard", href: "/dashboard-caricamenti" as Route, label: "Dashboard Caricamenti" },
];

export function ResourceTabs({ current }: { current: ResourceTabKey }) {
  return (
    <div className="job-order-tabs">
      {RESOURCE_TABS.map((tab) => (
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
