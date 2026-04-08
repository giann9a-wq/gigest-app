import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { LogoutButton } from "@/components/layout/logout-button";
import { getActiveAppUser } from "@/lib/app-user";
import "./globals.css";

export const metadata: Metadata = {
  title: "GiGEST",
  description: "Gestionale tecnico per diario cantiere, risorse, mezzi, commesse e scadenze.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  const activeAppUser = session?.user?.email ? await getActiveAppUser() : null;

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
                {activeAppUser?.role === "ADMIN" ? (
                  <Link href="/admin/accessi" className="app-nav-link">Admin</Link>
                ) : null}
                <span className="app-nav-link app-nav-link-disabled" aria-disabled="true" title="Pagina in preparazione">
                  Dashboard Commessa
                </span>
              </nav>
              {session?.user ? (
                <div className="app-user-actions">
                  <span className="app-user-chip">
                    {session.user.name ?? session.user.email ?? "Utente"}
                  </span>
                  <LogoutButton />
                </div>
              ) : null}
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
