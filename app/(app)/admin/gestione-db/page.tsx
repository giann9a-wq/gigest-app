import { redirect } from "next/navigation";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import { hasElevatedAdminPanelAccess, requireAdminUser } from "@/lib/admin-panel";
import { importDatabaseBackupAction } from "./actions";

export default async function AdminGestioneDbPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; type?: string }>;
}) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const feedback = params.message ? decodeURIComponent(params.message) : "";
  const feedbackType = params.type === "error" ? "error" : "success";
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Gestione DB</h1>
            <p className="mobile-section-subtitle">
              Backup e ripristino completo del database applicativo.
            </p>
          </div>
        </div>

        {!hasElevatedAccess ? (
          <div className="admin-note">
            La gestione DB è disponibile solo dopo sblocco dell&apos;area admin con la password aggiuntiva.
          </div>
        ) : (
          <>
            <AdminFunctionsNav current="gestione-db" />
            {feedback ? (
              <div
                className={
                  feedbackType === "error"
                    ? "admin-diary-controls-message admin-diary-controls-error"
                    : "admin-diary-controls-message"
                }
              >
                {feedback}
              </div>
            ) : null}

            <div className="admin-db-grid">
              <section className="admin-db-panel">
                <div>
                  <p className="dashboard-kicker">Backup</p>
                  <h2>Scarica copia completa</h2>
                  <p className="muted">
                    Genera un file JSON con tutte le tabelle del database. Conservalo in locale per storicizzare lo stato del gestionale.
                  </p>
                </div>
                <a className="button admin-db-download" href="/api/admin/gestione-db/backup">
                  Scarica backup DB
                </a>
              </section>

              <section className="admin-db-panel admin-db-panel-danger">
                <div>
                  <p className="dashboard-kicker">Import</p>
                  <h2>Ripristina da backup</h2>
                  <p className="muted">
                    Sostituisce il database corrente con il contenuto del file backup. Prima di procedere scarica sempre un backup dello stato attuale.
                  </p>
                </div>
                <form action={importDatabaseBackupAction} className="admin-db-import-form">
                  <label>
                    <span>File backup JSON</span>
                    <input type="file" name="backupFile" accept="application/json,.json" required />
                  </label>
                  <label>
                    <span>Conferma import</span>
                    <input
                      type="text"
                      name="confirmation"
                      placeholder="Digita IMPORTA DATABASE"
                      required
                    />
                  </label>
                  <button type="submit" className="button">
                    Importa e sostituisci DB
                  </button>
                </form>
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
