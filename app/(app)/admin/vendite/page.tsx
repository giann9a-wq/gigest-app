import { redirect } from "next/navigation";
import { SalesManagementPanel } from "@/components/admin/sales-management-panel";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../accessi/actions";

export default async function AdminVenditePage({ searchParams }: { searchParams: Promise<{ jobOrderId?: string }> }) {
  const { jobOrderId } = await searchParams;
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
            <h1 className="mobile-section-title">Vendite</h1>
            <p className="mobile-section-subtitle">
              Registra le vendite per commessa e pianifica gli acconti concordati.
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
              Serve la password aggiuntiva admin per gestire le vendite.
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
            <AdminFunctionsNav current="vendite" />
            <SalesManagementPanel initialJobOrderId={jobOrderId} />
          </>
        )}
      </section>
    </div>
  );
}

