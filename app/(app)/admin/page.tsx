import { redirect } from "next/navigation";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { lockAdminPanelAction, unlockAdminPanelAction } from "./accessi/actions";

export default async function AdminPage() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Menu Admin</h1>
            <p className="mobile-section-subtitle">
              Da qui puoi entrare nelle funzioni dedicate di gestione accessi e import.
            </p>
          </div>
          <div className="admin-request-actions">
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
              <strong>Sblocco area sensibile</strong>
              <p className="muted" style={{ margin: 0 }}>
                Dopo l&apos;accesso con Google, serve anche la password aggiuntiva admin per usare le funzioni riservate.
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
              <strong>Funzioni disponibili</strong>
              <p className="muted" style={{ marginBottom: 0 }}>
                Troverai accessi Google, import diario cantiere manuale, import costi e import fatture, ognuno in una pagina dedicata.
              </p>
            </div>
          </div>
        ) : (
          <AdminFunctionsNav />
        )}
      </section>
    </div>
  );
}
