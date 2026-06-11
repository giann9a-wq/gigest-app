"use client";

import { useEffect, useMemo, useState } from "react";
import { ResourceTabs } from "@/components/layout/resource-tabs";

type ResourceType = "PERSON" | "EQUIPMENT";
type ResourceTypeFilter = "ALL" | ResourceType;

type ResourceOption = {
  value: string;
  label: string;
  type: ResourceType;
  status: string;
};

type JobOrderOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type JobOrderDistributionRow = {
  jobOrderId: string;
  jobOrderName: string;
  hours: number;
  cost: number;
  percentage: number;
};

type MonthlyDistributionRow = {
  monthIndex: number;
  monthLabel: string;
  jobOrderId: string;
  jobOrderName: string;
  hours: number;
  cost: number;
  percentage: number;
};

type MonthBucket = {
  monthIndex: number;
  monthLabel: string;
  totalHours: number;
  rows: MonthlyDistributionRow[];
};

type DashboardRow = {
  resourceValue: string;
  resourceId: string;
  resourceLabel: string;
  resourceType: ResourceType;
  resourceTypeLabel: string;
  totalHours: number;
  totalCost: number;
  prevalentJobOrder: string;
  prevalentJobOrderPercentage: number;
  jobOrderCount: number;
  lastLoading: string;
  detail: {
    kpi: {
      totalHours: number;
      totalCost: number;
      jobOrderCount: number;
      busiestMonth: string;
      prevalentJobOrder: string;
    };
    jobOrders: JobOrderDistributionRow[];
    months: MonthBucket[];
    monthlyRows: MonthlyDistributionRow[];
  };
};

type DashboardResponse = {
  rows: DashboardRow[];
  options: {
    resources: ResourceOption[];
    jobOrders: JobOrderOption[];
  };
};

const CHART_COLORS = [
  "#ea580c",
  "#2563eb",
  "#16a34a",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
  "#be123c",
  "#0f766e",
];

const GROUP_LABELS: Record<ResourceType, string> = {
  PERSON: "Personale",
  EQUIPMENT: "Mezzi",
};

async function safeJsonFetch(url: string) {
  const response = await fetch(url);
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

function formatItalianNumber(value: number, maxDecimals: number, minDecimals = 0) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "-";

  const fixed = numericValue.toFixed(maxDecimals);
  const [integerPart = "0", decimalPart = ""] = fixed.split(".");
  const trimmedDecimal = decimalPart.replace(/0+$/, "");
  const visibleDecimal =
    maxDecimals === minDecimals ? decimalPart : trimmedDecimal.padEnd(minDecimals, "0").slice(0, maxDecimals);
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return visibleDecimal ? `${groupedInteger},${visibleDecimal}` : groupedInteger;
}

function formatHours(value: number) {
  return formatItalianNumber(value, 1);
}

function formatCurrency(value: number) {
  return `\u20ac ${formatItalianNumber(value, 2, 2)}`;
}

function formatInteger(value: number) {
  return formatItalianNumber(value, 0);
}

function formatPercent(value: number) {
  return `${formatItalianNumber(value, 1)}%`;
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function colorForJobOrder(jobOrderId: string) {
  let hash = 0;
  for (const char of jobOrderId) {
    hash = (hash * 31 + char.charCodeAt(0)) % CHART_COLORS.length;
  }
  return CHART_COLORS[Math.abs(hash) % CHART_COLORS.length];
}

export default function DashboardCaricamentiPage() {
  const [year, setYear] = useState(String(getCurrentYear()));
  const [resourceType, setResourceType] = useState<ResourceTypeFilter>("ALL");
  const [resourceValue, setResourceValue] = useState("");
  const [jobOrderId, setJobOrderId] = useState("");
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [selectedRow, setSelectedRow] = useState<DashboardRow | null>(null);
  const [expandedResources, setExpandedResources] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<ResourceType>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const filteredResources = useMemo(() => {
    if (resourceType === "ALL") return resources;
    return resources.filter((resource) => resource.type === resourceType);
  }, [resources, resourceType]);

  useEffect(() => {
    if (resourceValue && !filteredResources.some((resource) => resource.value === resourceValue)) {
      setResourceValue("");
    }
  }, [filteredResources, resourceValue]);

  async function loadDashboard() {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      year,
      resourceType,
      includeEmpty: String(includeEmpty),
    });
    if (resourceValue) params.set("resourceValue", resourceValue);
    if (jobOrderId) params.set("jobOrderId", jobOrderId);

    try {
      const data = (await safeJsonFetch(`/api/caricamenti/dashboard?${params.toString()}`)) as DashboardResponse;
      setRows(data.rows ?? []);
      setResources(data.options?.resources ?? []);
      setJobOrders(data.options?.jobOrders ?? []);
      setExpandedResources((current) => {
        const available = new Set((data.rows ?? []).map((row) => row.resourceValue));
        const next = new Set<string>();
        current.forEach((value) => {
          if (available.has(value)) next.add(value);
        });
        return next;
      });
      setSelectedRow((current) =>
        current ? (data.rows ?? []).find((row) => row.resourceValue === current.resourceValue) ?? null : null
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore caricamento dashboard");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, []);

  function exportExcel() {
    const params = new URLSearchParams({
      year,
      resourceType,
      includeEmpty: String(includeEmpty),
    });
    if (resourceValue) params.set("resourceValue", resourceValue);
    if (jobOrderId) params.set("jobOrderId", jobOrderId);
    window.location.href = `/api/caricamenti/dashboard/export?${params.toString()}`;
  }

  function toggleResource(resourceKey: string) {
    setExpandedResources((current) => {
      const next = new Set(current);
      if (next.has(resourceKey)) {
        next.delete(resourceKey);
      } else {
        next.add(resourceKey);
      }
      return next;
    });
  }

  function toggleGroup(groupKey: ResourceType) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  }

  const groupedRows = useMemo(() => {
    const groups = (["PERSON", "EQUIPMENT"] as ResourceType[]).map((type) => {
      const groupRows = rows
        .filter((row) => row.resourceType === type)
        .sort((a, b) => b.totalCost - a.totalCost || a.resourceLabel.localeCompare(b.resourceLabel, "it"));
      return {
        type,
        label: GROUP_LABELS[type],
        rows: groupRows,
        totalHours: groupRows.reduce((sum, row) => sum + row.totalHours, 0),
        totalCost: groupRows.reduce((sum, row) => sum + row.totalCost, 0),
        jobOrderCount: new Set(groupRows.flatMap((row) => row.detail.jobOrders.map((jobOrder) => jobOrder.jobOrderId))).size,
      };
    });

    return groups.filter((group) => resourceType === "ALL" || group.type === resourceType);
  }, [resourceType, rows]);

  const globalMaxMonthlyHours = useMemo(() => {
    return Math.max(0, ...rows.flatMap((row) => row.detail.months.map((month) => month.totalHours)));
  }, [rows]);

  const selectedJobOrderColors = useMemo(() => {
    const colorMap = new Map<string, string>();
    selectedRow?.detail.jobOrders.forEach((jobOrder, index) => {
      colorMap.set(jobOrder.jobOrderId, CHART_COLORS[index % CHART_COLORS.length]);
    });
    return colorMap;
  }, [selectedRow]);

  const selectedLegend = selectedRow
    ? selectedRow.detail.jobOrders.map((jobOrder) => ({
        id: jobOrder.jobOrderId,
        label: jobOrder.jobOrderName,
        color: selectedJobOrderColors.get(jobOrder.jobOrderId) ?? colorForJobOrder(jobOrder.jobOrderId),
    }))
    : [];

  return (
    <div className="grid gap-4">
      <div className="card loading-dashboard-page">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Dashboard Caricamenti</h1>
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Riepilogo annuale dei caricamenti per personale e mezzi.
            </p>
          </div>
        </div>

        <ResourceTabs current="loadings-dashboard" />

        <div className="stats-filter-bar loading-dashboard-filters" style={{ marginTop: 20 }}>
          <label className="report-control loading-dashboard-year">
            <span>Anno</span>
            <input type="number" min="2000" max="2100" value={year} onChange={(event) => setYear(event.target.value)} />
          </label>

          <label className="report-control">
            <span>Tipo risorsa</span>
            <select value={resourceType} onChange={(event) => setResourceType(event.target.value as ResourceTypeFilter)}>
              <option value="ALL">Tutte</option>
              <option value="PERSON">Personale</option>
              <option value="EQUIPMENT">Mezzi</option>
            </select>
          </label>

          <label className="report-control loading-dashboard-resource">
            <span>Risorsa</span>
            <select value={resourceValue} onChange={(event) => setResourceValue(event.target.value)}>
              <option value="">Tutte</option>
              {filteredResources.map((resource) => (
                <option key={resource.value} value={resource.value}>
                  {resource.label}
                </option>
              ))}
            </select>
          </label>

          <label className="report-control loading-dashboard-job">
            <span>Commessa</span>
            <select value={jobOrderId} onChange={(event) => setJobOrderId(event.target.value)}>
              <option value="">Tutte</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </label>

          <label className="loading-dashboard-checkbox">
            <input
              type="checkbox"
              checked={includeEmpty}
              onChange={(event) => setIncludeEmpty(event.target.checked)}
            />
            <span>Mostra risorse senza caricamenti</span>
          </label>

          <button type="button" className="button" onClick={() => void loadDashboard()} disabled={loading}>
            Applica filtri
          </button>

          <button type="button" className="report-print-btn" onClick={exportExcel} disabled={loading}>
            Esporta Excel
          </button>
        </div>

        {error ? <div className="scad-error">{error}</div> : null}

        <div className="scad-table-tools" style={{ marginTop: 18 }}>
          <div className="muted">
            Risorse visibili: <strong>{rows.length}</strong>
          </div>
        </div>

        <div className="loading-dashboard-group-list">
          {loading ? (
            <div className="loading-dashboard-empty">Caricamento dashboard...</div>
          ) : rows.length === 0 ? (
            <div className="loading-dashboard-empty">Nessun caricamento trovato per i filtri selezionati</div>
          ) : (
            groupedRows.map((group) => {
              const isGroupExpanded = expandedGroups.has(group.type);

              return (
                <section key={group.type} className="loading-dashboard-group">
                  <button
                    type="button"
                    className="loading-dashboard-group-summary"
                    aria-expanded={isGroupExpanded}
                    onClick={() => toggleGroup(group.type)}
                  >
                    <span className="loading-dashboard-group-title">
                      <strong>{group.label}</strong>
                      <small>{formatInteger(group.rows.length)} risorse</small>
                    </span>
                    <span className="loading-dashboard-group-stat">
                      <small>Ore totali</small>
                      <strong>{formatHours(group.totalHours)}</strong>
                    </span>
                    <span className="loading-dashboard-group-stat">
                      <small>Costo totale</small>
                      <strong>{formatCurrency(group.totalCost)}</strong>
                    </span>
                    <span className="loading-dashboard-group-stat">
                      <small>Commesse</small>
                      <strong>{formatInteger(group.jobOrderCount)}</strong>
                    </span>
                    <span className="loading-dashboard-chevron">{isGroupExpanded ? "Chiudi" : "Apri"}</span>
                  </button>

                  {isGroupExpanded ? (
                    <div className="loading-dashboard-accordion-list">
                      {group.rows.length === 0 ? (
                        <div className="loading-dashboard-empty">Nessuna risorsa presente</div>
                      ) : (
                        group.rows.map((row) => {
                          const isExpanded = expandedResources.has(row.resourceValue);

                          return (
                            <article key={row.resourceValue} className="loading-dashboard-resource-card">
                              <button
                                type="button"
                                className="loading-dashboard-resource-summary"
                                aria-expanded={isExpanded}
                                onClick={() => toggleResource(row.resourceValue)}
                              >
                                <span className="loading-dashboard-resource-main">
                                  <strong>{row.resourceLabel}</strong>
                                  <small>{row.resourceTypeLabel}</small>
                                </span>
                                <span className="loading-dashboard-summary-stat">
                                  <small>Ore YTD</small>
                                  <strong>{formatHours(row.totalHours)}</strong>
                                </span>
                                <span className="loading-dashboard-summary-stat">
                                  <small>Costo YTD</small>
                                  <strong>{formatCurrency(row.totalCost)}</strong>
                                </span>
                                <span className="loading-dashboard-summary-stat">
                                  <small>Commesse</small>
                                  <strong>{formatInteger(row.jobOrderCount)}</strong>
                                </span>
                                <span className="loading-dashboard-summary-stat">
                                  <small>Ultimo caricamento</small>
                                  <strong>{formatDate(row.lastLoading)}</strong>
                                </span>
                                <span className="loading-dashboard-chevron">{isExpanded ? "Chiudi" : "Apri"}</span>
                              </button>

                              {isExpanded ? (
                                <div className="loading-dashboard-resource-detail">
                                  <div className="loading-dashboard-resource-detail-head">
                                    <div className="muted">
                                      Distribuzione commesse per <strong>{row.resourceLabel}</strong>
                                    </div>
                                    <button
                                      type="button"
                                      className="caricamenti-edit-button"
                                      onClick={() => setSelectedRow(row)}
                                    >
                                      Dettaglio
                                    </button>
                                  </div>

                                  <div className="loading-dashboard-commessa-grid">
                                    {row.detail.jobOrders.length === 0 ? (
                                      <div className="loading-dashboard-empty">Nessuna commessa presente</div>
                                    ) : (
                                      row.detail.jobOrders.map((jobOrder) => (
                                        <div key={jobOrder.jobOrderId} className="loading-dashboard-commessa-card">
                                          <div className="loading-dashboard-commessa-card-head">
                                            <i style={{ backgroundColor: colorForJobOrder(jobOrder.jobOrderId) }} />
                                            <strong>{jobOrder.jobOrderName}</strong>
                                          </div>
                                          <div className="loading-dashboard-commessa-metrics">
                                            <span>
                                              <small>Ore</small>
                                              <strong>{formatHours(jobOrder.hours)}</strong>
                                            </span>
                                            <span>
                                              <small>Costo</small>
                                              <strong>{formatCurrency(jobOrder.cost)}</strong>
                                            </span>
                                            <span>
                                              <small>Allocazione</small>
                                              <strong>{formatPercent(jobOrder.percentage)}</strong>
                                            </span>
                                          </div>
                                          <div className="loading-dashboard-allocation-track">
                                            <span
                                              style={{ width: `${Math.min(100, Math.max(0, jobOrder.percentage))}%` }}
                                            />
                                          </div>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              ) : null}
                            </article>
                          );
                        })
                      )}
                    </div>
                  ) : null}
                </section>
              );
            })
          )}
        </div>
      </div>

      {selectedRow ? (
        <div className="loading-dashboard-modal-backdrop" role="presentation" onClick={() => setSelectedRow(null)}>
          <section
            className="loading-dashboard-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Dettaglio ${selectedRow.resourceLabel}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="loading-dashboard-modal-head">
              <div>
                <p className="dashboard-kicker">Dettaglio risorsa</p>
                <h2>{selectedRow.resourceLabel}</h2>
                <span>{selectedRow.resourceTypeLabel}</span>
              </div>
              <button
                type="button"
                className="icon-action-button"
                aria-label="Chiudi dettaglio"
                title="Chiudi"
                onClick={() => setSelectedRow(null)}
              >
                X
              </button>
            </div>

            <div className="loading-dashboard-kpis">
              <article className="loading-dashboard-kpi">
                <span>Ore totali anno</span>
                <strong>{formatHours(selectedRow.detail.kpi.totalHours)}</strong>
              </article>
              <article className="loading-dashboard-kpi">
                <span>Costo totale anno</span>
                <strong>{formatCurrency(selectedRow.detail.kpi.totalCost)}</strong>
              </article>
              <article className="loading-dashboard-kpi">
                <span>Numero commesse</span>
                <strong>{formatInteger(selectedRow.detail.kpi.jobOrderCount)}</strong>
              </article>
              <article className="loading-dashboard-kpi">
                <span>Mese con piu ore</span>
                <strong>{selectedRow.detail.kpi.busiestMonth}</strong>
              </article>
              <article className="loading-dashboard-kpi">
                <span>Commessa prevalente</span>
                <strong>{selectedRow.detail.kpi.prevalentJobOrder}</strong>
              </article>
            </div>

            <div className="loading-dashboard-detail-grid">
              <section className="loading-dashboard-panel">
                <h3>Distribuzione per commessa</h3>
                <div className="scad-table-wrap">
                  <table className="scad-table loading-dashboard-inner-table">
                    <thead>
                      <tr>
                        <th>Commessa</th>
                        <th>Ore caricate</th>
                        <th>Costo imputato</th>
                        <th>% allocazione</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedRow.detail.jobOrders.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="stats-empty-cell">
                            Nessuna commessa presente
                          </td>
                        </tr>
                      ) : (
                        selectedRow.detail.jobOrders.map((jobOrder) => (
                          <tr key={jobOrder.jobOrderId}>
                            <td>{jobOrder.jobOrderName}</td>
                            <td>{formatHours(jobOrder.hours)}</td>
                            <td>{formatCurrency(jobOrder.cost)}</td>
                            <td>{formatPercent(jobOrder.percentage)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="loading-dashboard-panel">
                <h3>Deep dive mensile</h3>
                <div className="loading-dashboard-legend">
                  {selectedLegend.map((item) => (
                    <span key={item.id}>
                      <i style={{ backgroundColor: item.color }} />
                      {item.label}
                    </span>
                  ))}
                </div>
                <div className="loading-dashboard-chart-head">
                  <span>Scala max globale: {formatHours(globalMaxMonthlyHours)} ore</span>
                </div>
                <div className="loading-dashboard-chart" aria-label="Distribuzione ore mensili per commessa">
                  {selectedRow.detail.months.map((month) => (
                    <div key={month.monthIndex} className="loading-dashboard-chart-month">
                      <div className="loading-dashboard-chart-bar" title={`${month.monthLabel}: ${formatHours(month.totalHours)} ore`}>
                        {month.rows.length === 0 ? (
                          <span className="loading-dashboard-empty-bar" />
                        ) : (
                          month.rows.map((item) => (
                            <span
                              key={`${item.monthIndex}-${item.jobOrderId}`}
                              className="loading-dashboard-chart-segment"
                              style={{
                                height: globalMaxMonthlyHours
                                  ? `${Math.max((item.hours / globalMaxMonthlyHours) * 100, 2)}%`
                                  : "0%",
                                backgroundColor: selectedJobOrderColors.get(item.jobOrderId) ?? colorForJobOrder(item.jobOrderId),
                              }}
                              title={`${month.monthLabel} - ${item.jobOrderName}: ${formatHours(item.hours)} ore`}
                            />
                          ))
                        )}
                      </div>
                      <strong>{month.monthLabel}</strong>
                      <span>{formatHours(month.totalHours)} h</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            <section className="loading-dashboard-panel">
              <h3>Tabella mensile di dettaglio</h3>
              <div className="scad-table-wrap">
                <table className="scad-table loading-dashboard-inner-table">
                  <thead>
                    <tr>
                      <th>Mese</th>
                      <th>Commessa</th>
                      <th>Ore</th>
                      <th>Costo</th>
                      <th>% sul mese</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRow.detail.monthlyRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="stats-empty-cell">
                          Nessun dettaglio mensile presente
                        </td>
                      </tr>
                    ) : (
                      selectedRow.detail.monthlyRows.map((item) => (
                        <tr key={`${item.monthIndex}-${item.jobOrderId}`}>
                          <td>{item.monthLabel}</td>
                          <td>{item.jobOrderName}</td>
                          <td>{formatHours(item.hours)}</td>
                          <td>{formatCurrency(item.cost)}</td>
                          <td>{formatPercent(item.percentage)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      ) : null}
    </div>
  );
}
