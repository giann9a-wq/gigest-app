"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { PdfViewerModal } from "@/components/pdf-viewer-modal";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/number-format";

export type JobTypeValue =
  | "SITE"
  | "TRAINING"
  | "LEAVE"
  | "SICKNESS"
  | "RAIN"
  | "NATIONAL_HOLIDAY"
  | "OTHER";
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

type ExternalEconomyDetailEntry = {
  id: string;
  referenceDate: string;
  hours: number;
  description: string;
};

type ExternalEconomyDetailGroup = {
  resourceId: string;
  resourceLabel: string;
  totalHours: number;
  entryCount: number;
  entries: ExternalEconomyDetailEntry[];
};

type MaterialUsageDetail = {
  key: string;
  description: string;
  unitOfMeasure: string;
  totalQuantity: number;
  entryCount: number;
  entries: Array<{
    id: string;
    usageDate: string;
    quantity: number;
  }>;
};

type DeliveryNoteUsageDetail = {
  key: string;
  supplier: string;
  entryCount: number;
  entries: Array<{
    id: string;
    usageDate: string;
    description: string;
    documents: Array<{
      id: string;
      fileName: string;
      mimeType: string | null;
      sizeBytes: number | null;
      createdAt: string;
    }>;
  }>;
};

type PdfPreviewState = {
  title: string;
  url: string;
  subtitle?: string;
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
    isOwnAccountSite: boolean;
    negativeMarginAlertSnoozedUntil: string | null;
    startDate: string;
    endDate: string;
    status: ResourceStatusValue;
    description: string;
    activityCount: number;
    externalActivityCount: number;
    materialUsageCount: number;
    deliveryNoteUsageCount: number;
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
    externalEconomyResources: {
      totalHours: number;
      totalEntries: number;
      details: ExternalEconomyDetailGroup[];
    };
    materialUsages: {
      totalEntries: number;
      details: MaterialUsageDetail[];
    };
    deliveryNoteUsages: {
      totalEntries: number;
      details: DeliveryNoteUsageDetail[];
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
    revenueDetails: {
      invoices: {
        totalAmount: number;
        entryCount: number;
        rows: Array<{
          id: string;
          documentDate: string;
          invoiceNumber: string;
          customerCode: string;
          customerName: string;
          netAmount: number;
          vatAmount: number;
          grossAmount: number;
        }>;
      };
      advances: {
        activeAmount: number;
        inactiveAmount: number;
        entryCount: number;
        activeCount: number;
        rows: Array<{
          id: string;
          advanceDate: string;
          description: string;
          amount: number;
          isActive: boolean;
          disabledReason: string;
          disabledAt: string | null;
        }>;
      };
    };
  };
};

type DashboardCategory = {
  key: string;
  label: string;
  budget: number;
  actual: number;
  totalHours?: number;
  groups: Array<{
    key: string;
    name: string;
    entryCount: number;
    totalAmount: number;
    totalHours?: number;
    movements: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      hours?: number;
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
    case "RAIN":
      return "Pioggia";
    case "NATIONAL_HOLIDAY":
      return "Festività Nazionale";
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
      totalHours: dashboard.actual.personnelDetails.reduce((sum, detail) => sum + detail.totalHours, 0),
      groups: dashboard.actual.personnelDetails.map((detail) => ({
        key: detail.resourceId,
        name: detail.resourceLabel,
        entryCount: detail.entries.length,
        totalAmount: detail.totalCost,
        totalHours: detail.totalHours,
        movements: detail.entries.map((entry) => ({
          id: entry.id,
          date: entry.referenceDate,
          description: entry.description || `${formatQuantity(entry.hours, "h")} personale`,
          amount: entry.totalCost,
          hours: entry.hours,
        })),
      })),
    },
    {
      key: "equipment",
      label: "Utilizzo Mezzi e Attrezzature",
      budget: dashboard.budget.equipment,
      actual: dashboard.actual.equipment,
      totalHours: dashboard.actual.equipmentDetails.reduce((sum, detail) => sum + detail.totalHours, 0),
      groups: dashboard.actual.equipmentDetails.map((detail) => ({
        key: detail.resourceId,
        name: detail.resourceLabel,
        entryCount: detail.entries.length,
        totalAmount: detail.totalCost,
        totalHours: detail.totalHours,
        movements: detail.entries.map((entry) => ({
          id: entry.id,
          date: entry.referenceDate,
          description: entry.description || `${formatQuantity(entry.hours, "h")} mezzo`,
          amount: entry.totalCost,
          hours: entry.hours,
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
  const actualCards = [
    { label: "Costi Actual", value: formatCurrency(dashboard.actual.totalCosts) },
    { label: "Fatturato Actual", value: formatCurrency(dashboard.actual.revenue) },
    { label: "Margine Actual", value: formatCurrency(dashboard.actual.grossMargin) },
    { label: "Margine % Actual", value: formatPercent(dashboard.actual.grossMarginPct) },
  ];

  const budgetCards = [
    { label: "Totale Costi Budget", value: formatCurrency(dashboard.budget.totalCosts) },
    { label: "Fatturato Budget", value: formatCurrency(dashboard.budget.revenue) },
    { label: "Margine Previsto", value: formatCurrency(dashboard.budget.grossMargin) },
    { label: "Margine % Previsto", value: formatPercent(dashboard.budget.grossMarginPct) },
  ];

  return (
    <section className="job-premium-kpi-section" aria-label="Indicatori principali">
      <JobKpiSection title="Actual" tone="actual" cards={actualCards} />
      <JobKpiSection title="Budget / Previsione" tone="budget" cards={budgetCards} />
    </section>
  );
}

function JobKpiSection({
  title,
  tone,
  cards,
}: {
  title: string;
  tone: "actual" | "budget";
  cards: Array<{ label: string; value: string }>;
}) {
  return (
    <div className={`job-premium-kpi-group job-premium-kpi-group-${tone}`}>
      <h2>{title}</h2>
      <div className="job-premium-kpi-grid">
        {cards.map((card) => (
          <article key={card.label} className={`job-premium-kpi-card job-premium-kpi-card-${tone}`}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>
    </div>
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
                  {category.totalHours !== undefined ? (
                    <small>{formatQuantity(category.totalHours, "h")}</small>
                  ) : null}
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
                          <small>
                            {group.entryCount} movimenti
                            {group.totalHours !== undefined
                              ? ` · ${formatQuantity(group.totalHours, "h")}`
                              : ""}
                          </small>
                        </span>
                        <span className="job-premium-group-total">
                          {group.totalHours !== undefined ? (
                            <small>{formatQuantity(group.totalHours, "h")}</small>
                          ) : null}
                          <strong>{formatCurrency(group.totalAmount)}</strong>
                        </span>
                      </summary>
                      <div className="job-premium-movement-list">
                        {group.movements.map((movement) => (
                          <div key={movement.id} className="job-premium-movement-row">
                            <span>{formatDate(movement.date)}</span>
                            <p>{movement.description || "Movimento"}</p>
                            {movement.hours !== undefined ? (
                              <span className="job-premium-movement-hours">
                                {formatQuantity(movement.hours, "h")}
                              </span>
                            ) : null}
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

function JobRevenueSummary({ dashboard }: { dashboard: JobOrderDashboardResponse }) {
  const invoices = dashboard.actual.revenueDetails.invoices;
  const advances = dashboard.actual.revenueDetails.advances;
  const revenueRows = [
    ...invoices.rows.map((row) => ({
      id: `invoice-${row.id}`,
      type: "invoice" as const,
      date: row.documentDate,
      title: row.invoiceNumber || "Fattura",
      description: row.customerName || row.customerCode || "-",
      status: "Conteggiata",
      amount: row.netAmount,
    })),
    ...advances.rows.map((row) => ({
      id: `advance-${row.id}`,
      type: "advance" as const,
      date: row.advanceDate,
      title: row.description,
      description: !row.isActive && row.disabledReason ? row.disabledReason : row.isActive ? "Acconto attivo" : "Acconto spento",
      status: row.isActive ? "Conteggiato" : "Spento",
      amount: row.amount,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <section className="job-premium-card">
      <details className="job-premium-diary-accordion job-revenue-accordion">
        <summary>
          <span className="job-premium-expand">+</span>
          <div>
            <span>Ricavi actual</span>
            <h2>Fatture emesse e acconti</h2>
          </div>
          <strong>{formatCurrency(dashboard.actual.revenue)}</strong>
        </summary>

        <div className="job-premium-diary-accordion-content">
          <div className="job-revenue-summary-grid">
            <article>
              <span>Fatture emesse</span>
              <strong>{formatCurrency(invoices.totalAmount)}</strong>
              <small>{invoices.entryCount} fatture</small>
            </article>
            <article>
              <span>Acconti attivi</span>
              <strong>{formatCurrency(advances.activeAmount)}</strong>
              <small>{advances.activeCount} acconti conteggiati</small>
            </article>
            <article>
              <span>Acconti spenti</span>
              <strong>{formatCurrency(advances.inactiveAmount)}</strong>
              <small>Non inclusi nei ricavi actual</small>
            </article>
          </div>

          <div className="job-revenue-ledger-panel">
            <h3>Registro ricavi</h3>
            <div className="job-premium-table-wrap">
              <table className="job-premium-summary-table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Data</th>
                    <th>Documento / Descrizione</th>
                    <th>Stato</th>
                    <th>Importo</th>
                  </tr>
                </thead>
                <tbody>
                  {revenueRows.length === 0 ? (
                    <tr><td colSpan={5}>Nessuna fattura o acconto registrato.</td></tr>
                  ) : (
                    revenueRows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <span className={`job-revenue-type-badge ${row.type === "invoice" ? "is-invoice" : "is-advance"}`}>
                            {row.type === "invoice" ? "Fattura" : "Acconto"}
                          </span>
                        </td>
                        <td>{formatDate(row.date)}</td>
                        <td>
                          <strong>{row.title}</strong>
                          <small>{row.description}</small>
                        </td>
                        <td>{row.status}</td>
                        <td>{formatCurrency(row.amount)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </details>
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

function JobExternalResourcesSummary({ dashboard }: { dashboard: JobOrderDashboardResponse }) {
  const subcontractRows = dashboard.actual.externalResources?.details ?? [];
  const economyRows = dashboard.actual.externalEconomyResources?.details ?? [];

  return (
    <section className="job-premium-card">
      <details className="job-premium-diary-accordion">
        <summary>
          <span className="job-premium-expand">+</span>
          <div>
            <span>Risorse esterne</span>
            <h2>Subappalto ed economia</h2>
          </div>
        </summary>
        <div className="job-premium-diary-accordion-content">
          <div className="job-premium-external-grid">
            <ExternalResourceSummaryTable
              title="Risorse in subappalto"
              emptyText="Nessuna risorsa in subappalto associata alla commessa."
              quantityLabel="Giornate totali"
              rows={subcontractRows.map((row) => ({
                resourceId: row.resourceId,
                resourceLabel: row.resourceLabel,
                entryCount: row.entryCount,
                total: row.totalDays,
              }))}
              total={formatQuantity(dashboard.actual.externalResources?.totalDays ?? 0, "gg")}
              unit="gg"
            />
            <ExternalResourceSummaryTable
              title="Risorse in economia"
              emptyText="Nessuna risorsa in economia associata alla commessa."
              quantityLabel="Ore totali"
              rows={economyRows.map((row) => ({
                resourceId: row.resourceId,
                resourceLabel: row.resourceLabel,
                entryCount: row.entryCount,
                total: row.totalHours,
                entries: row.entries.map((entry) => ({
                  id: entry.id,
                  referenceDate: entry.referenceDate,
                  quantity: entry.hours,
                  description: entry.description,
                })),
              }))}
              total={formatQuantity(dashboard.actual.externalEconomyResources?.totalHours ?? 0, "h")}
              unit="h"
            />
          </div>
        </div>
      </details>
    </section>
  );
}

function JobMaterialsSummary({ dashboard }: { dashboard: JobOrderDashboardResponse }) {
  const rows = dashboard.actual.materialUsages?.details ?? [];
  const totalEntries = dashboard.actual.materialUsages?.totalEntries ?? 0;

  return (
    <section className="job-premium-card">
      <div className="job-premium-section-head">
        <div>
          <span>Diario materiali</span>
          <h2>Materiali utilizzati</h2>
        </div>
        <strong>{totalEntries} movimenti</strong>
      </div>

      <div className="job-premium-table-wrap">
        <table className="job-premium-summary-table job-premium-materials-table">
          <thead>
            <tr>
              <th>Materiale</th>
              <th>Movimenti</th>
              <th>Quantita totale</th>
              <th>Ultimi inserimenti</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4}>Nessun materiale registrato per questa commessa.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.key}>
                  <td><strong>{row.description}</strong></td>
                  <td>{row.entryCount}</td>
                  <td>{formatQuantity(row.totalQuantity, row.unitOfMeasure)}</td>
                  <td>
                    {row.entries.slice(0, 3).map((entry) => (
                      <span key={entry.id} className="job-premium-material-chip">
                        {formatDate(entry.usageDate)} - {formatQuantity(entry.quantity, row.unitOfMeasure)}
                      </span>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function JobDeliveryNotesSummary({
  dashboard,
  onOpenDocument,
}: {
  dashboard: JobOrderDashboardResponse;
  onOpenDocument: (document: { id: string; fileName: string }, subtitle: string) => void;
}) {
  const rows = dashboard.actual.deliveryNoteUsages?.details ?? [];
  const totalEntries = dashboard.actual.deliveryNoteUsages?.totalEntries ?? 0;

  return (
    <section className="job-premium-card">
      <div className="job-premium-section-head">
        <div>
          <span>Diario bolle</span>
          <h2>Bolle di cantiere</h2>
        </div>
        <strong>{totalEntries} movimenti</strong>
      </div>

      <div className="job-premium-supplier-list job-premium-delivery-list">
        {rows.length === 0 ? (
          <p className="job-premium-empty-inline">Nessuna bolla registrata per questa commessa.</p>
        ) : (
          rows.map((row) => (
            <details key={row.key} className="job-premium-supplier-group">
              <summary>
                <span className="job-premium-expand job-premium-expand-small">+</span>
                <span>
                  <strong>{row.supplier}</strong>
                  <small>{row.entryCount} movimenti</small>
                </span>
              </summary>
              <div className="job-premium-movement-list job-premium-delivery-movement-list">
                {row.entries.map((entry) => (
                  <div key={entry.id} className="job-premium-movement-row job-premium-delivery-row">
                    <span>{formatDate(entry.usageDate)}</span>
                    <p>{entry.description || "Senza descrizione"}</p>
                    <div className="job-premium-delivery-actions">
                      {entry.documents.length === 0 ? (
                        <small>Nessun allegato</small>
                      ) : (
                        entry.documents.map((document, index) => (
                          <button
                            key={document.id}
                            type="button"
                            className="job-premium-chip-action"
                            onClick={() => onOpenDocument(document, `${row.supplier} - ${formatDate(entry.usageDate)}`)}
                          >
                            {entry.documents.length > 1 ? `PDF ${index + 1}` : "Apri PDF"}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

function JobDiaryAccordion({
  dashboard,
  onOpenDocument,
}: {
  dashboard: JobOrderDashboardResponse;
  onOpenDocument: (document: { id: string; fileName: string }, subtitle: string) => void;
}) {
  return (
    <section className="job-premium-card">
      <details className="job-premium-diary-accordion">
        <summary>
          <span className="job-premium-expand">+</span>
          <div>
            <span>Diari commessa</span>
            <h2>Materiali e bolle di cantiere</h2>
          </div>
        </summary>
        <div className="job-premium-diary-accordion-content">
          <JobMaterialsSummary dashboard={dashboard} />
          <JobDeliveryNotesSummary dashboard={dashboard} onOpenDocument={onOpenDocument} />
        </div>
      </details>
    </section>
  );
}

function ExternalResourceSummaryTable({
  title,
  emptyText,
  quantityLabel,
  rows,
  total,
  unit,
}: {
  title: string;
  emptyText: string;
  quantityLabel: string;
  rows: Array<{
    resourceId: string;
    resourceLabel: string;
    entryCount: number;
    total: number;
    entries?: Array<{
      id: string;
      referenceDate: string;
      quantity: number;
      description: string;
    }>;
  }>;
  total: string;
  unit: string;
}) {
  const [expandedResourceIds, setExpandedResourceIds] = useState<Set<string>>(new Set());

  function toggleResource(resourceId: string) {
    setExpandedResourceIds((current) => {
      const next = new Set(current);
      if (next.has(resourceId)) {
        next.delete(resourceId);
      } else {
        next.add(resourceId);
      }
      return next;
    });
  }

  return (
    <div className="job-premium-table-wrap">
      <div className="job-premium-external-table-head">
        <strong>{title}</strong>
        <span>{total}</span>
      </div>
      <table className="job-premium-summary-table job-premium-economy-table">
        <thead>
          <tr>
            <th>Risorsa</th>
            <th>Movimenti</th>
            <th>{quantityLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3}>{emptyText}</td>
            </tr>
          ) : (
            rows.map((row) => {
              const canExpand = Boolean(row.entries?.length);
              const isExpanded = expandedResourceIds.has(row.resourceId);

              return (
                <Fragment key={row.resourceId}>
                  <tr>
                    <td>
                      <div className="job-premium-economy-resource-cell">
                        {canExpand ? (
                          <button
                            type="button"
                            className="job-premium-expand job-premium-expand-small job-premium-expand-button"
                            onClick={() => toggleResource(row.resourceId)}
                            aria-expanded={isExpanded}
                            aria-label={`${isExpanded ? "Chiudi" : "Apri"} movimenti ${row.resourceLabel}`}
                          >
                            {isExpanded ? "-" : "+"}
                          </button>
                        ) : null}
                        <strong>{row.resourceLabel}</strong>
                      </div>
                    </td>
                    <td>{row.entryCount}</td>
                    <td>{formatQuantity(row.total, unit)}</td>
                  </tr>
                  {canExpand && isExpanded ? (
                    <tr className="job-premium-economy-detail-row">
                      <td colSpan={3}>
                        <div className="job-premium-movement-list job-premium-economy-movement-list">
                          {row.entries!.map((entry) => (
                            <div key={entry.id} className="job-premium-movement-row job-premium-economy-movement-row">
                              <span>{formatDate(entry.referenceDate)}</span>
                              <p>{entry.description || "Senza descrizione"}</p>
                              <span className="job-premium-movement-hours">
                                {formatQuantity(entry.quantity, unit)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

export function JobDashboardView(props: JobDashboardViewProps) {
  const categories = buildDashboardCategories(props.dashboard);
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);

  return (
    <div className="job-premium-dashboard">
      <JobDashboardHeader {...props} />
      <JobKpiCards dashboard={props.dashboard} />
      <div className="job-premium-chart-grid">
        <JobCostCompositionChart categories={categories} />
      <JobBudgetVsActualChart categories={categories} />
      </div>
      <JobRevenueSummary dashboard={props.dashboard} />
      <JobCostBreakdownAccordion categories={categories} />
      <JobDiaryAccordion
        dashboard={props.dashboard}
        onOpenDocument={(document, subtitle) =>
          setPdfPreview({
            title: document.fileName,
            url: `/api/documentale/bolle/documenti/${document.id}`,
            subtitle,
          })
        }
      />
      <JobExternalResourcesSummary dashboard={props.dashboard} />
      <JobSummaryTable categories={categories} />
      {pdfPreview ? (
        <PdfViewerModal
          title={pdfPreview.title}
          subtitle={pdfPreview.subtitle}
          url={pdfPreview.url}
          onClose={() => setPdfPreview(null)}
        />
      ) : null}
    </div>
  );
}
