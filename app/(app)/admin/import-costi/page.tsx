import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { CostImportPanel } from "@/components/admin/cost-import-panel";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import {
  getCostImportSchemaMissingMessage,
  isCostImportSchemaMissingError,
  listRecentCostImportSessions,
} from "@/lib/cost-actual-import";
import { prisma } from "@/lib/prisma";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../accessi/actions";

export default async function AdminImportCostiPage() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  let jobOrders: Array<{ id: string; name: string; type: string; status: string }> = [];
  let recentSessions: Awaited<ReturnType<typeof listRecentCostImportSessions>> = [];
  let schemaWarning = "";

  if (hasElevatedAccess) {
    jobOrders = await prisma.jobOrder.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
      },
    });

    try {
      recentSessions = await listRecentCostImportSessions();
    } catch (error) {
      if (isCostImportSchemaMissingError(error)) {
        schemaWarning = getCostImportSchemaMissingMessage();
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
            <h1 className="mobile-section-title">Importa costi</h1>
            <p className="mobile-section-subtitle">
              Seleziona la commessa, carica il file partitario `.xls` o `.xlsx` e valida lo staging prima della scrittura nei costi actual.
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
                L&apos;import costi è disponibile solo dopo sblocco dell&apos;area admin con la password aggiuntiva.
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
            <AdminFunctionsNav current="import-costi" />
            {schemaWarning ? <div className="admin-note">{schemaWarning}</div> : null}
            <CostImportPanel jobOrders={jobOrders} recentSessions={recentSessions} />
          </>
        )}
      </section>
    </div>
  );
}
