import Link from "next/link";
import type { Route } from "next";

export default function HomePage() {
  return (
    <section className="grid gap-6">
      <div className="card">
        <h1>GiGEST</h1>
        <p className="muted">
          Gestionale tecnico per diario di cantiere, risorse, mezzi, commesse e
          scadenziario.
        </p>
        <p>
          Gli utenti autorizzati possono accedere con Google e collegare un
          calendario GiGEST dedicato al proprio account Google Calendar per
          sincronizzare le scadenze operative dell'applicazione.
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          <Link className="button" href="/login">
            Accedi
          </Link>
          <Link className="button secondary" href={"/privacy" as Route}>
            Privacy
          </Link>
          <Link className="button secondary" href={"/terms" as Route}>
            Termini
          </Link>
        </div>
      </div>
    </section>
  );
}
