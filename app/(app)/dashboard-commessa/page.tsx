"use client";

import { useEffect, useState } from "react";

type JobTypeValue = "SITE" | "TRAINING" | "LEAVE" | "SICKNESS" | "OTHER";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";

type ActualDetailEntry = {
  id: string;
  referenceDate: string;
  hours: number;
  hourlyCost: number;
  totalCost: number;
  description: string;
};

type ActualDetailGroup = {
  resourceId: string;
  resourceLabel: string;
  totalHours: number;
  totalCost: number;
  entries: ActualDetailEntry[];
};

type JobOrderDashboardResponse = {
  jobOrder: {
    id: string;
    name: string;
    type: JobTypeValue;
    startDate: string;
    endDate: string;
    status: ResourceStatusValue;
    description: string;
    activityCount: number;
    createdAt: string;
    updatedAt: string;
  };
  budget: {
    personnel: number;
    equipment: number;
    materials: number;
    professionalServices: number;
    thirdPartyServices: number;
    misc: number;
    revenue: number;
    totalCosts: number;
    grossMargin: number;
    grossMarginPct: number;
  };
  actual: {
    personnel: number;
    equipment: number;
    materials: number;
    professionalServices: number;
    thirdPartyServices: number;
    misc: number;
    revenue: number;
    totalCosts: number;
    grossMargin: number;
    grossMarginPct: number;
    personnelDetails: ActualDetailGroup[];
    equipmentDetails: ActualDetailGroup[];
    importSources: {
      materials: string;
      professionalServices: string;
      thirdPartyServices: string;
      misc: string;
      revenue: string;
    };
  };
};

type JobOrderOption = {
  id: string;
  name: string;
  type: JobTypeValue;
  status: ResourceStatusValue;
};

async function safeJsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();

  if (!contentType.includes("application/json")) {
    throw new Error(`Risposta non valida dal server: ${rawText.slice(0, 120)}`);
  }

  const data = JSON.parse(rawText);

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0)} %`;
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function jobTypeLabel(type: JobTypeValue) {
  switch (type) {
    case "SITE":
      return "Cantiere";
    case "TRAINING":
      return "Formazione";
    case "LEAVE":
      return "Ferie";
    case "SICKNESS":
      return "Malattia";
    case "OTHER":
      return "Altro";
  }
}

function statusLabel(status: ResourceStatusValue) {
  switch (status) {
    case "ACTIVE":
      return "Attiva";
    case "SUSPENDED":
      return "Sospesa";
    case "ENDED":
      return "Chiusa";
  }
}

export default function DashboardCommessaPage() {
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState("");
  const [dashboard, setDashboard] = useState<JobOrderDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError("");

      try {
        const data = await safeJsonFetch("/api/commesse");
        const rows = (Array.isArray(data.rows) ? data.rows : []) as JobOrderOption[];
        setJobOrders(rows);
        if (rows[0]?.id) {
          setSelectedJobOrderId(rows[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento commesse");
      } finally {
        setLoading(false);
      }
    }

    loadOptions();
  }, []);

  useEffect(() => {
    if (!selectedJobOrderId) {
      setDashboard(null);
      return;
    }

    async function loadDashboard() {
      setDashboardLoading(true);
      setError("");

      try {
        const data = (await safeJsonFetch(`/api/commesse/${selectedJobOrderId}`)) as JobOrderDashboardResponse;
        setDashboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento dashboard");
      } finally {
        setDashboardLoading(false);
      }
    }

    loadDashboard();
  }, [selectedJobOrderId]);

  return (
    <div className="job-dashboard-page">
      <section className="card job-dashboard-shell">
        <div className="job-dashboard-topbar">
          <div>
            <p className="job-dashboard-kicker">GiGEST</p>
            <h1 className="job-dashboard-title">Dashboard Commessa</h1>
          </div>
        </div>

        <div className="job-dashboard-selector-card">
          <label className="job-sheet-field job-sheet-field-wide">
            <span>Seleziona Commessa</span>
            <select
              className="job-dashboard-head-input"
              value={selectedJobOrderId}
              onChange={(e) => setSelectedJobOrderId(e.target.value)}
              disabled={loading}
            >
              <option value="">Seleziona una commessa</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="job-dashboard-error">{error}</div> : null}

        {dashboardLoading ? <div className="job-dashboard-muted">Caricamento dashboard...</div> : null}

        {!dashboardLoading && dashboard ? (
          <>
            <div className="job-dashboard-head-grid">
              <div className="job-dashboard-head-item job-dashboard-head-item-wide">
                <span>Commessa</span>
                <strong>{dashboard.jobOrder.name}</strong>
              </div>
              <div className="job-dashboard-head-item">
                <span>Stato Commessa</span>
                <strong className={dashboard.jobOrder.status === "ACTIVE" ? "job-dashboard-status-active" : ""}>
                  {statusLabel(dashboard.jobOrder.status)}
                </strong>
              </div>
              <div className="job-dashboard-head-item">
                <span>Tipologia</span>
                <strong>{jobTypeLabel(dashboard.jobOrder.type)}</strong>
              </div>
              <div className="job-dashboard-head-item">
                <span>Data Inizio</span>
                <strong>{formatDate(dashboard.jobOrder.startDate)}</strong>
              </div>
              <div className="job-dashboard-head-item">
                <span>Data Fine</span>
                <strong>{formatDate(dashboard.jobOrder.endDate)}</strong>
              </div>
              <div className="job-dashboard-head-item job-dashboard-head-item-wide">
                <span>Descrizione</span>
                <strong>{dashboard.jobOrder.description || "-"}</strong>
              </div>
            </div>

            <div className="job-dashboard-panels">
              <section className="job-dashboard-panel job-dashboard-panel-budget">
                <div className="job-dashboard-panel-head">
                  <h2>Budget</h2>
                  <strong>{formatCurrency(dashboard.budget.revenue)}</strong>
                </div>
                <div className="job-dashboard-summary-list">
                  <div className="job-dashboard-summary-row"><span>Utilizzo Personale</span><span className="job-dashboard-value">{formatCurrency(dashboard.budget.personnel)}</span></div>
                  <div className="job-dashboard-summary-row"><span>Utilizzo Mezzi e Attrezzature</span><span className="job-dashboard-value">{formatCurrency(dashboard.budget.equipment)}</span></div>
                  <div className="job-dashboard-summary-row"><span>Materie Prime</span><span className="job-dashboard-value">{formatCurrency(dashboard.budget.materials)}</span></div>
                  <div className="job-dashboard-summary-row"><span>Prestazioni Professionali</span><span className="job-dashboard-value">{formatCurrency(dashboard.budget.professionalServices)}</span></div>
                  <div className="job-dashboard-summary-row"><span>Prestazioni Terzi</span><span className="job-dashboard-value">{formatCurrency(dashboard.budget.thirdPartyServices)}</span></div>
                  <div className="job-dashboard-summary-row"><span>Spese Varie</span><span className="job-dashboard-value">{formatCurrency(dashboard.budget.misc)}</span></div>
                  <div className="job-dashboard-divider" />
                  <div className="job-dashboard-summary-row job-dashboard-total-row"><span>Totale Budget costi</span><strong>{formatCurrency(dashboard.budget.totalCosts)}</strong></div>
                  <div className="job-dashboard-summary-row"><span>Fatturato Previsto</span><span className="job-dashboard-value">{formatCurrency(dashboard.budget.revenue)}</span></div>
                  <div className="job-dashboard-summary-row job-dashboard-total-row"><span>Primo Margine Previsto</span><div className="job-dashboard-summary-values"><strong>{formatCurrency(dashboard.budget.grossMargin)}</strong><span>{formatPercent(dashboard.budget.grossMarginPct)}</span></div></div>
                </div>
              </section>

              <section className="job-dashboard-panel job-dashboard-panel-actual">
                <div className="job-dashboard-panel-head">
                  <h2>Actual</h2>
                  <strong>{formatCurrency(dashboard.actual.revenue)}</strong>
                </div>

                <details className="job-dashboard-accordion">
                  <summary>
                    <span className="job-dashboard-plus">+</span>
                    <span>Utilizzo Personale</span>
                    <strong>{formatCurrency(dashboard.actual.personnel)}</strong>
                  </summary>
                  <div className="job-dashboard-detail-list">
                    {dashboard.actual.personnelDetails.length === 0 ? (
                      <p className="job-dashboard-muted">Nessun caricamento personale associato.</p>
                    ) : (
                      dashboard.actual.personnelDetails.map((detail) => (
                        <details key={detail.resourceId} className="job-dashboard-subdetail">
                          <summary>
                            <span>{detail.resourceLabel}</span>
                            <span>{detail.totalHours.toFixed(1)} h · {formatCurrency(detail.totalCost)}</span>
                          </summary>
                          <div className="job-dashboard-entry-list">
                            {detail.entries.map((entry) => (
                              <div key={entry.id} className="job-dashboard-entry-row">
                                <div>
                                  <strong>{formatDate(entry.referenceDate)}</strong>
                                  <div>{entry.description || "Caricamento diario"}</div>
                                </div>
                                <div>{entry.hours.toFixed(1)} h · {formatCurrency(entry.totalCost)}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))
                    )}
                  </div>
                </details>

                <details className="job-dashboard-accordion">
                  <summary>
                    <span className="job-dashboard-plus">+</span>
                    <span>Utilizzo Mezzi e Attrezzature</span>
                    <strong>{formatCurrency(dashboard.actual.equipment)}</strong>
                  </summary>
                  <div className="job-dashboard-detail-list">
                    {dashboard.actual.equipmentDetails.length === 0 ? (
                      <p className="job-dashboard-muted">Nessun caricamento mezzi associato.</p>
                    ) : (
                      dashboard.actual.equipmentDetails.map((detail) => (
                        <details key={detail.resourceId} className="job-dashboard-subdetail">
                          <summary>
                            <span>{detail.resourceLabel}</span>
                            <span>{detail.totalHours.toFixed(1)} h · {formatCurrency(detail.totalCost)}</span>
                          </summary>
                          <div className="job-dashboard-entry-list">
                            {detail.entries.map((entry) => (
                              <div key={entry.id} className="job-dashboard-entry-row">
                                <div>
                                  <strong>{formatDate(entry.referenceDate)}</strong>
                                  <div>{entry.description || "Caricamento diario"}</div>
                                </div>
                                <div>{entry.hours.toFixed(1)} h · {formatCurrency(entry.totalCost)}</div>
                              </div>
                            ))}
                          </div>
                        </details>
                      ))
                    )}
                  </div>
                </details>

                <div className="job-dashboard-static-line"><span>Materie Prime</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.materials)}</span><small>{dashboard.actual.importSources.materials}</small></div></div>
                <div className="job-dashboard-static-line"><span>Prestazioni Professionali</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.professionalServices)}</span><small>{dashboard.actual.importSources.professionalServices}</small></div></div>
                <div className="job-dashboard-static-line"><span>Prestazioni Terzi</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.thirdPartyServices)}</span><small>{dashboard.actual.importSources.thirdPartyServices}</small></div></div>
                <div className="job-dashboard-static-line"><span>Spese Varie</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.misc)}</span><small>{dashboard.actual.importSources.misc}</small></div></div>
                <div className="job-dashboard-divider" />
                <div className="job-dashboard-summary-row job-dashboard-total-row"><span>Totale costi</span><strong>{formatCurrency(dashboard.actual.totalCosts)}</strong></div>
                <div className="job-dashboard-summary-row"><span>Fatturato Actual</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.revenue)}</span><small>{dashboard.actual.importSources.revenue}</small></div></div>
                <div className="job-dashboard-summary-row job-dashboard-total-row"><span>Primo Margine</span><div className="job-dashboard-summary-values"><strong>{formatCurrency(dashboard.actual.grossMargin)}</strong><span>{formatPercent(dashboard.actual.grossMarginPct)}</span></div></div>
              </section>
            </div>
          </>
        ) : null}
      </section>
    </div>
  );
}
