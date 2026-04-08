"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type JobTypeValue = "SITE" | "TRAINING" | "LEAVE" | "SICKNESS" | "OTHER";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";

type BudgetForm = {
  personnel: string;
  equipment: string;
  materials: string;
  professionalServices: string;
  thirdPartyServices: string;
  misc: string;
  revenue: string;
};

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

type JobOrderForm = {
  name: string;
  type: JobTypeValue;
  startDate: string;
  endDate: string;
  status: ResourceStatusValue;
  description: string;
};

const budgetFields: { key: keyof BudgetForm; label: string }[] = [
  { key: "personnel", label: "Utilizzo Personale" },
  { key: "equipment", label: "Utilizzo Mezzi e Attrezzature" },
  { key: "materials", label: "Materie Prime" },
  { key: "professionalServices", label: "Prestazioni Professionali" },
  { key: "thirdPartyServices", label: "Prestazioni Terzi" },
  { key: "misc", label: "Spese Varie" },
  { key: "revenue", label: "Fatturato Previsto" },
];

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

function formatInputValue(value: number) {
  return value ? value.toFixed(2) : "";
}

function parseAmount(value: string) {
  const normalized = value.trim().replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("it-IT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function SchedaCommessaPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [dashboard, setDashboard] = useState<JobOrderDashboardResponse | null>(null);
  const [jobOrderForm, setJobOrderForm] = useState<JobOrderForm | null>(null);
  const [budget, setBudget] = useState<BudgetForm>({
    personnel: "",
    equipment: "",
    materials: "",
    professionalServices: "",
    thirdPartyServices: "",
    misc: "",
    revenue: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const data = (await safeJsonFetch(`/api/commesse/${params.id}`)) as JobOrderDashboardResponse;
      setDashboard(data);
      setJobOrderForm({
        name: data.jobOrder.name,
        type: data.jobOrder.type,
        startDate: data.jobOrder.startDate,
        endDate: data.jobOrder.endDate,
        status: data.jobOrder.status,
        description: data.jobOrder.description,
      });
      setBudget({
        personnel: formatInputValue(data.budget.personnel),
        equipment: formatInputValue(data.budget.equipment),
        materials: formatInputValue(data.budget.materials),
        professionalServices: formatInputValue(data.budget.professionalServices),
        thirdPartyServices: formatInputValue(data.budget.thirdPartyServices),
        misc: formatInputValue(data.budget.misc),
        revenue: formatInputValue(data.budget.revenue),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento scheda");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [params.id]);

  async function handleSave() {
    if (!dashboard) return;
    if (!jobOrderForm) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      const data = (await safeJsonFetch(`/api/commesse/${params.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: jobOrderForm.name,
          type: jobOrderForm.type,
          startDate: jobOrderForm.startDate,
          status: jobOrderForm.status,
          endDate: jobOrderForm.endDate,
          description: jobOrderForm.description,
          budget,
        }),
      })) as JobOrderDashboardResponse & { success: boolean };

      setDashboard(data);
      setJobOrderForm({
        name: data.jobOrder.name,
        type: data.jobOrder.type,
        startDate: data.jobOrder.startDate,
        endDate: data.jobOrder.endDate,
        status: data.jobOrder.status,
        description: data.jobOrder.description,
      });
      setBudget({
        personnel: formatInputValue(data.budget.personnel),
        equipment: formatInputValue(data.budget.equipment),
        materials: formatInputValue(data.budget.materials),
        professionalServices: formatInputValue(data.budget.professionalServices),
        thirdPartyServices: formatInputValue(data.budget.thirdPartyServices),
        misc: formatInputValue(data.budget.misc),
        revenue: formatInputValue(data.budget.revenue),
      });
      setMessage("Budget commessa salvato correttamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  function setBudgetValue(key: keyof BudgetForm, value: string) {
    setBudget((current) => ({ ...current, [key]: value }));
  }

  if (loading && !dashboard) {
    return <div className="card">Caricamento dashboard commessa...</div>;
  }

  if (!dashboard) {
    return <div className="card">{error || "Commessa non trovata"}</div>;
  }

  if (!jobOrderForm) {
    return <div className="card">Caricamento dati commessa...</div>;
  }

  const budgetPreview = {
    personnel: parseAmount(budget.personnel),
    equipment: parseAmount(budget.equipment),
    materials: parseAmount(budget.materials),
    professionalServices: parseAmount(budget.professionalServices),
    thirdPartyServices: parseAmount(budget.thirdPartyServices),
    misc: parseAmount(budget.misc),
    revenue: parseAmount(budget.revenue),
  };
  const budgetPreviewTotalCosts =
    budgetPreview.personnel +
    budgetPreview.equipment +
    budgetPreview.materials +
    budgetPreview.professionalServices +
    budgetPreview.thirdPartyServices +
    budgetPreview.misc;
  const budgetPreviewMargin = budgetPreview.revenue - budgetPreviewTotalCosts;
  const budgetPreviewMarginPct = budgetPreview.revenue
    ? ((budgetPreview.revenue - budgetPreviewTotalCosts) / budgetPreview.revenue) * 100
    : 0;

  return (
    <div className="job-dashboard-page">
      <section className="card job-dashboard-shell">
        <div className="job-dashboard-topbar">
          <div>
            <p className="job-dashboard-kicker">GiGEST</p>
            <h1 className="job-dashboard-title">Dashboard Commessa</h1>
          </div>
          <button className="button" type="button" onClick={() => router.push("/commesse")}>
            Chiudi
          </button>
        </div>

        {message ? <div className="job-dashboard-success">{message}</div> : null}
        {error ? <div className="job-dashboard-error">{error}</div> : null}

        <div className="job-dashboard-head-grid">
          <div className="job-dashboard-head-item job-dashboard-head-item-wide">
            <span>Commessa</span>
            <input
              className="job-dashboard-head-input"
              value={jobOrderForm.name}
              onChange={(e) =>
                setJobOrderForm((current) => (current ? { ...current, name: e.target.value } : current))
              }
            />
          </div>
          <div className="job-dashboard-head-item">
            <span>Stato Commessa</span>
            <select
              className="job-dashboard-head-input"
              value={jobOrderForm.status}
              onChange={(e) =>
                setJobOrderForm((current) =>
                  current ? { ...current, status: e.target.value as ResourceStatusValue } : current
                )
              }
            >
              <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
              <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
              <option value="ENDED">{statusLabel("ENDED")}</option>
            </select>
          </div>
          <div className="job-dashboard-head-item">
            <span>Tipologia</span>
            <select
              className="job-dashboard-head-input"
              value={jobOrderForm.type}
              onChange={(e) =>
                setJobOrderForm((current) =>
                  current ? { ...current, type: e.target.value as JobTypeValue } : current
                )
              }
            >
              <option value="SITE">{jobTypeLabel("SITE")}</option>
              <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
              <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
              <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
              <option value="OTHER">{jobTypeLabel("OTHER")}</option>
            </select>
          </div>
          <div className="job-dashboard-head-item">
            <span>Data Inizio</span>
            <input
              type="date"
              className="job-dashboard-head-input"
              value={jobOrderForm.startDate}
              onChange={(e) =>
                setJobOrderForm((current) => (current ? { ...current, startDate: e.target.value } : current))
              }
            />
          </div>
          <div className="job-dashboard-head-item">
            <span>Data Fine</span>
            <input
              type="date"
              className="job-dashboard-head-input"
              value={jobOrderForm.endDate}
              onChange={(e) =>
                setJobOrderForm((current) => (current ? { ...current, endDate: e.target.value } : current))
              }
            />
          </div>
          <div className="job-dashboard-head-item job-dashboard-head-item-wide">
            <span>Descrizione</span>
            <textarea
              className="job-dashboard-head-input job-dashboard-head-textarea"
              value={jobOrderForm.description}
              onChange={(e) =>
                setJobOrderForm((current) => (current ? { ...current, description: e.target.value } : current))
              }
            />
          </div>
        </div>

        <div className="job-dashboard-panels">
          <section className="job-dashboard-panel job-dashboard-panel-budget">
            <div className="job-dashboard-panel-head">
              <h2>Budget</h2>
              <strong>{formatCurrency(budgetPreview.revenue)}</strong>
            </div>

            <div className="job-dashboard-line-list">
              {budgetFields.slice(0, 6).map((field) => (
                <label key={field.key} className="job-dashboard-line">
                  <span>{field.label}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={budget[field.key]}
                    onChange={(e) => setBudgetValue(field.key, e.target.value)}
                    className="job-dashboard-amount-input"
                  />
                </label>
              ))}
            </div>

            <div className="job-dashboard-divider" />

            <div className="job-dashboard-summary-list">
              <div className="job-dashboard-summary-row">
                <span>Totale Budget costi</span>
                <strong>{formatCurrency(budgetPreviewTotalCosts)}</strong>
              </div>
              <label className="job-dashboard-summary-row">
                <span>Fatturato Previsto</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budget.revenue}
                  onChange={(e) => setBudgetValue("revenue", e.target.value)}
                  className="job-dashboard-amount-input"
                />
              </label>
              <div className="job-dashboard-summary-row">
                <span>Primo Margine Previsto</span>
                <div className="job-dashboard-summary-values">
                  <strong>{formatCurrency(budgetPreviewMargin)}</strong>
                  <span>{formatPercent(budgetPreviewMarginPct)}</span>
                </div>
              </div>
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
                        <span>
                          {detail.totalHours.toFixed(1)} h · {formatCurrency(detail.totalCost)}
                        </span>
                      </summary>
                      <div className="job-dashboard-entry-list">
                        {detail.entries.map((entry) => (
                          <div key={entry.id} className="job-dashboard-entry-row">
                            <div>
                              <strong>{formatDate(entry.referenceDate)}</strong>
                              <div>{entry.description || "Caricamento diario"}</div>
                            </div>
                            <div>
                              {entry.hours.toFixed(1)} h · {formatCurrency(entry.totalCost)}
                            </div>
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
                        <span>
                          {detail.totalHours.toFixed(1)} h · {formatCurrency(detail.totalCost)}
                        </span>
                      </summary>
                      <div className="job-dashboard-entry-list">
                        {detail.entries.map((entry) => (
                          <div key={entry.id} className="job-dashboard-entry-row">
                            <div>
                              <strong>{formatDate(entry.referenceDate)}</strong>
                              <div>{entry.description || "Caricamento diario"}</div>
                            </div>
                            <div>
                              {entry.hours.toFixed(1)} h · {formatCurrency(entry.totalCost)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))
                )}
              </div>
            </details>

            <div className="job-dashboard-static-line">
              <span>Materie Prime</span>
              <div className="job-dashboard-summary-values">
                <strong>{formatCurrency(dashboard.actual.materials)}</strong>
                <small>{dashboard.actual.importSources.materials}</small>
              </div>
            </div>
            <div className="job-dashboard-static-line">
              <span>Prestazioni Professionali</span>
              <div className="job-dashboard-summary-values">
                <strong>{formatCurrency(dashboard.actual.professionalServices)}</strong>
                <small>{dashboard.actual.importSources.professionalServices}</small>
              </div>
            </div>
            <div className="job-dashboard-static-line">
              <span>Prestazioni Terzi</span>
              <div className="job-dashboard-summary-values">
                <strong>{formatCurrency(dashboard.actual.thirdPartyServices)}</strong>
                <small>{dashboard.actual.importSources.thirdPartyServices}</small>
              </div>
            </div>
            <div className="job-dashboard-static-line">
              <span>Spese Varie</span>
              <div className="job-dashboard-summary-values">
                <strong>{formatCurrency(dashboard.actual.misc)}</strong>
                <small>{dashboard.actual.importSources.misc}</small>
              </div>
            </div>

            <div className="job-dashboard-divider" />

            <div className="job-dashboard-summary-list">
              <div className="job-dashboard-summary-row">
                <span>Totale costi</span>
                <strong>{formatCurrency(dashboard.actual.totalCosts)}</strong>
              </div>
              <div className="job-dashboard-summary-row">
                <span>Fatturato Actual</span>
                <div className="job-dashboard-summary-values">
                  <strong>{formatCurrency(dashboard.actual.revenue)}</strong>
                  <small>{dashboard.actual.importSources.revenue}</small>
                </div>
              </div>
              <div className="job-dashboard-summary-row">
                <span>Primo Margine</span>
                <div className="job-dashboard-summary-values">
                  <strong>{formatCurrency(dashboard.actual.grossMargin)}</strong>
                  <span>{formatPercent(dashboard.actual.grossMarginPct)}</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="job-dashboard-import-note">
          <strong>Sezione import in preparazione.</strong> Le voci actual di materie prime, prestazioni professionali, prestazioni terzi, spese varie e fatturato saranno alimentate da import file dedicato; per ora la dashboard le mostra come sezioni già predisposte.
        </div>

        <div className="job-dashboard-meta-strip">
          <span>Caricamenti collegati: {dashboard.jobOrder.activityCount}</span>
          <span>Creata il: {formatDateTime(dashboard.jobOrder.createdAt)}</span>
          <span>Aggiornata il: {formatDateTime(dashboard.jobOrder.updatedAt)}</span>
        </div>

        <div className="job-dashboard-actions">
          <button className="button" type="button" onClick={() => router.push("/commesse")}>
            Torna a Commesse
          </button>
          <button className="button" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva Budget"}
          </button>
        </div>
      </section>
    </div>
  );
}
