import { redirect } from "next/navigation";
import { requireAdminUser, hasElevatedAdminPanelAccess } from "@/lib/admin-panel";
import { AdminFunctionsNav } from "@/components/layout/admin-functions-nav";
import { DiaryReminderControls } from "@/components/admin/diary-reminder-controls";
import { findSupplierLinkSuggestions, listManualSupplierLinkOptions } from "@/lib/admin-supplier-links";
import { getAutoDiaryProposalStatus } from "@/lib/auto-diary-proposals";
import { getLoadingVerificationStatus } from "@/lib/loading-verification";
import { getMonthlyResourceReportSettings } from "@/lib/monthly-automation-settings";
import { prisma } from "@/lib/prisma";
import {
  createNationalHolidayEntriesAction,
  linkExternalSupplierAction,
  saveMonthlyResourceReportRecipientsAction,
  updateAutoDiaryProposalAction,
  validateAutoDiaryProposalsAction,
} from "./actions";

function getEasterMondayIso(year: number) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const date = new Date(Date.UTC(year, month - 1, day + 1));
  return date.toISOString().slice(0, 10);
}

function isWeekendIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekDay = date.getUTCDay();
  return weekDay === 0 || weekDay === 6;
}

function buildItalianNationalHolidays(year: number) {
  return [
    { key: "01-01", date: `${year}-01-01`, label: "Capodanno" },
    { key: "01-06", date: `${year}-01-06`, label: "Epifania" },
    { key: "EASTER_MONDAY", date: getEasterMondayIso(year), label: "Lunedi dell'Angelo" },
    { key: "04-25", date: `${year}-04-25`, label: "Festa della Liberazione" },
    { key: "05-01", date: `${year}-05-01`, label: "Festa del Lavoro" },
    { key: "06-02", date: `${year}-06-02`, label: "Festa della Repubblica" },
    { key: "08-15", date: `${year}-08-15`, label: "Ferragosto" },
    { key: "11-01", date: `${year}-11-01`, label: "Ognissanti" },
    { key: "12-08", date: `${year}-12-08`, label: "Immacolata Concezione" },
    { key: "12-25", date: `${year}-12-25`, label: "Natale" },
    { key: "12-26", date: `${year}-12-26`, label: "Santo Stefano" },
  ].filter((holiday) => !isWeekendIsoDate(holiday.date));
}

export default async function AdminControlliPage({
  searchParams,
}: {
  searchParams?: Promise<{ message?: string; type?: string; holidayYear?: string }>;
}) {
  const adminUser = await requireAdminUser();

  if (!adminUser) {
    redirect("/dashboard");
  }

  const params = (await searchParams) ?? {};
  const feedback = params.message ? decodeURIComponent(params.message) : "";
  const feedbackType = params.type === "error" ? "error" : "success";
  const hasElevatedAccess = await hasElevatedAdminPanelAccess(adminUser.id);
  const [
    supplierLinkSuggestions,
    manualLinkOptions,
    monthlyReportSettings,
    monthlyReportResourceOptions,
    autoDiaryStatus,
    loadingVerificationStatus,
    holidayJobOrders,
  ] = hasElevatedAccess
    ? await Promise.all([
        findSupplierLinkSuggestions(),
        listManualSupplierLinkOptions(),
        getMonthlyResourceReportSettings(),
        prisma.person.findMany({
          where: { status: "ACTIVE" },
          orderBy: { fullName: "asc" },
          select: { id: true, fullName: true },
        }),
        getAutoDiaryProposalStatus(),
        getLoadingVerificationStatus(),
        prisma.jobOrder.findMany({
          where: { status: "ACTIVE" },
          orderBy: [{ type: "asc" }, { name: "asc" }],
          select: { id: true, name: true, type: true },
        }),
      ])
    : [[], { externalResources: [], costSuppliers: [] }, { recipients: [], includedResourceIds: [] }, [], null, null, []];
  const monthlyReportRecipients = monthlyReportSettings.recipients;
  const selectedMonthlyReportResourceIds =
    monthlyReportSettings.includedResourceIds.length > 0
      ? new Set(monthlyReportSettings.includedResourceIds)
      : new Set(monthlyReportResourceOptions.map((resource) => resource.id));
  const parsedHolidayYear = Number(params.holidayYear);
  const currentYear =
    Number.isInteger(parsedHolidayYear) && parsedHolidayYear >= 2000 && parsedHolidayYear <= 2100
      ? parsedHolidayYear
      : new Date().getFullYear();
  const nationalHolidays = buildItalianNationalHolidays(currentYear);
  const defaultHolidayJobOrder =
    holidayJobOrders.find((jobOrder) => jobOrder.type === "NATIONAL_HOLIDAY") ?? holidayJobOrders[0];

  return (
    <div className="admin-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Area Riservata</p>
            <h1 className="mobile-section-title">Controlli</h1>
            <p className="mobile-section-subtitle">
              Controlli giornalieri su compilazione Diario Cantiere e invio promemoria.
            </p>
          </div>
        </div>

        {!hasElevatedAccess ? (
          <div className="admin-note">
            I controlli sono disponibili solo dopo sblocco dell&apos;area admin con la password aggiuntiva.
          </div>
        ) : (
          <>
            <AdminFunctionsNav current="controlli" />
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
            <div className="admin-controls-accordion">
              <DiaryReminderControls />
              {loadingVerificationStatus ? (
                <details className="admin-control-accordion-item">
                  <summary className="admin-control-accordion-summary">
                    <div>
                      <p className="dashboard-kicker">Diario Cantiere</p>
                      <h2 className="mobile-section-title">Verifica Caricamenti</h2>
                      <p className="mobile-section-subtitle">
                        Controllo ore attese fino al giorno precedente per {loadingVerificationStatus.monthLabel}: arancione per giornate incomplete, rosso oltre 10 ore, azzurro per straordinari.
                      </p>
                    </div>
                    <span className="admin-control-accordion-count">
                      {loadingVerificationStatus.issueCount} anomalie
                    </span>
                  </summary>
                  <div className="admin-control-accordion-body">
                    {loadingVerificationStatus.issueCount === 0 ? (
                      <p className="muted">Nessuna differenza rispetto alle ore attese nel mese corrente.</p>
                    ) : (
                      <div className="admin-loading-verification-list">
                        {loadingVerificationStatus.groups.map((group) => (
                          <details key={group.personId} className="admin-loading-verification-card">
                            <summary className="admin-loading-verification-summary">
                              <div>
                                <strong>{group.fullName}</strong>
                                <span className="muted">
                                  Ore attese: {group.expectedHours.toLocaleString("it-IT")}/giorno
                                </span>
                              </div>
                              <span className="admin-control-accordion-count">{group.days.length} giornate</span>
                            </summary>
                            <div className="admin-loading-verification-days">
                              {group.days.map((day) => (
                                <span
                                  key={day.isoDate}
                                  className={`admin-loading-verification-chip admin-loading-verification-chip-${day.status.toLowerCase()}`}
                                >
                                  <strong>{day.label}</strong>
                                  {day.hours.toLocaleString("it-IT")}h
                                </span>
                              ))}
                            </div>
                          </details>
                        ))}
                      </div>
                    )}
                  </div>
                </details>
              ) : null}
              {autoDiaryStatus ? (
                <details className="admin-control-accordion-item">
                  <summary className="admin-control-accordion-summary">
                    <div>
                      <p className="dashboard-kicker">Diario Cantiere</p>
                      <h2 className="mobile-section-title">Autocompilazione Diario</h2>
                      <p className="mobile-section-subtitle">
                        Proposte da validare per {autoDiaryStatus.currentMonthLabel}. Le giornate gia compilate manualmente vengono escluse.
                      </p>
                    </div>
                    <span className="admin-control-accordion-count">
                      {autoDiaryStatus.pendingCount} righe pending
                    </span>
                  </summary>
                  <div className="admin-control-accordion-body">
                    {autoDiaryStatus.pendingCount === 0 ? (
                      <p className="muted">Nessuna proposta di autocompilazione da validare.</p>
                    ) : (
                      <>
                        <form action={validateAutoDiaryProposalsAction} className="admin-diary-controls-actions">
                          <button type="submit" className="button">
                            Valida tutti i record
                          </button>
                        </form>
                        <div className="admin-diary-accordion">
                          {autoDiaryStatus.groups.map((group) => (
                            <details key={group.personId} className="admin-diary-accordion-item">
                              <summary className="admin-diary-accordion-summary">
                                <div className="admin-diary-accordion-title">
                                  <strong>{group.fullName}</strong>
                                  <span className="muted">{group.rows.length} giornate proposte</span>
                                </div>
                                <span className="admin-diary-link">Modifica</span>
                              </summary>
                              <div className="admin-diary-accordion-body">
                                <div className="admin-auto-diary-grid">
                                  {group.rows.map((row) => (
                                    <form key={row.id} action={updateAutoDiaryProposalAction} className="admin-auto-diary-row">
                                      <input type="hidden" name="proposalId" value={row.id} />
                                      <strong>{row.dateIso.split("-").reverse().join("/")}</strong>
                                      <label>
                                        <span>Ore</span>
                                        <input name="hours" type="number" step="0.5" min="0.5" max="24" defaultValue={row.hours} />
                                      </label>
                                      <label>
                                        <span>Commessa</span>
                                        <select name="jobOrderId" defaultValue={row.jobOrderId}>
                                          {autoDiaryStatus.jobOrders.map((jobOrder) => (
                                            <option key={jobOrder.id} value={jobOrder.id}>
                                              {jobOrder.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                      <button type="submit" className="mobile-button-secondary">
                                        Salva modifica
                                      </button>
                                    </form>
                                  ))}
                                </div>
                              </div>
                            </details>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </details>
              ) : null}
              <details className="admin-control-accordion-item">
                <summary className="admin-control-accordion-summary">
                  <div>
                    <p className="dashboard-kicker">Diario Cantiere</p>
                    <h2 className="mobile-section-title">Festivita Nazionale</h2>
                    <p className="mobile-section-subtitle">
                      Inserimento centralizzato sulle risorse attive con una commessa dedicata.
                    </p>
                  </div>
                  <span className="admin-control-accordion-count">
                    {nationalHolidays.length} giorni predefiniti
                  </span>
                </summary>
                <div className="admin-control-accordion-body">
                  <div className="admin-supplier-manual-link">
                    <div>
                      <p className="dashboard-kicker">{currentYear}</p>
                      <h3>Carica festivita su tutte le risorse</h3>
                      <p className="muted">
                        Vengono create ore pari al profilo giornaliero della risorsa. Le festivita che cadono di sabato o domenica non vengono inserite.
                      </p>
                    </div>
                    <form action="/admin/controlli" className="admin-diary-controls-actions">
                      <label>
                        <span>Anno elenco</span>
                        <input type="number" name="holidayYear" min="2000" max="2100" defaultValue={currentYear} />
                      </label>
                      <button type="submit" className="mobile-button-secondary">
                        Aggiorna elenco
                      </button>
                    </form>
                    <form action={createNationalHolidayEntriesAction}>
                      <label>
                        <span>Anno inserimento</span>
                        <input type="number" name="holidayYear" min="2000" max="2100" defaultValue={currentYear} required />
                      </label>
                      <label>
                        <span>Commessa</span>
                        <select name="holidayJobOrderId" required defaultValue={defaultHolidayJobOrder?.id ?? ""}>
                          <option value="">Seleziona commessa</option>
                          {holidayJobOrders.map((jobOrder) => (
                            <option key={jobOrder.id} value={jobOrder.id}>
                              {jobOrder.name} {jobOrder.type === "NATIONAL_HOLIDAY" ? "(Festivita)" : ""}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="admin-monthly-resource-picker">
                        <p className="dashboard-kicker">Giorni predefiniti</p>
                        <div className="admin-monthly-resource-list">
                          {nationalHolidays.map((holiday) => (
                            <label key={holiday.date}>
                              <input type="checkbox" name="holidayKeys" value={holiday.key} defaultChecked />
                              <span>
                                {holiday.date.split("-").reverse().join("/")} - {holiday.label}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <label>
                        <span>Giorni manuali</span>
                        <textarea
                          name="manualHolidayDates"
                          rows={3}
                          placeholder="Aggiungi date in formato YYYY-MM-DD, separate da invio, virgola o punto e virgola"
                        />
                      </label>
                      <button type="submit" className="button">
                        Inserisci festivita
                      </button>
                    </form>
                  </div>
                </div>
              </details>
              <details className="admin-control-accordion-item">
                <summary className="admin-control-accordion-summary">
                  <div>
                    <p className="dashboard-kicker">Automatismi</p>
                    <h2 className="mobile-section-title">Email mensili</h2>
                    <p className="mobile-section-subtitle">
                      Invio stampa risorse ore e reminder di fine mese Diario Cantiere.
                    </p>
                  </div>
                  <span className="admin-control-accordion-count">
                    {monthlyReportRecipients.length} destinatari report
                  </span>
                </summary>
                <div className="admin-control-accordion-body">
                  <div className="admin-supplier-manual-link">
                    <div>
                      <p className="dashboard-kicker">Stampa risorse ore</p>
                      <h3>Destinatari report mensile</h3>
                      <p className="muted">
                        Il primo giorno del mese alle 09:00 viene inviata la stampa PDF del mese precedente. Il testo include anche eventuali giornate incomplete rilevate dai controlli.
                      </p>
                    </div>
                    <form id="monthly-report-settings-form" action={saveMonthlyResourceReportRecipientsAction}>
                      <label>
                        <span>Email destinatari</span>
                        <textarea
                          name="recipients"
                          rows={4}
                          defaultValue={monthlyReportRecipients.join("\n")}
                          placeholder="Una o piu email, separate da invio, virgola o punto e virgola"
                        />
                      </label>
                      <button type="submit" className="button">
                        Salva destinatari
                      </button>
                    </form>
                    <div className="admin-monthly-resource-picker">
                      <p className="dashboard-kicker">Risorse nel PDF</p>
                      <div className="admin-monthly-resource-list">
                        {monthlyReportResourceOptions.map((resource) => (
                          <label key={resource.id}>
                            <input
                              form="monthly-report-settings-form"
                              type="checkbox"
                              name="includedResourceIds"
                              value={resource.id}
                              defaultChecked={selectedMonthlyReportResourceIds.has(resource.id)}
                            />
                            <span>{resource.fullName}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="admin-note">
                    Il reminder di fine mese viene inviato automaticamente l&apos;ultimo giorno lavorativo del mese alle 09:00 a tutte le risorse attive con email promemoria diario configurate nella scheda risorsa.
                  </div>
                </div>
              </details>
              <details className="admin-control-accordion-item">
                <summary className="admin-control-accordion-summary">
                  <div>
                    <p className="dashboard-kicker">Anagrafiche</p>
                    <h2 className="mobile-section-title">Anagrafiche Duplicate</h2>
                    <p className="mobile-section-subtitle">
                      Collega fornitori digitati nel diario con anagrafiche gia presenti nei costi.
                    </p>
                  </div>
                  <span className="admin-control-accordion-count">
                    {supplierLinkSuggestions.length} anagrafiche simili
                  </span>
                </summary>
                <div className="admin-control-accordion-body">
                  <div className="admin-supplier-manual-link">
                    <div>
                      <p className="dashboard-kicker">Collegamento manuale</p>
                      <h3>Collega una voce digitata a un fornitore esistente</h3>
                      <p className="muted">
                        Sostituisce nello storico tutte le righe collegate alla voce manuale scelta.
                      </p>
                    </div>
                    <form action={linkExternalSupplierAction}>
                      <label>
                        <span>Voce manuale diario</span>
                        <select name="externalResourceId" required>
                          <option value="">Seleziona voce digitata</option>
                          {manualLinkOptions.externalResources.map((resource) => (
                            <option key={resource.value} value={resource.value}>
                              {resource.label} ({resource.count})
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Fornitore costi</span>
                        <input
                          name="supplierName"
                          list="admin-cost-supplier-options"
                          placeholder="Cerca fornitore costi"
                          required
                        />
                      </label>
                      <datalist id="admin-cost-supplier-options">
                        {manualLinkOptions.costSuppliers.map((supplier) => (
                          <option key={supplier.value} value={supplier.value} />
                        ))}
                      </datalist>
                      <button type="submit" className="button">
                        Collega manualmente
                      </button>
                    </form>
                  </div>

                  {supplierLinkSuggestions.length === 0 ? (
                    <p className="muted">
                      Nessun fornitore digitato nel diario risulta simile ai fornitori importati nei costi.
                    </p>
                  ) : (
                    <div className="admin-diary-accordion">
                      {supplierLinkSuggestions.map((suggestion) => (
                        <details key={suggestion.externalResourceId} className="admin-diary-accordion-item">
                          <summary className="admin-diary-accordion-summary">
                            <div className="admin-diary-accordion-title">
                              <strong>{suggestion.externalResourceName}</strong>
                              <span className="muted">
                                {suggestion.usageCount} utilizzi nel diario - {suggestion.candidates.length} fornitori simili
                              </span>
                            </div>
                            <span className="admin-diary-link">Apri collegamenti</span>
                          </summary>
                          <div className="admin-diary-accordion-body">
                            <div className="admin-supplier-link-candidates">
                              {suggestion.candidates.map((candidate) => (
                                <form key={candidate.supplierName} action={linkExternalSupplierAction}>
                                  <input type="hidden" name="externalResourceId" value={suggestion.externalResourceId} />
                                  <input type="hidden" name="supplierName" value={candidate.supplierName} />
                                  <span>
                                    {candidate.supplierName}
                                    <small>Costi: {candidate.sourceCount}</small>
                                  </span>
                                  <button type="submit" className="mobile-button-secondary">
                                    Collega e sostituisci
                                  </button>
                                </form>
                              ))}
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </details>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
