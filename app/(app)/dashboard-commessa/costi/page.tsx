"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatCurrency } from "@/lib/number-format";

type JobOrderOption = {
  id: string;
  name: string;
  type?: string;
  status?: string;
};

type CostCategoryKey =
  | "MATERIE_PRIME"
  | "PRESTAZIONI_PROFESSIONALI"
  | "PRESTAZIONI_TERZI"
  | "SPESE_VARIE";

const CATEGORY_OPTIONS: Array<{ key: CostCategoryKey; label: string }> = [
  { key: "MATERIE_PRIME", label: "Materie Prime" },
  { key: "PRESTAZIONI_PROFESSIONALI", label: "Prestazioni Professionali" },
  { key: "PRESTAZIONI_TERZI", label: "Prestazioni Terzi" },
  { key: "SPESE_VARIE", label: "Spese Varie" },
];

type CostActualViewResponse = {
  jobOrder: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  canReassignCosts?: boolean;
  allJobOrders?: JobOrderOption[];
  categories: Array<{
    key: CostCategoryKey;
    label: string;
    totalAmount: number;
    entryCount: number;
    rows: Array<{
      id: string;
      supplierCode: string;
      supplierName: string;
      documentDate: string;
      documentNumber: string;
      description: string;
      amount: number;
      sourceAccountCode: string;
      sourceAccountDescription: string;
      createdAt: string;
    }>;
  }>;
};

async function jsonFetch<T>(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data as T;
}

async function jsonMutation<T>(url: string, options: RequestInit) {
  const response = await fetch(url, options);
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

export default function DashboardCommessaCostiPage() {
  const searchParams = useSearchParams();
  const initialJobOrderId = searchParams.get("jobOrderId") ?? "";
  const initialDateFrom = searchParams.get("from") ?? "";
  const initialDateTo = searchParams.get("to") ?? "";
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState(initialJobOrderId);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [draftDateFrom, setDraftDateFrom] = useState(initialDateFrom);
  const [draftDateTo, setDraftDateTo] = useState(initialDateTo);
  const [view, setView] = useState<CostActualViewResponse | null>(null);
  const [activeTab, setActiveTab] = useState<CostCategoryKey>("MATERIE_PRIME");
  const [moveCost, setMoveCost] = useState<{
    id: string;
    description: string;
    amount: number;
    targetJobOrderId: string;
    targetCategory: CostCategoryKey;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingCost, setMovingCost] = useState(false);
  const [deletingCostId, setDeletingCostId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const costFilterQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("from", dateFrom);
    if (dateTo) params.set("to", dateTo);
    return params.toString();
  }, [dateFrom, dateTo]);

  function getCostViewUrl(jobOrderId: string) {
    return `/api/commesse/${jobOrderId}/costi${costFilterQuery ? `?${costFilterQuery}` : ""}`;
  }

  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError("");

      try {
        const data = await jsonFetch<{ rows: JobOrderOption[] }>("/api/commesse?dashboardOnly=true");
        setJobOrders(data.rows);
        if (!selectedJobOrderId && data.rows[0]?.id) {
          setSelectedJobOrderId(data.rows[0].id);
        }
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Errore caricando le commesse");
      } finally {
        setLoading(false);
      }
    }

    loadOptions();
  }, []);

  useEffect(() => {
    if (!selectedJobOrderId) {
      setView(null);
      return;
    }

    async function loadView() {
      setLoading(true);
      setError("");

      try {
        const data = await jsonFetch<CostActualViewResponse>(getCostViewUrl(selectedJobOrderId));
        setView(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Errore caricando i costi");
      } finally {
        setLoading(false);
      }
    }

    loadView();
  }, [selectedJobOrderId, costFilterQuery]);

  async function moveCostToJobOrder() {
    if (!view || !moveCost || !moveCost.targetJobOrderId) return;

    setMovingCost(true);
    setError("");
    setMessage("");

    try {
      await jsonMutation<{ success: boolean }>(`/api/commesse/${view.jobOrder.id}/costi`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          costEntryId: moveCost.id,
          targetJobOrderId: moveCost.targetJobOrderId,
          targetCategory: moveCost.targetCategory,
        }),
      });

      setMoveCost(null);
      setMessage("Costo aggiornato correttamente.");
      const data = await jsonFetch<CostActualViewResponse>(getCostViewUrl(view.jobOrder.id));
      setView(data);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Errore modificando la spesa");
    } finally {
      setMovingCost(false);
    }
  }

  async function deleteCost(row: { id: string; description: string; amount: number }) {
    if (!view) return;

    const label = row.description || "questa voce";
    if (!window.confirm(`Eliminare definitivamente ${label} (${formatCurrency(row.amount)})?`)) {
      return;
    }

    setDeletingCostId(row.id);
    setError("");
    setMessage("");

    try {
      await jsonMutation<{ success: boolean }>(
        `/api/commesse/${view.jobOrder.id}/costi?costEntryId=${encodeURIComponent(row.id)}`,
        { method: "DELETE" }
      );
      setMessage("Costo eliminato correttamente.");
      const data = await jsonFetch<CostActualViewResponse>(getCostViewUrl(view.jobOrder.id));
      setView(data);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Errore eliminando la spesa");
    } finally {
      setDeletingCostId("");
    }
  }

  const activeCategory = useMemo(
    () => view?.categories.find((category) => category.key === activeTab) ?? null,
    [activeTab, view]
  );
  const totalCostAmount = useMemo(
    () => view?.categories.reduce((total, category) => total + category.totalAmount, 0) ?? 0,
    [view]
  );
  const canReassignCosts = Boolean(view?.canReassignCosts);
  const reassignJobOrders = view?.allJobOrders ?? [];
  const hasPendingDateFilters = draftDateFrom !== dateFrom || draftDateTo !== dateTo;

  function applyDateFilters() {
    setDateFrom(draftDateFrom);
    setDateTo(draftDateTo);
  }

  function resetDateFilters() {
    setDraftDateFrom("");
    setDraftDateTo("");
    setDateFrom("");
    setDateTo("");
  }

  function exportAllCategories() {
    if (!view) return;
    window.location.href = `/api/commesse/${view.jobOrder.id}/costi/export${
      costFilterQuery ? `?${costFilterQuery}` : ""
    }`;
  }

  return (
    <div className="cost-view-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">GiGEST</p>
            <h1 className="mobile-section-title">Vedi Costi</h1>
            <p className="mobile-section-subtitle">
              Vista compatta dei costi actual validati e importati, separati per categoria.
            </p>
          </div>
          <div className="admin-request-actions">
            <Link
              href={`/dashboard-commessa${selectedJobOrderId ? `?jobOrderId=${selectedJobOrderId}` : ""}` as Route}
              className="mobile-button-secondary"
            >
              Torna alla dashboard
            </Link>
          </div>
        </div>

        <div className="cost-view-toolbar">
          <label className="mobile-data-field">
            <span className="mobile-data-label">Commessa</span>
            <select
              className="mobile-data-select"
              value={selectedJobOrderId}
              onChange={(event) => setSelectedJobOrderId(event.target.value)}
              disabled={loading}
            >
              <option value="">Seleziona commessa</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}{jobOrder.status === "COMPLETED" ? " (Conclusa)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="mobile-data-field">
            <span className="mobile-data-label">Data spesa da</span>
            <input
              className="mobile-data-input"
              type="date"
              value={draftDateFrom}
              onChange={(event) => setDraftDateFrom(event.target.value)}
            />
          </label>
          <label className="mobile-data-field">
            <span className="mobile-data-label">Data spesa a</span>
            <input
              className="mobile-data-input"
              type="date"
              value={draftDateTo}
              onChange={(event) => setDraftDateTo(event.target.value)}
            />
          </label>
          <div className="cost-view-filter-actions">
            <button
              type="button"
              className="button"
              onClick={applyDateFilters}
              disabled={loading || !hasPendingDateFilters}
            >
              Filtra
            </button>
            <button
              type="button"
              className="mobile-button-secondary"
              onClick={resetDateFilters}
              disabled={loading || (!dateFrom && !dateTo && !draftDateFrom && !draftDateTo)}
            >
              Reset date
            </button>
          </div>
        </div>

        {error ? <div className="scad-error">{error}</div> : null}
        {message ? <div className="scad-success">{message}</div> : null}
      </section>

      {view ? (
        <section className="card">
          <div className="cost-view-tabbar">
            {view.categories.map((category) => (
              <button
                key={category.key}
                type="button"
                className={`cost-view-tab ${activeTab === category.key ? "cost-view-tab-active" : ""}`}
                onClick={() => setActiveTab(category.key)}
              >
                <span>{category.label}</span>
                <strong>{formatCurrency(category.totalAmount)}</strong>
              </button>
            ))}
            <div className="cost-view-tab cost-view-total-tab" aria-label="Totale complessivo costi">
              <span>Totale complessivo</span>
              <strong>{formatCurrency(totalCostAmount)}</strong>
            </div>
          </div>

          {activeCategory ? (
            <>
              <div className="mobile-toolbar">
                <div className="muted">
                  <strong>{view.jobOrder.name}</strong> · {activeCategory.entryCount} righe validate
                </div>
                <div className="cost-view-table-actions">
                  <div className="muted">Totale categoria: <strong>{formatCurrency(activeCategory.totalAmount)}</strong></div>
                  <button type="button" className="button" onClick={exportAllCategories}>
                    Esporta Excel
                  </button>
                </div>
              </div>

              <div className="scad-table-wrap">
                <table className="scad-table cost-view-table">
                  <thead>
                    <tr>
                      <th>Fornitore</th>
                      <th>Data</th>
                      <th>Documento</th>
                      <th>Descrizione</th>
                      <th>Conto sorgente</th>
                      <th>Importo</th>
                      {canReassignCosts ? <th>Azioni</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {activeCategory.rows.length === 0 ? (
                      <tr>
                        <td colSpan={canReassignCosts ? 7 : 6} className="stats-empty-cell">
                          Nessun costo validato in questa categoria.
                        </td>
                      </tr>
                    ) : (
                      activeCategory.rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            <strong>{row.supplierCode || "-"}</strong>
                            <div>{row.supplierName || "-"}</div>
                          </td>
                          <td>{formatDate(row.documentDate)}</td>
                          <td>{row.documentNumber || "-"}</td>
                          <td>{row.description || "-"}</td>
                          <td>
                            <strong>{row.sourceAccountCode || "-"}</strong>
                            <div>{row.sourceAccountDescription || "-"}</div>
                          </td>
                          <td>{formatCurrency(row.amount)}</td>
                          {canReassignCosts ? (
                            <td>
                              <div className="cost-view-row-actions">
                                <button
                                  type="button"
                                  className="cost-view-reassign-btn"
                                  onClick={() =>
                                    setMoveCost({
                                      id: row.id,
                                      description: row.description || row.documentNumber || "Spesa",
                                      amount: row.amount,
                                      targetJobOrderId: view.jobOrder.id,
                                      targetCategory: activeCategory.key,
                                    })
                                  }
                                  title="Modifica commessa e tipologia"
                                  aria-label="Modifica commessa e tipologia"
                                  disabled={Boolean(deletingCostId)}
                                >
                                  Modifica
                                </button>
                                <button
                                  type="button"
                                  className="cost-view-delete-btn"
                                  onClick={() => void deleteCost(row)}
                                  disabled={Boolean(deletingCostId)}
                                >
                                  {deletingCostId === row.id ? "Elimino..." : "Elimina"}
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </section>
      ) : null}

      {view && moveCost ? (
        <div className="cost-view-modal-backdrop" role="presentation">
          <div className="cost-view-modal" role="dialog" aria-modal="true" aria-labelledby="move-cost-title">
            <div className="cost-view-modal-head">
              <div>
                <p className="dashboard-kicker">Modifica costo</p>
                <h2 id="move-cost-title">Aggiorna spesa</h2>
              </div>
              <button
                type="button"
                className="cost-view-modal-close"
                onClick={() => setMoveCost(null)}
                aria-label="Chiudi popup"
              >
                x
              </button>
            </div>

            <div className="cost-view-modal-body">
              <div className="cost-view-modal-summary">
                <span>Spesa</span>
                <strong>{moveCost.description}</strong>
                <small>{formatCurrency(moveCost.amount)}</small>
              </div>

              <label className="mobile-data-field">
                <span className="mobile-data-label">Commessa attuale</span>
                <input className="mobile-data-input" value={view.jobOrder.name} readOnly />
              </label>

              <label className="mobile-data-field">
                <span className="mobile-data-label">Commessa</span>
                <select
                  className="mobile-data-select"
                  value={moveCost.targetJobOrderId}
                  onChange={(event) =>
                    setMoveCost((current) =>
                      current ? { ...current, targetJobOrderId: event.target.value } : current
                    )
                  }
                  disabled={movingCost}
                >
                  {reassignJobOrders
                    .map((jobOrder) => (
                      <option key={jobOrder.id} value={jobOrder.id}>
                        {jobOrder.name}
                      </option>
                    ))}
                </select>
              </label>

              <label className="mobile-data-field">
                <span className="mobile-data-label">Tipologia spesa</span>
                <select
                  className="mobile-data-select"
                  value={moveCost.targetCategory}
                  onChange={(event) =>
                    setMoveCost((current) =>
                      current ? { ...current, targetCategory: event.target.value as CostCategoryKey } : current
                    )
                  }
                  disabled={movingCost}
                >
                  {CATEGORY_OPTIONS.map((category) => (
                    <option key={category.key} value={category.key}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="cost-view-modal-actions">
              <button
                type="button"
                className="mobile-button-secondary"
                onClick={() => setMoveCost(null)}
                disabled={movingCost}
              >
                Annulla
              </button>
              <button
                type="button"
                className="button"
                onClick={moveCostToJobOrder}
                disabled={movingCost || !moveCost.targetJobOrderId}
              >
                {movingCost ? "Salvataggio..." : "Salva modifiche"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
