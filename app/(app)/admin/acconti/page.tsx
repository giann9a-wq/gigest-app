import { redirect } from "next/navigation";
import { AdvanceManagementPanel } from "@/components/admin/advance-management-panel";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../accessi/actions";

export default async function AdminAccontiPage() {
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
            <h1 className="mobile-section-title">Gestione Acconti</h1>
            <p className="mobile-section-subtitle">
              Inserisci ricavi manuali temporanei da sommare alle commesse finche non vengono fatturati.
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
            Password aggiuntiva admin non ancora inizializzata nel database.
          </div>
        ) : !hasElevatedAccess ? (
          <div className="card admin-password-form">
            <strong>Sblocco area sensibile</strong>
            <p className="muted" style={{ margin: 0 }}>
              Serve la password aggiuntiva admin per gestire gli acconti.
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
        ) : (
          <>
            <AdminFunctionsNav current="acconti" />
            <AdvanceManagementPanel />
          </>
        )}
      </section>
    </div>
  );
}
