import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { prisma } from "@/lib/prisma";
import { JobOrderImportPlaceholder } from "@/components/admin/job-order-import-placeholder";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../accessi/actions";

export default async function AdminImportCostiPage() {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  const jobOrders = hasElevatedAccess
    ? await prisma.jobOrder.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          type: true,
          status: true,
        },
      })
    : [];

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Importa costi</h1>
            <p className="mobile-section-subtitle">
              Seleziona la commessa su cui agganciare il futuro import dei costi actual.
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
            <JobOrderImportPlaceholder
              title="Import costi actual"
              description="Questa funzione conterrà il caricamento dei costi su una specifica commessa."
              ctaLabel="Importa costi"
              jobOrders={jobOrders}
            />
          </>
        )}
      </section>
    </div>
  );
}
