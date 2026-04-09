"use client";

import { useEffect, useState } from "react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { formatCurrency, formatPercent } from "@/lib/number-format";

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
      return "Attivo";
    case "SUSPENDED":
      return "Sospeso";
    case "ENDED":
      return "Estinto";
  }
}

function formatInputValue(value: number) {
  return value ? value.toFixed(2) : "";
}

function parseAmount(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return 0;

  const lastComma = trimmed.lastIndexOf(",");
  const lastDot = trimmed.lastIndexOf(".");
  let normalized = trimmed;

  if (lastComma >= 0 && lastDot >= 0) {
    normalized =
      lastComma > lastDot
        ? trimmed.replace(/\./g, "").replace(",", ".")
        : trimmed.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = trimmed.replace(",", ".");
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
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
      setMessage("Scheda commessa salvata correttamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) {
    return <div className="card">Caricamento scheda commessa...</div>;
  }

  if (!dashboard || !jobOrderForm) {
    return <div className="card">{error || "Commessa non trovata"}</div>;
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
  const budgetTotalCosts =
    budgetPreview.personnel +
    budgetPreview.equipment +
    budgetPreview.materials +
    budgetPreview.professionalServices +
    budgetPreview.thirdPartyServices +
    budgetPreview.misc;
  const budgetMargin = budgetPreview.revenue - budgetTotalCosts;
  const budgetMarginPct = budgetPreview.revenue
    ? ((budgetPreview.revenue - budgetTotalCosts) / budgetPreview.revenue) * 100
    : 0;

  return (
    <div className="job-sheet-page">
      <section className="card job-sheet-shell">
        <div className="job-sheet-topbar">
          <div>
            <p className="job-dashboard-kicker">GiGEST</p>
            <h1 className="job-dashboard-title">Scheda Commessa</h1>
          </div>
          <div className="job-sheet-actions">
            <button className="mobile-button-secondary" type="button" onClick={() => router.push("/dashboard-commessa" as Route)}>
              Vai a Dashboard Commessa
            </button>
            <button className="button" type="button" onClick={() => router.push("/commesse")}>
              Chiudi
            </button>
          </div>
        </div>

        {message ? <div className="job-dashboard-success">{message}</div> : null}
        {error ? <div className="job-dashboard-error">{error}</div> : null}

        <div className="job-sheet-grid">
          <div className="job-sheet-panel">
            <h2 className="job-sheet-panel-title">Dati Commessa</h2>
            <div className="job-sheet-form-grid">
              <label className="job-sheet-field job-sheet-field-wide">
                <span>Commessa</span>
                <input className="job-dashboard-head-input" value={jobOrderForm.name} onChange={(e) => setJobOrderForm((current) => current ? { ...current, name: e.target.value } : current)} />
              </label>
              <label className="job-sheet-field">
                <span>Tipologia</span>
                <select className="job-dashboard-head-input" value={jobOrderForm.type} onChange={(e) => setJobOrderForm((current) => current ? { ...current, type: e.target.value as JobTypeValue } : current)}>
                  <option value="SITE">{jobTypeLabel("SITE")}</option>
                  <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
                  <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
                  <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
                  <option value="OTHER">{jobTypeLabel("OTHER")}</option>
                </select>
              </label>
              <label className="job-sheet-field">
                <span>Stato</span>
                <select className="job-dashboard-head-input" value={jobOrderForm.status} onChange={(e) => setJobOrderForm((current) => current ? { ...current, status: e.target.value as ResourceStatusValue } : current)}>
                  <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
                  <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
                  <option value="ENDED">{statusLabel("ENDED")}</option>
                </select>
              </label>
              <label className="job-sheet-field">
                <span>Data Inizio</span>
                <input type="date" className="job-dashboard-head-input" value={jobOrderForm.startDate} onChange={(e) => setJobOrderForm((current) => current ? { ...current, startDate: e.target.value } : current)} />
              </label>
              <label className="job-sheet-field">
                <span>Data Fine</span>
                <input type="date" className="job-dashboard-head-input" value={jobOrderForm.endDate} onChange={(e) => setJobOrderForm((current) => current ? { ...current, endDate: e.target.value } : current)} />
              </label>
              <label className="job-sheet-field job-sheet-field-wide">
                <span>Descrizione</span>
                <textarea className="job-dashboard-head-input job-dashboard-head-textarea" value={jobOrderForm.description} onChange={(e) => setJobOrderForm((current) => current ? { ...current, description: e.target.value } : current)} />
              </label>
            </div>
          </div>

          <div className="job-sheet-panel">
            <h2 className="job-sheet-panel-title">Budget Commessa</h2>
            <div className="job-sheet-budget-list">
              {budgetFields.map((field) => (
                <label key={field.key} className="job-dashboard-line">
                  <span>{field.label}</span>
                  <input type="number" min="0" step="0.01" value={budget[field.key]} onChange={(e) => setBudget((current) => ({ ...current, [field.key]: e.target.value }))} className="job-dashboard-amount-input" />
                </label>
              ))}
            </div>
            <div className="job-dashboard-divider" />
            <div className="job-dashboard-summary-list">
              <div className="job-dashboard-summary-row">
                <span>Totale Budget costi</span>
                <strong>{formatCurrency(budgetTotalCosts)}</strong>
              </div>
              <div className="job-dashboard-summary-row">
                <span>Primo Margine Previsto</span>
                <div className="job-dashboard-summary-values">
                  <strong>{formatCurrency(budgetMargin)}</strong>
                  <span>{formatPercent(budgetMarginPct)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="job-sheet-grid">
          <div className="job-sheet-panel">
            <h2 className="job-sheet-panel-title">Situazione Actual</h2>
            <div className="job-dashboard-summary-list">
              <div className="job-dashboard-summary-row"><span>Utilizzo Personale</span><span className="job-dashboard-value">{formatCurrency(dashboard.actual.personnel)}</span></div>
              <div className="job-dashboard-summary-row"><span>Utilizzo Mezzi e Attrezzature</span><span className="job-dashboard-value">{formatCurrency(dashboard.actual.equipment)}</span></div>
              <div className="job-dashboard-summary-row"><span>Materie Prime</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.materials)}</span><small>{dashboard.actual.importSources.materials}</small></div></div>
              <div className="job-dashboard-summary-row"><span>Prestazioni Professionali</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.professionalServices)}</span><small>{dashboard.actual.importSources.professionalServices}</small></div></div>
              <div className="job-dashboard-summary-row"><span>Prestazioni Terzi</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.thirdPartyServices)}</span><small>{dashboard.actual.importSources.thirdPartyServices}</small></div></div>
              <div className="job-dashboard-summary-row"><span>Spese Varie</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.misc)}</span><small>{dashboard.actual.importSources.misc}</small></div></div>
              <div className="job-dashboard-summary-row"><span>Fatturato Actual</span><div className="job-dashboard-summary-values"><span className="job-dashboard-value">{formatCurrency(dashboard.actual.revenue)}</span><small>{dashboard.actual.importSources.revenue}</small></div></div>
            </div>
          </div>

          <div className="job-sheet-panel">
            <h2 className="job-sheet-panel-title">Riepilogo</h2>
            <div className="job-dashboard-summary-list">
              <div className="job-dashboard-summary-row"><span>Caricamenti collegati</span><span className="job-dashboard-value">{dashboard.jobOrder.activityCount}</span></div>
              <div className="job-dashboard-summary-row job-dashboard-total-row"><span>Totale costi actual</span><strong>{formatCurrency(dashboard.actual.totalCosts)}</strong></div>
              <div className="job-dashboard-summary-row job-dashboard-total-row"><span>Primo margine actual</span><div className="job-dashboard-summary-values"><strong>{formatCurrency(dashboard.actual.grossMargin)}</strong><span>{formatPercent(dashboard.actual.grossMarginPct)}</span></div></div>
              <div className="job-dashboard-summary-row"><span>Creata il</span><span className="job-dashboard-value">{formatDateTime(dashboard.jobOrder.createdAt)}</span></div>
              <div className="job-dashboard-summary-row"><span>Ultimo aggiornamento</span><span className="job-dashboard-value">{formatDateTime(dashboard.jobOrder.updatedAt)}</span></div>
            </div>
          </div>
        </div>

        <div className="job-dashboard-import-note">
          Le voci actual alimentate da import resteranno compilabili dai futuri flussi di import; qui le vedi nel dettaglio della commessa, mentre l’analisi comparativa e il breakdown per risorsa sono nella sezione `Dashboard Commessa`.
        </div>

        <div className="job-dashboard-actions">
          <button className="button" type="button" onClick={() => router.push("/commesse")}>
            Torna a Commesse
          </button>
          <button className="button" type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva Scheda"}
          </button>
        </div>
      </section>
    </div>
  );
}
