import { redirect } from "next/navigation";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { getSharedGoogleCalendarStatus } from "@/lib/google-calendar";
import { lockAdminPanelAction, unlockAdminPanelAction } from "./accessi/actions";

export default async function AdminPage() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  const calendarStatus = hasElevatedAccess ? await getSharedGoogleCalendarStatus() : null;

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
                Troverai accessi Google, import diario cantiere manuale, import costi, import fatture e gestione acconti, ognuno in una pagina dedicata.
              </p>
            </div>
          </div>
        ) : (
          <div className="admin-stack">
            <AdminFunctionsNav />

            {calendarStatus ? (
              <section className="card admin-calendar-panel">
                <div className="mobile-section-header">
                  <div>
                    <p className="dashboard-kicker">Google Calendar</p>
                    <h2 className="mobile-section-title">Stato integrazioni</h2>
                    <p className="mobile-section-subtitle">
                      Account collegati: {calendarStatus.connectedCount} su {calendarStatus.activeGoogleAccountCount}
                    </p>
                  </div>
                  {calendarStatus.missingAccountCount > 0 ? (
                    <span className="admin-calendar-warning">
                      {calendarStatus.missingAccountCount} account da ricollegare
                    </span>
                  ) : null}
                </div>

                {calendarStatus.integrations.length === 0 ? (
                  <p className="muted">Nessuna integrazione Google Calendar collegata.</p>
                ) : (
                  <div className="admin-calendar-list">
                    {calendarStatus.integrations.map((integration) => (
                      <div key={integration.id} className="admin-calendar-row">
                        <div>
                          <strong>{integration.connectedEmail || "Account senza email"}</strong>
                          <p className="muted" style={{ margin: "0.2rem 0 0" }}>
                            {integration.calendarName} · Ultima sync:{" "}
                            {integration.lastSyncedAt
                              ? integration.lastSyncedAt.toLocaleString("it-IT")
                              : "mai"}
                          </p>
                        </div>
                        <span
                          className={
                            integration.syncStatus === "ACTIVE"
                              ? "admin-calendar-status admin-calendar-status-active"
                              : "admin-calendar-status admin-calendar-status-error"
                          }
                        >
                          {integration.syncStatus}
                        </span>
                        {integration.syncError ? (
                          <p className="admin-calendar-error">{integration.syncError}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
