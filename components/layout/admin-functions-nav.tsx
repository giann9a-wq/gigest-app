import type { Route } from "next";
import Link from "next/link";

type AdminSection = "accessi" | "import-diario-manuale" | "import-costi" | "import-fatture";

const ADMIN_FUNCTIONS: Array<{
  key: AdminSection;
  href: Route;
  title: string;
  description: string;
}> = [
  {
    key: "accessi",
    href: "/admin/accessi" as Route,
    title: "Gestione accessi Google",
    description: "Approva o rifiuta le richieste di accesso degli utenti.",
  },
  {
    key: "import-diario-manuale",
    href: "/admin/import-diario-manuale" as Route,
    title: "Import diario cantiere manuale",
    description: "Importa righe diario da file validando risorse e commesse.",
  },
  {
    key: "import-costi",
    href: "/admin/import-costi" as Route,
    title: "Importa costi",
    description: "Seleziona una commessa e prepara l'import dei costi actual.",
  },
  {
    key: "import-fatture",
    href: "/admin/import-fatture" as Route,
    title: "Importa fatture",
    description: "Seleziona una commessa e prepara l'import del fatturato.",
  },
];

export function AdminFunctionsNav({ current }: { current?: AdminSection }) {
  return (
    <section className="card admin-functions-card">
      <div className="mobile-section-header" style={{ marginBottom: "0.75rem" }}>
        <div>
          <h2 style={{ margin: 0 }}>Funzioni Admin</h2>
          <p className="mobile-section-subtitle">Seleziona rapidamente l&apos;area operativa da gestire.</p>
        </div>
      </div>

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
              <span>{item.description}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
