import Link from "next/link";
import type { Route } from "next";
import { notFound, redirect } from "next/navigation";
import { InvoiceImportValidation } from "@/components/admin/invoice-import-validation";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import {
  getInvoiceImportSchemaMissingMessage,
  getInvoiceImportSessionDetails,
  isInvoiceImportSchemaMissingError,
} from "@/lib/invoice-import";
import { prisma } from "@/lib/prisma";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../../accessi/actions";

export default async function AdminImportFattureSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  const { sessionId } = await params;

  if (!hasElevatedAccess) {
    return (
      <div className="admin-page">
        <section className="card">
          <div className="mobile-section-header">
            <div>
              <p className="dashboard-kicker">Area Riservata</p>
              <h1 className="mobile-section-title">Validazione import fatture</h1>
              <p className="mobile-section-subtitle">
                Per aprire la sessione di staging devi prima sbloccare l&apos;area admin.
              </p>
            </div>
            <div className="admin-request-actions">
              <Link href={"/admin/import-fatture" as Route} className="mobile-button-secondary">
                Torna all&apos;upload
              </Link>
            </div>
          </div>

          {!credential ? (
            <div className="admin-note">Password admin aggiuntiva non inizializzata.</div>
          ) : (
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
          )}
        </section>
      </div>
    );
  }

  let session = null;
  let schemaWarning = "";

  try {
    session = await getInvoiceImportSessionDetails(sessionId);
  } catch (error) {
    if (isInvoiceImportSchemaMissingError(error)) {
      schemaWarning = getInvoiceImportSchemaMissingMessage();
    } else {
      throw error;
    }
  }

  if (schemaWarning) {
    return (
      <div className="admin-page">
        <section className="card">
          <div className="mobile-section-header">
            <div>
              <p className="dashboard-kicker">Area Riservata</p>
              <h1 className="mobile-section-title">Validazione import fatture</h1>
              <p className="mobile-section-subtitle">{schemaWarning}</p>
            </div>
            <div className="admin-request-actions">
              <Link href={"/admin/import-fatture" as Route} className="mobile-button-secondary">
                Torna all&apos;upload
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!session) {
    notFound();
  }

  const jobOrders = await prisma.jobOrder.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      type: true,
      status: true,
    },
  });

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Validazione import fatture</h1>
            <p className="mobile-section-subtitle">
              Revisiona lo staging del partitario, assegna la commessa corretta a ogni fattura e conferma solo le righe affidabili.
            </p>
          </div>
          <div className="admin-request-actions">
            <Link href={"/admin/import-fatture" as Route} className="mobile-button-secondary">
              Nuovo upload
            </Link>
            <form action={lockAdminPanelAction}>
              <button type="submit" className="mobile-button-secondary">
                Blocca area admin
              </button>
            </form>
          </div>
        </div>
      </section>

      <AdminFunctionsNav current="import-fatture" />
      <InvoiceImportValidation sessionId={session.id} jobOrders={jobOrders} />
    </div>
  );
}
