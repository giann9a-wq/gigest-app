"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { JobOrderTabs } from "@/components/layout/job-order-tabs";
import type { JobOrderDashboardResponse } from "@/components/dashboard/job-dashboard-view";
import { formatCurrency, formatPercent, formatQuantity } from "@/lib/number-format";

async function safeJsonFetch<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data as T;
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function jobTypeLabel(type: JobOrderDashboardResponse["jobOrder"]["type"]) {
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
      return "Festivita nazionale";
    case "OTHER":
      return "Altro";
  }
}

function getCostCategories(row: JobOrderDashboardResponse) {
  return [
    { label: "Personale", budget: row.budget.personnel, actual: row.actual.personnel },
    { label: "Mezzi e attrezzature", budget: row.budget.equipment, actual: row.actual.equipment },
    { label: "Materie prime", budget: row.budget.materials, actual: row.actual.materials },
    { label: "Prestazioni professionali", budget: row.budget.professionalServices, actual: row.actual.professionalServices },
    { label: "Prestazioni terzi", budget: row.budget.thirdPartyServices, actual: row.actual.thirdPartyServices },
    { label: "Spese varie", budget: row.budget.misc, actual: row.actual.misc },
  ];
}

type OverviewSortKey = "revenueDesc" | "costsDesc" | "marginDesc" | "marginPctDesc" | "nameAsc";

export default function OverviewCommessePage() {
  const [rows, setRows] = useState<JobOrderDashboardResponse[]>([]);
  const [sortKey, setSortKey] = useState<OverviewSortKey>("revenueDesc");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [snoozingId, setSnoozingId] = useState("");

  useEffect(() => {
    async function loadOverview() {
      setLoading(true);
      setError("");

      try {
        const data = await safeJsonFetch<{ rows: JobOrderDashboardResponse[] }>("/api/commesse/overview");
        setRows(Array.isArray(data.rows) ? data.rows : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento overview commesse");
      } finally {
        setLoading(false);
      }
    }

    loadOverview();
  }, []);

  const alertRows = useMemo(
    () =>
      rows.filter((row) => {
        if (row.jobOrder.type !== "SITE" || row.jobOrder.isOwnAccountSite || row.actual.grossMargin >= 0) {
          return false;
        }

        const snoozedUntil = row.jobOrder.negativeMarginAlertSnoozedUntil;
        return !snoozedUntil || new Date(snoozedUntil).getTime() <= Date.now();
      }),
    [rows]
  );

  async function snoozeAlert(jobOrderId: string) {
    setSnoozingId(jobOrderId);
    setError("");

    try {
      const response = await fetch(`/api/commesse/${jobOrderId}/negative-margin-alert/snooze`, {
        method: "POST",
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore nel silenziamento dell'alert");
      }

      setRows((current) =>
        current.map((row) =>
          row.jobOrder.id === jobOrderId
            ? {
                ...row,
                jobOrder: {
                  ...row.jobOrder,
                  negativeMarginAlertSnoozedUntil: data.snoozedUntil,
                },
              }
            : row
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel silenziamento dell'alert");
    } finally {
      setSnoozingId("");
    }
  }

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case "revenueDesc":
          return b.actual.revenue - a.actual.revenue || a.jobOrder.name.localeCompare(b.jobOrder.name, "it");
        case "costsDesc":
          return b.actual.totalCosts - a.actual.totalCosts || a.jobOrder.name.localeCompare(b.jobOrder.name, "it");
        case "marginDesc":
          return b.actual.grossMargin - a.actual.grossMargin || a.jobOrder.name.localeCompare(b.jobOrder.name, "it");
        case "marginPctDesc":
          return b.actual.grossMarginPct - a.actual.grossMarginPct || a.jobOrder.name.localeCompare(b.jobOrder.name, "it");
        case "nameAsc":
          return a.jobOrder.name.localeCompare(b.jobOrder.name, "it");
      }
    });
  }, [rows, sortKey]);

  return (
    <div className="job-dashboard-page job-premium-page">
      <section className="job-premium-shell">
        <JobOrderTabs current="overview" />

        <section className="job-overview-hero">
          <div>
            <p className="job-premium-eyebrow">Gestione Commesse</p>
            <h1>Overview commesse</h1>
            <p>Commesse attive con sintesi economica, operativa e accesso diretto alla dashboard dedicata.</p>
          </div>
          <div className="job-overview-hero-side">
            <div className="job-overview-total-grid" aria-label="Totali overview">
              <div>
                <span>Commesse attive</span>
                <strong>{rows.length}</strong>
              </div>
            </div>
          </div>
          {alertRows.length > 0 ? (
            <div className="job-overview-alert-list" aria-label="Alert cantieri con margine negativo">
              {alertRows.map((row) => (
                <div className="job-overview-alert-row" key={row.jobOrder.id}>
                  <span>
                    <strong>{row.jobOrder.name}</strong>
                    <small aria-hidden="true">-</small>
                    <small>Alert cantiere con margine negativo</small>
                  </span>
                  <button
                    type="button"
                    onClick={() => snoozeAlert(row.jobOrder.id)}
                    disabled={snoozingId === row.jobOrder.id}
                  >
                    {snoozingId === row.jobOrder.id ? "Silenziamento..." : "Silenzia Alert"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        {error ? <div className="job-dashboard-error">{error}</div> : null}
        {loading ? <div className="job-premium-loading">Caricamento overview commesse...</div> : null}

        {!loading && !error && rows.length === 0 ? (
          <div className="job-premium-empty-state">Nessuna commessa attiva disponibile.</div>
        ) : null}

        {!loading && !error && rows.length > 0 ? (
          <div className="job-overview-toolbar">
            <div>
              <strong>Ordina commesse</strong>
              <span>{sortedRows.length} accordion disponibili</span>
            </div>
            <label className="job-premium-select-field">
              <span>Ordinamento</span>
              <select value={sortKey} onChange={(event) => setSortKey(event.target.value as OverviewSortKey)}>
                <option value="revenueDesc">Ricavi actual dal piu alto</option>
                <option value="costsDesc">Costi actual dal piu alto</option>
                <option value="marginDesc">Margine actual dal piu alto</option>
                <option value="marginPctDesc">Margine % dal piu alto</option>
                <option value="nameAsc">Nome commessa A-Z</option>
              </select>
            </label>
          </div>
        ) : null}

        <div className="job-overview-list">
          {sortedRows.map((row) => {
            const personnelHours = row.actual.personnelDetails.reduce((sum, detail) => sum + detail.totalHours, 0);
            const equipmentHours = row.actual.equipmentDetails.reduce((sum, detail) => sum + detail.totalHours, 0);
            const delta = row.actual.totalCosts - row.budget.totalCosts;
            const costProgress = row.budget.totalCosts
              ? Math.min(Math.abs((row.actual.totalCosts / row.budget.totalCosts) * 100), 100)
              : 0;

            return (
              <details key={row.jobOrder.id} className="job-overview-accordion">
                <summary>
                  <span className="job-premium-expand">+</span>
                  <span className="job-overview-title">
                    <strong>
                      {row.jobOrder.type === "SITE" &&
                      !row.jobOrder.isOwnAccountSite &&
                      row.actual.grossMargin < 0 ? (
                        <span
                          className="job-overview-negative-margin-triangle"
                          title="Cantiere con margine negativo"
                          aria-label="Alert: cantiere con margine negativo"
                        >
                          ▲
                        </span>
                      ) : null}
                      {row.jobOrder.name}
                    </strong>
                    <small>{jobTypeLabel(row.jobOrder.type)} - {formatDate(row.jobOrder.startDate)}</small>
                  </span>
                  <span className="job-overview-kpi">
                    <small>Costi actual</small>
                    <strong>{formatCurrency(row.actual.totalCosts)}</strong>
                  </span>
                  <span className="job-overview-kpi">
                    <small>Ricavi actual</small>
                    <strong>{formatCurrency(row.actual.revenue)}</strong>
                  </span>
                  <span className="job-overview-kpi">
                    <small>Margine</small>
                    <strong>{formatCurrency(row.actual.grossMargin)}</strong>
                  </span>
                  <span className="job-overview-kpi">
                    <small>Margine %</small>
                    <strong>{formatPercent(row.actual.grossMarginPct)}</strong>
                  </span>
                </summary>

                <div className="job-overview-body">
                  <div className="job-overview-detail-grid">
                    <div className="job-overview-detail-card">
                      <span>Budget costi</span>
                      <strong>{formatCurrency(row.budget.totalCosts)}</strong>
                      <small>Scostamento actual: {formatCurrency(delta)}</small>
                      <i className="job-overview-progress"><b style={{ width: `${costProgress}%` }} /></i>
                    </div>
                    <div className="job-overview-detail-card">
                      <span>Utilizzo personale</span>
                      <strong>{formatCurrency(row.actual.personnel)}</strong>
                      <small>{formatQuantity(personnelHours, "h")} - {row.actual.personnelDetails.length} risorse</small>
                    </div>
                    <div className="job-overview-detail-card">
                      <span>Utilizzo mezzi</span>
                      <strong>{formatCurrency(row.actual.equipment)}</strong>
                      <small>{formatQuantity(equipmentHours, "h")} - {row.actual.equipmentDetails.length} risorse</small>
                    </div>
                    <div className="job-overview-detail-card">
                      <span>Movimenti</span>
                      <strong>{row.jobOrder.activityCount + row.jobOrder.externalActivityCount}</strong>
                      <small>{row.jobOrder.materialUsageCount} materiali - {row.jobOrder.deliveryNoteUsageCount} bolle</small>
                    </div>
                  </div>

                  <div className="job-overview-breakdown">
                    <div className="job-premium-section-head">
                      <div>
                        <h2>Dettaglio costi</h2>
                        <p>Budget e actual per categoria principale.</p>
                      </div>
                      <Link
                        href={`/dashboard-commessa?jobOrderId=${row.jobOrder.id}` as Route}
                        className="job-premium-secondary-button"
                      >
                        Apri dashboard commessa
                      </Link>
                    </div>

                    <div className="job-premium-table-wrap">
                      <table className="job-premium-summary-table">
                        <thead>
                          <tr>
                            <th>Categoria</th>
                            <th>Budget</th>
                            <th>Actual</th>
                            <th>Delta</th>
                          </tr>
                        </thead>
                        <tbody>
                          {getCostCategories(row).map((category) => (
                            <tr key={category.label}>
                              <td>{category.label}</td>
                              <td>{formatCurrency(category.budget)}</td>
                              <td>{formatCurrency(category.actual)}</td>
                              <td>{formatCurrency(category.actual - category.budget)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
