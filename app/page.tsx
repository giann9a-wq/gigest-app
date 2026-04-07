import Link from "next/link";

export default function HomePage() {
  return (
    <section className="grid gap-6">
      <div className="card">
        <h1>GiGEST</h1>
        <p className="muted">
          Starter kit del gestionale tecnico con login Google, ruoli, diario, commesse,
          risorse, mezzi e scadenziario.
        </p>
        <div style={{ marginTop: 16 }}>
          <Link className="button" href="/login">
            Accedi
          </Link>
        </div>
      </div>
    </section>
  );
}
