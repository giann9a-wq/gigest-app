import { AccessRequestStatus } from "@prisma/client";
import { redirect } from "next/navigation";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import { prisma } from "@/lib/prisma";
import {
  approveAccessRequestAction,
  lockAdminPanelAction,
  rejectAccessRequestAction,
  unlockAdminPanelAction,
} from "./actions";

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

export default async function AdminAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ feedback?: string; feedbackType?: string }>;
}) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const feedback = params.feedback ? decodeURIComponent(params.feedback) : "";
  const feedbackType = params.feedbackType === "error" ? "error" : "success";

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);

  const [pendingRequests, recentRequests] = hasElevatedAccess
    ? await Promise.all([
        prisma.accessRequest.findMany({
          where: { status: AccessRequestStatus.PENDING },
          orderBy: { requestedAt: "asc" },
        }),
        prisma.accessRequest.findMany({
          where: {
            status: {
              in: [AccessRequestStatus.APPROVED, AccessRequestStatus.REJECTED],
            },
          },
          orderBy: { handledAt: "desc" },
          take: 8,
          include: {
            handledBy: {
              select: {
                email: true,
              },
            },
          },
        }),
      ])
    : [[], []];

  const approvedCount = hasElevatedAccess
    ? await prisma.accessRequest.count({
        where: { status: AccessRequestStatus.APPROVED },
      })
    : 0;

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Gestione accessi Google</h1>
            <p className="mobile-section-subtitle">
              Solo gli admin possono approvare gli account che hanno richiesto accesso tramite Google.
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

        {feedback ? (
          <div className={feedbackType === "error" ? "scad-error" : "scad-success"}>{feedback}</div>
        ) : null}

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
                Dopo l&apos;accesso con Google, serve anche la password aggiuntiva admin per approvare o rifiutare richieste.
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
              <strong>Come funziona</strong>
              <p className="muted" style={{ marginBottom: 0 }}>
                Quando un utente prova ad accedere con Google e non e ancora autorizzato, la sua email viene salvata in
                <code> AccessRequest </code>.
                Da qui l&apos;admin puo approvare e attivare il relativo account applicativo.
              </p>
            </div>
          </div>
        ) : (
          <>
            <AdminFunctionsNav current="accessi" />

            <div className="admin-stat-grid">
              <article className="card admin-stat-card">
                <span className="admin-stat-label">In Attesa</span>
                <strong className="admin-stat-value">{pendingRequests.length}</strong>
              </article>
              <article className="card admin-stat-card">
                <span className="admin-stat-label">Approvate</span>
                <strong className="admin-stat-value">{approvedCount}</strong>
              </article>
              <article className="card admin-stat-card">
                <span className="admin-stat-label">Admin Attivo</span>
                <strong className="admin-stat-value">{adminUser.email}</strong>
              </article>
            </div>

            <div className="admin-grid">
              <section className="card">
                <div className="mobile-section-header">
                  <div>
                    <h2 style={{ margin: 0 }}>Richieste pendenti</h2>
                    <p className="mobile-section-subtitle">
                      Approvando viene creato o attivato l&apos;utente applicativo con ruolo operatore.
                    </p>
                  </div>
                </div>

                {pendingRequests.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Nessuna richiesta in attesa.
                  </p>
                ) : (
                  <div className="admin-request-list">
                    {pendingRequests.map((request) => (
                      <article key={request.id} className="card admin-request-card">
                        <div className="admin-request-head">
                          <div>
                            <strong>{request.firstName || request.lastName ? `${request.firstName ?? ""} ${request.lastName ?? ""}`.trim() : request.email}</strong>
                            <div className="admin-request-meta">
                              <span>{request.email}</span>
                              <span>Richiesta: {formatDateTime(request.requestedAt)}</span>
                            </div>
                          </div>
                          <span className="admin-request-badge">PENDING</span>
                        </div>

                        {request.notes ? <div className="admin-note">{request.notes}</div> : null}

                        <div className="admin-request-actions">
                          <form action={approveAccessRequestAction}>
                            <input type="hidden" name="accessRequestId" value={request.id} />
                            <button type="submit" className="button">
                              Approva
                            </button>
                          </form>
                          <form action={rejectAccessRequestAction}>
                            <input type="hidden" name="accessRequestId" value={request.id} />
                            <button type="submit" className="mobile-button-secondary">
                              Rifiuta
                            </button>
                          </form>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="card">
                <div className="mobile-section-header">
                  <div>
                    <h2 style={{ margin: 0 }}>Storico recente</h2>
                    <p className="mobile-section-subtitle">
                      Ultime richieste gia gestite.
                    </p>
                  </div>
                </div>

                {recentRequests.length === 0 ? (
                  <p className="muted" style={{ margin: 0 }}>
                    Nessuna richiesta gestita finora.
                  </p>
                ) : (
                  <div className="admin-request-list">
                    {recentRequests.map((request) => (
                      <article key={request.id} className="card admin-request-card">
                        <div className="admin-request-head">
                          <div>
                            <strong>{request.email}</strong>
                            <div className="admin-request-meta">
                              <span>{request.status}</span>
                              <span>Gestita: {request.handledAt ? formatDateTime(request.handledAt) : "-"}</span>
                            </div>
                          </div>
                          <span className="admin-request-badge">{request.status}</span>
                        </div>

                        <div className="admin-request-meta">
                          <span>Richiedente: {request.firstName || request.lastName ? `${request.firstName ?? ""} ${request.lastName ?? ""}`.trim() : "N/D"}</span>
                          <span>Gestita da: {request.handledBy?.email ?? "N/D"}</span>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
