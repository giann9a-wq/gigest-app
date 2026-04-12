"use client";

import Link from "next/link";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/number-format";

export type JobTypeValue = "SITE" | "TRAINING" | "LEAVE" | "SICKNESS" | "OTHER";
export type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";
export type CostCategoryKey =
  | "MATERIE_PRIME"
  | "PRESTAZIONI_PROFESSIONALI"
  | "PRESTAZIONI_TERZI"
  | "SPESE_VARIE";

export type JobOrderOption = {
  id: string;
  name: string;
  type: JobTypeValue;
  status: ResourceStatusValue;
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

type ExternalDetailEntry = {
  id: string;
  referenceDate: string;
  days: number;
  description: string;
};

type ExternalDetailGroup = {
  resourceId: string;
  resourceLabel: string;
  totalDays: number;
  entryCount: number;
  entries: ExternalDetailEntry[];
};

type ImportedCostMovement = {
  id: string;
  documentDate: string;
  documentNumber?: string;
  description?: string;
  amount: number;
};

export type JobOrderDashboardResponse = {
  jobOrder: {
    id: string;
    name: string;
    type: JobTypeValue;
    startDate: string;
    endDate: string;
    status: ResourceStatusValue;
    description: string;
    activityCount: number;
    externalActivityCount: number;
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
    externalResources: {
      totalDays: number;
      totalEntries: number;
      details: ExternalDetailGroup[];
    };
    importSources: {
      materials: string;
      professionalServices: string;
      thirdPartyServices: string;
      misc: string;
      revenue: string;
    };
    costCategories: Array<{
      key: CostCategoryKey;
      label: string;
      totalAmount: number;
      entryCount: number;
      suppliers: Array<{
        supplierKey: string;
        supplierCode: string;
        supplierName: string;
        totalAmount: number;
        entryCount: number;
        rows: ImportedCostMovement[];
      }>;
    }>;
  };
};

type DashboardCategory = {
  key: string;
  label: string;
  budget: number;
  actual: number;
  groups: Array<{
    key: string;
    name: string;
    entryCount: number;
    totalAmount: number;
    movements: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
    }>;
  }>;
};

type JobDashboardViewProps = {
  dashboard: JobOrderDashboardResponse;
  jobOrders: JobOrderOption[];
  selectedJobOrderId: string;
  loading: boolean;
  onJobOrderChange: (jobOrderId: string) => void;
};

const chartColors = ["#F97316", "#0EA5E9", "#16A34A", "#A855F7", "#EAB308", "#DC2626"];

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

function semanticClass(value: number, zeroClass = "neutral") {
  if (value > 0) return "positive";
  if (value < 0) return "negative";
  return zeroClass;
}

function toDeltaPercent(actual: number, budget: number) {
  if (!budget) return null;
  return ((actual - budget) / Math.abs(budget)) * 100;
}

function categorySourceLabel(key: CostCategoryKey, dashboard: JobOrderDashboardResponse) {
  switch (key) {
    case "MATERIE_PRIME":
      return dashboard.actual.importSources.materials;
    case "PRESTAZIONI_PROFESSIONALI":
      return dashboard.actual.importSources.professionalServices;
    case "PRESTAZIONI_TERZI":
      return dashboard.actual.importSources.thirdPartyServices;
    case "SPESE_VARIE":
      return dashboard.actual.importSources.misc;
  }
}

function buildDashboardCategories(dashboard: JobOrderDashboardResponse): DashboardCategory[] {
  const importedCategories = new Map(dashboard.actual.costCategories.map((category) => [category.key, category]));

  return [
    {
      key: "personnel",
      label: "Utilizzo Personale",
      budget: dashboard.budget.personnel,
      actual: dashboard.actual.personnel,
      groups: dashboard.actual.personnelDetails.map((detail) => ({
        key: detail.resourceId,
        name: detail.resourceLabel,
        entryCount: detail.entries.length,
        totalAmount: detail.totalCost,
        movements: detail.entries.map((entry) => ({
          id: entry.id,
          date: entry.referenceDate,
          description: entry.description || `${formatQuantity(entry.hours, "h")} personale`,
          amount: entry.totalCost,
        })),
      })),
    },
    {
      key: "equipment",
      label: "Utilizzo Mezzi e Attrezzature",
      budget: dashboard.budget.equipment,
      actual: dashboard.actual.equipment,
      groups: dashboard.actual.equipmentDetails.map((detail) => ({
        key: detail.resourceId,
        name: detail.resourceLabel,
        entryCount: detail.entries.length,
        totalAmount: detail.totalCost,
        movements: detail.entries.map((entry) => ({
          id: entry.id,
          date: entry.referenceDate,
          description: entry.description || `${formatQuantity(entry.hours, "h")} mezzo`,
          amount: entry.totalCost,
        })),
      })),
    },
    ...(
      [
        ["MATERIE_PRIME", "Materie Prime", dashboard.budget.materials],
        ["PRESTAZIONI_PROFESSIONALI", "Prestazioni Professionali", dashboard.budget.professionalServices],
        ["PRESTAZIONI_TERZI", "Prestazioni Terzi", dashboard.budget.thirdPartyServices],
        ["SPESE_VARIE", "Spese Varie", dashboard.budget.misc],
      ] as const
    ).map(([key, label, budget]) => {
      const importedCategory = importedCategories.get(key);
      return {
        key,
        label,
        budget,
        actual: importedCategory?.totalAmount ?? 0,
        groups:
          importedCategory?.suppliers.map((supplier) => ({
            key: supplier.supplierKey,
            name: supplier.supplierName || "Fornitore non definito",
            entryCount: supplier.entryCount,
            totalAmount: supplier.totalAmount,
            movements: supplier.rows.map((row) => ({
              id: row.id,
              date: row.documentDate,
              description: row.description || row.documentNumber || categorySourceLabel(key, dashboard) || "Movimento importato",
              amount: row.amount,
            })),
          })) ?? [],
      };
    }),
  ];
}

function JobDashboardHeader({
  dashboard,
  jobOrders,
  selectedJobOrderId,
  loading,
  onJobOrderChange,
}: JobDashboardViewProps) {
  return (
    <section className="job-premium-header">
      <div className="job-premium-header-main">
        <div>
          <p className="job-premium-eyebrow">Controllo di gestione</p>
          <h1>Gestione Commessa</h1>
        </div>
        <label className="job-premium-select-field">
          <span>Commessa</span>
          <select value={selectedJobOrderId} onChange={(event) => onJobOrderChange(event.target.value)} disabled={loading}>
            <option value="">Seleziona una commessa</option>
            {jobOrders.map((jobOrder) => (
              <option key={jobOrder.id} value={jobOrder.id}>
                {jobOrder.name}
              </option>
            ))}
          </select>
        </label>
        <Link href={`/dashboard-commessa/costi?jobOrderId=${selectedJobOrderId}`} className="job-premium-secondary-button">
          Vedi costi
        </Link>
      </div>

      <div className="job-premium-info-grid">
        <div className="job-premium-info-card job-premium-info-card-wide">
          <span>Commessa</span>
          <strong>{dashboard.jobOrder.name}</strong>
          {dashboard.jobOrder.description ? <p>{dashboard.jobOrder.description}</p> : null}
        </div>
        <div className="job-premium-info-card">
          <span>Stato</span>
          <strong className={`job-premium-status job-premium-status-${dashboard.jobOrder.status.toLowerCase()}`}>
            {statusLabel(dashboard.jobOrder.status)}
          </strong>
        </div>
        <div className="job-premium-info-card">
          <span>Tipologia</span>
          <strong>{jobTypeLabel(dashboard.jobOrder.type)}</strong>
        </div>
        <div className="job-premium-info-card">
          <span>Inizio</span>
          <strong>{formatDate(dashboard.jobOrder.startDate)}</strong>
        </div>
        <div className="job-premium-info-card">
          <span>Fine</span>
          <strong>{formatDate(dashboard.jobOrder.endDate)}</strong>
        </div>
      </div>
    </section>
  );
}

function JobKpiCards({ dashboard }: { dashboard: JobOrderDashboardResponse }) {
  const marginTone = semanticClass(dashboard.actual.grossMargin);
  const expectedMarginTone = semanticClass(dashboard.budget.grossMargin);

  const cards = [
    {
      label: "Actual totale",
      value: formatCurrency(dashboard.actual.totalCosts),
      note: `Fatturato actual ${formatCurrency(dashboard.actual.revenue)}`,
      tone: "neutral",
    },
    {
      label: "Budget totale",
      value: formatCurrency(dashboard.budget.totalCosts),
      note: `Fatturato previsto ${formatCurrency(dashboard.budget.revenue)}`,
      tone: "neutral",
    },
    {
      label: "Margine previsto",
      value: formatCurrency(dashboard.budget.grossMargin),
      note: `Actual ${formatCurrency(dashboard.actual.grossMargin)}`,
      tone: expectedMarginTone,
    },
    {
      label: "Margine %",
      value: formatPercent(dashboard.actual.grossMarginPct),
      note: `Previsto ${formatPercent(dashboard.budget.grossMarginPct)}`,
      tone: marginTone,
    },
  ];

  return (
    <section className="job-premium-kpi-grid" aria-label="Indicatori principali">
      {cards.map((card) => (
        <article key={card.label} className={`job-premium-kpi-card job-premium-kpi-${card.tone}`}>
          <span>{card.label}</span>
          <strong>{card.value}</strong>
          <p>{card.note}</p>
        </article>
      ))}
    </section>
  );
}

function JobCostCompositionChart({ categories }: { categories: DashboardCategory[] }) {
  const positiveCategories = categories.filter((category) => category.actual > 0);
  const total = positiveCategories.reduce((sum, category) => sum + category.actual, 0);
  let current = 0;
  const gradient =
    total > 0
      ? positiveCategories
          .map((category, index) => {
            const start = current;
            const end = current + (category.actual / total) * 100;
            current = end;
            return `${chartColors[index % chartColors.length]} ${start}% ${end}%`;
          })
          .join(", ")
      : "#E5E7EB 0% 100%";

  return (
    <section className="job-premium-chart-card">
      <div className="job-premium-section-head">
        <div>
          <span>Mix costi</span>
          <h2>Composizione costi actual</h2>
        </div>
        <strong>{formatCurrency(total)}</strong>
      </div>

      {total <= 0 ? (
        <div className="job-premium-empty-state">Nessun costo actual disponibile per costruire il grafico.</div>
      ) : (
        <div className="job-premium-donut-layout">
          <div className="job-premium-donut" style={{ background: `conic-gradient(${gradient})` }}>
            <div>
              <span>Totale</span>
              <strong>{formatCurrency(total)}</strong>
            </div>
          </div>
          <div className="job-premium-legend">
            {positiveCategories.map((category, index) => {
              const percentage = total ? (category.actual / total) * 100 : 0;
              return (
                <div key={category.key} className="job-premium-legend-row">
                  <span className="job-premium-legend-dot" style={{ backgroundColor: chartColors[index % chartColors.length] }} />
                  <div>
                    <strong>{category.label}</strong>
                    <small>{formatCurrency(category.actual)} · {formatPercent(percentage)}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

function JobBudgetVsActualChart({ categories }: { categories: DashboardCategory[] }) {
  const maxValue = Math.max(...categories.map((category) => Math.max(category.budget, category.actual)), 0);

  return (
    <section className="job-premium-chart-card">
      <div className="job-premium-section-head">
        <div>
          <span>Confronto</span>
          <h2>Budget vs Actual per categoria</h2>
        </div>
      </div>

      {maxValue <= 0 ? (
        <div className="job-premium-empty-state">Nessun dato economico disponibile per il confronto.</div>
      ) : (
        <div className="job-premium-bar-chart">
          {categories.map((category) => {
            const budgetWidth = maxValue ? Math.max((category.budget / maxValue) * 100, category.budget > 0 ? 2 : 0) : 0;
            const actualWidth = maxValue ? Math.max((category.actual / maxValue) * 100, category.actual > 0 ? 2 : 0) : 0;
            return (
              <div key={category.key} className="job-premium-bar-row">
                <div className="job-premium-bar-label">
                  <strong>{category.label}</strong>
                  <small>{formatCurrency(category.budget)} budget · {formatCurrency(category.actual)} actual</small>
                </div>
                <div className="job-premium-bars">
                  <span className="job-premium-bar job-premium-bar-budget" style={{ width: `${budgetWidth}%` }} />
                  <span className="job-premium-bar job-premium-bar-actual" style={{ width: `${actualWidth}%` }} />
                </div>
              </div>
            );
          })}
          <div className="job-premium-bar-legend">
            <span><i className="job-premium-bar-dot-budget" /> Budget</span>
            <span><i className="job-premium-bar-dot-actual" /> Actual</span>
          </div>
        </div>
      )}
    </section>
  );
}

function JobCostBreakdownAccordion({ categories }: { categories: DashboardCategory[] }) {
  const totalActual = categories.reduce((sum, category) => sum + category.actual, 0);

  return (
    <section className="job-premium-card">
      <div className="job-premium-section-head">
        <div>
          <span>Drill-down</span>
          <h2>Dettaglio costi</h2>
        </div>
        <strong>{formatCurrency(totalActual)}</strong>
      </div>

      <div className="job-premium-breakdown-list">
        {categories.map((category) => {
          const delta = category.actual - category.budget;
          const progress = totalActual ? Math.max(Math.min((category.actual / totalActual) * 100, 100), 0) : 0;
          const deltaTone = category.budget ? (delta > 0 ? "negative" : delta < 0 ? "positive" : "neutral") : "neutral";

          return (
            <details key={category.key} className="job-premium-cost-category">
              <summary>
                <span className="job-premium-expand">+</span>
                <span className="job-premium-category-name">{category.label}</span>
                <span className="job-premium-category-metric">
                  <small>Budget</small>
                  <strong>{formatCurrency(category.budget)}</strong>
                </span>
                <span className="job-premium-category-metric">
                  <small>Actual</small>
                  <strong>{formatCurrency(category.actual)}</strong>
                </span>
                <span className={`job-premium-delta job-premium-delta-${deltaTone}`}>{formatCurrency(delta)}</span>
                <span className="job-premium-mini-progress"><i style={{ width: `${progress}%` }} /></span>
              </summary>

              <div className="job-premium-supplier-list">
                {category.groups.length === 0 ? (
                  <p className="job-premium-empty-inline">Nessun movimento disponibile per questa categoria.</p>
                ) : (
                  category.groups.map((group) => (
                    <details key={group.key} className="job-premium-supplier-group">
                      <summary>
                        <span className="job-premium-expand job-premium-expand-small">+</span>
                        <span>
                          <strong>{group.name}</strong>
                          <small>{group.entryCount} movimenti</small>
                        </span>
                        <strong>{formatCurrency(group.totalAmount)}</strong>
                      </summary>
                      <div className="job-premium-movement-list">
                        {group.movements.map((movement) => (
                          <div key={movement.id} className="job-premium-movement-row">
                            <span>{formatDate(movement.date)}</span>
                            <p>{movement.description || "Movimento"}</p>
                            <strong>{formatCurrency(movement.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    </details>
                  ))
                )}
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}

function JobSummaryTable({ categories }: { categories: DashboardCategory[] }) {
  return (
    <section className="job-premium-card">
      <div className="job-premium-section-head">
        <div>
          <span>Riepilogo</span>
          <h2>Budget, actual e delta</h2>
        </div>
      </div>

      <div className="job-premium-table-wrap">
        <table className="job-premium-summary-table">
          <thead>
            <tr>
              <th>Categoria</th>
              <th>Budget</th>
              <th>Actual</th>
              <th>Delta €</th>
              <th>Delta %</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => {
              const delta = category.actual - category.budget;
              const deltaPercent = toDeltaPercent(category.actual, category.budget);
              const tone = category.budget ? (delta > 0 ? "negative" : delta < 0 ? "positive" : "neutral") : "neutral";

              return (
                <tr key={category.key}>
                  <td><strong>{category.label}</strong></td>
                  <td>{formatCurrency(category.budget)}</td>
                  <td>{formatCurrency(category.actual)}</td>
                  <td className={`job-premium-table-${tone}`}>{formatCurrency(delta)}</td>
                  <td className={`job-premium-table-${tone}`}>
                    {deltaPercent == null ? "n.d." : formatPercent(deltaPercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function JobDashboardView(props: JobDashboardViewProps) {
  const categories = buildDashboardCategories(props.dashboard);

  return (
    <div className="job-premium-dashboard">
      <JobDashboardHeader {...props} />
      <JobKpiCards dashboard={props.dashboard} />
      <div className="job-premium-chart-grid">
        <JobCostCompositionChart categories={categories} />
        <JobBudgetVsActualChart categories={categories} />
      </div>
      <JobCostBreakdownAccordion categories={categories} />
      <JobSummaryTable categories={categories} />
    </div>
  );
}
