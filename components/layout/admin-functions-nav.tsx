import type { Route } from "next";
import Link from "next/link";

type AdminSection =
  | "accessi"
  | "import-diario-manuale"
  | "import-costi"
  | "import-fatture"
  | "acconti"
  | "controlli"
  | "gestione-db";

const ADMIN_FUNCTIONS: Array<{
  key: AdminSection;
  href: Route;
  title: string;
}> = [
  {
    key: "controlli",
    href: "/admin/controlli" as Route,
    title: "Controlli",
  },
  {
    key: "accessi",
    href: "/admin/accessi" as Route,
    title: "Gestione accessi Google",
  },
  {
    key: "import-diario-manuale",
    href: "/admin/import-diario-manuale" as Route,
    title: "Import diario cantiere manuale",
  },
  {
    key: "import-costi",
    href: "/admin/import-costi" as Route,
    title: "Importa costi",
  },
  {
    key: "import-fatture",
    href: "/admin/import-fatture" as Route,
    title: "Importa fatture",
  },
  {
    key: "acconti",
    href: "/admin/acconti" as Route,
    title: "Gestione Acconti",
  },
  {
    key: "gestione-db",
    href: "/admin/gestione-db" as Route,
    title: "Gestione DB",
  },
];

export function AdminFunctionsNav({ current }: { current?: AdminSection }) {
  return (
    <section className="admin-functions-card">
      <div className="admin-functions-list">
        {ADMIN_FUNCTIONS.map((item) => {
          const isActive = item.key === current;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={`admin-function-item ${isActive ? "admin-function-item-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
            >
              <strong>{item.title}</strong>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
