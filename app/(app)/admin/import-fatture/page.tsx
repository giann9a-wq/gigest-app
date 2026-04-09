import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { InvoiceImportPanel } from "@/components/admin/invoice-import-panel";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import {
  getInvoiceImportSchemaMissingMessage,
  isInvoiceImportSchemaMissingError,
  listRecentInvoiceImportSessions,
} from "@/lib/invoice-import";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../accessi/actions";

export default async function AdminImportFatturePage() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  let recentSessions: Awaited<ReturnType<typeof listRecentInvoiceImportSessions>> = [];
  let schemaWarning = "";

  if (hasElevatedAccess) {
    try {
      recentSessions = await listRecentInvoiceImportSessions();
    } catch (error) {
      if (isInvoiceImportSchemaMissingError(error)) {
        schemaWarning = getInvoiceImportSchemaMissingMessage();
      } else {
        throw error;
      }
    }
  }

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Importa fatture</h1>
            <p className="mobile-section-subtitle">
              Carica il partitario fatture `.xls`, valida lo staging globale e collega manualmente ogni fattura alla commessa corretta prima della conferma.
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
                L&apos;import fatture e disponibile solo dopo sblocco dell&apos;area admin con la password aggiuntiva.
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
          </div>
        ) : (
          <>
            <AdminFunctionsNav current="import-fatture" />
            {schemaWarning ? <div className="admin-note">{schemaWarning}</div> : null}
            <InvoiceImportPanel recentSessions={recentSessions} />
          </>
        )}
      </section>
    </div>
  );
}
