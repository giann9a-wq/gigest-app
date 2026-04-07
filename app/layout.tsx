import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiGEST",
  description: "Gestionale tecnico per diario cantiere, risorse, mezzi, commesse e scadenze.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div className="app-header-inner">
              <Link href="/dashboard" className="app-brand">
                <span className="app-brand-mark">Gi</span>
                <span className="app-brand-text">GEST</span>
              </Link>
              <nav className="app-nav" aria-label="Navigazione principale">
                <Link href="/dashboard" className="app-nav-link">Dashboard</Link>
                <Link href="/diario" className="app-nav-link">Diario</Link>
                <Link href="/risorse" className="app-nav-link">Risorse</Link>
                <Link href="/mezzi" className="app-nav-link">Mezzi</Link>
                <Link href="/commesse" className="app-nav-link">Commesse</Link>
                <Link href="/scadenziario" className="app-nav-link">Scadenziario</Link>
                <Link href="/stampa-risorse-mese" className="app-nav-link">Stampa Risorse</Link>
                <Link href="/statistiche-risorse-commesse" className="app-nav-link">Statistiche</Link>
                <span className="app-nav-link app-nav-link-disabled" aria-disabled="true" title="Pagina in preparazione">
                  Dashboard Commessa
                </span>
              </nav>
            </div>
          </header>
          <main className="app-main">
            <div className="app-main-inner">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
