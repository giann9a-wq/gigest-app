import { redirect } from "next/navigation";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import {
  ensureAdminPanelCredential,
  hasElevatedAdminPanelAccess,
  requireAdminUser,
} from "@/lib/admin-panel";
import { getHeaderNews } from "@/lib/app-news";
import { lockAdminPanelAction, unlockAdminPanelAction } from "../accessi/actions";
import { saveHeaderNewsAction } from "./actions";

export default async function AdminNewsPage({
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

  const credential = await ensureAdminPanelCredential();
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  const news = hasElevatedAccess ? await getHeaderNews() : null;

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">News</h1>
            <p className="mobile-section-subtitle">
              Configura il banner News mostrato sotto al navigatore oppure spegnilo quando non ci
              sono comunicazioni.
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
              Serve la password aggiuntiva admin per modificare la card News.
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
            <AdminFunctionsNav current="news" />

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

            <div className="admin-news-grid">
              <section className="admin-news-preview">
                <p className="dashboard-kicker">Anteprima</p>
                {news?.enabled ? (
                  <div className="admin-news-preview-card">
                    <span>{news.title}</span>
                    <p>{news.description}</p>
                  </div>
                ) : (
                  <div className="admin-news-disabled-preview">
                    La card News è disattivata e non sarà mostrata nell'app.
                  </div>
                )}
              </section>

              <form action={saveHeaderNewsAction} className="admin-news-form">
                <label className="admin-news-toggle">
                  <input type="checkbox" name="enabled" defaultChecked={news?.enabled} />
                  <span>Mostra la card News</span>
                </label>
                <label>
                  <span>Titolo</span>
                  <input
                    name="title"
                    className="admin-password-input"
                    defaultValue={news?.title}
                    maxLength={64}
                    placeholder="News"
                  />
                </label>
                <label>
                  <span>Breve descrizione</span>
                  <textarea
                    name="description"
                    className="admin-password-input"
                    defaultValue={news?.description}
                    maxLength={240}
                    rows={3}
                    placeholder="Scrivi una comunicazione breve"
                  />
                </label>
                <button type="submit" className="button">
                  Salva News
                </button>
              </form>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
