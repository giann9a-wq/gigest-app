import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import { getImportDomain } from "@/lib/import-domain";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../accessi/actions";
import { ImportPanel } from "../import-massivo/import-panel";

export default async function AdminImportDiarioManualePage() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  const domain = hasElevatedAccess ? await getImportDomain() : null;

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Import diario cantiere manuale</h1>
            <p className="mobile-section-subtitle">
              Scarica il template aggiornato, compila le righe e importa solo valori riconosciuti nel dominio attuale di risorse e commesse.
            </p>
          </div>
          <div className="admin-request-actions">
            <Link href={"/admin" as Route} className="mobile-button-secondary">
              Menu admin
            </Link>
            {hasElevatedAccess ? (
              <form action={lockAdminPanelAction}>
                <button type="submit" className="mobile-button-secondary">
                  Blocca area admin
                </button>
              </form>
            ) : null}
          </div>
        </div>

        {!credential ? (
          <div className="admin-note">
            Password aggiuntiva admin non ancora inizializzata nel database. Imposta
            <code> SEED_ADMIN_PANEL_PASSWORD </code>
            e riesegui il seed.
          </div>
        ) : !hasElevatedAccess ? (
          <div className="admin-grid">
            <div className="card admin-password-form">
              <strong>Sblocco area import</strong>
              <p className="muted" style={{ margin: 0 }}>
                L&apos;import diario è disponibile solo dopo sblocco dell&apos;area admin con la password aggiuntiva.
              </p>
              <form action={unlockAdminPanelAction} className="admin-password-form">
                <input
                  type="password"
                  name="password"
                  className="admin-password-input"
                  placeholder="Inserisci password admin aggiuntiva"
                  autoComplete="current-password"
                />
                <button type="submit" className="button">
                  Sblocca area admin
                </button>
              </form>
            </div>

            <div className="card">
              <strong>Regola import</strong>
              <p className="muted" style={{ marginBottom: 0 }}>
                Il file viene accettato solo se ogni riga usa una risorsa e una commessa presenti nel template scaricato.
                Le righe non riconosciute vengono rifiutate.
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="admin-stat-grid">
              <article className="card admin-stat-card">
                <span className="admin-stat-label">Risorse Attive</span>
                <strong className="admin-stat-value">{domain?.resources.length ?? 0}</strong>
              </article>
              <article className="card admin-stat-card">
                <span className="admin-stat-label">Commesse Attive</span>
                <strong className="admin-stat-value">{domain?.jobOrders.length ?? 0}</strong>
              </article>
              <article className="card admin-stat-card">
                <span className="admin-stat-label">Template</span>
                <a className="button" href="/api/admin/import-massivo/template">
                  Scarica Excel
                </a>
              </article>
            </div>

            <AdminFunctionsNav current="import-diario-manuale" />

            <div className="admin-grid">
              <ImportPanel />

              <section className="card">
                <div className="mobile-section-header">
                  <div>
                    <h2 style={{ margin: 0 }}>Cosa contiene il template</h2>
                    <p className="mobile-section-subtitle">
                      Il file scaricato include un foglio di import e due fogli dominio aggiornati.
                    </p>
                  </div>
                </div>

                <div className="admin-request-list">
                  <article className="card admin-request-card">
                    <strong>Foglio "Import"</strong>
                    <div className="muted">
                      Compila le colonne: <code>Data</code>, <code>Risorsa</code>, <code>Commessa</code>, <code>Ore</code>, <code>Descrizione</code>.
                    </div>
                  </article>
                  <article className="card admin-request-card">
                    <strong>Foglio "Dominio Risorse"</strong>
                    <div className="muted">
                      Contiene tutti i nomi risorsa attivi ammessi per l&apos;import.
                    </div>
                  </article>
                  <article className="card admin-request-card">
                    <strong>Foglio "Dominio Commesse"</strong>
                    <div className="muted">
                      Contiene tutte le commesse attive valide per l&apos;import.
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
