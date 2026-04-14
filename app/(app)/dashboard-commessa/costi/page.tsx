"use client";

import Link from "next/link";
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
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState(initialJobOrderId);
  const [view, setView] = useState<CostActualViewResponse | null>(null);
  const [activeTab, setActiveTab] = useState<CostCategoryKey>("MATERIE_PRIME");
  const [moveCost, setMoveCost] = useState<{
    id: string;
    description: string;
    amount: number;
    targetJobOrderId: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [movingCost, setMovingCost] = useState(false);
  const [error, setError] = useState("");

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
        const data = await jsonFetch<CostActualViewResponse>(`/api/commesse/${selectedJobOrderId}/costi`);
        setView(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Errore caricando i costi");
      } finally {
        setLoading(false);
      }
    }

    loadView();
  }, [selectedJobOrderId]);

  async function moveCostToJobOrder() {
    if (!view || !moveCost || !moveCost.targetJobOrderId) return;

    setMovingCost(true);
    setError("");

    try {
      await jsonMutation<{ success: boolean }>(`/api/commesse/${view.jobOrder.id}/costi`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          costEntryId: moveCost.id,
          targetJobOrderId: moveCost.targetJobOrderId,
        }),
      });

      setMoveCost(null);
      const data = await jsonFetch<CostActualViewResponse>(`/api/commesse/${view.jobOrder.id}/costi`);
      setView(data);
    } catch (moveError) {
      setError(moveError instanceof Error ? moveError.message : "Errore spostando la spesa");
    } finally {
      setMovingCost(false);
    }
  }

  const activeCategory = useMemo(
    () => view?.categories.find((category) => category.key === activeTab) ?? null,
    [activeTab, view]
  );
  const canReassignCosts = Boolean(view?.canReassignCosts);
  const reassignJobOrders = view?.allJobOrders ?? [];

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
            <Link href="/dashboard-commessa" className="mobile-button-secondary">
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
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <div className="scad-error">{error}</div> : null}
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
          </div>

          {activeCategory ? (
            <>
              <div className="mobile-toolbar">
                <div className="muted">
                  <strong>{view.jobOrder.name}</strong> · {activeCategory.entryCount} righe validate
                </div>
                <div className="muted">Totale categoria: <strong>{formatCurrency(activeCategory.totalAmount)}</strong></div>
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
                              <button
                                type="button"
                                className="cost-view-reassign-btn"
                                onClick={() =>
                                  setMoveCost({
                                    id: row.id,
                                    description: row.description || row.documentNumber || "Spesa",
                                    amount: row.amount,
                                    targetJobOrderId: "",
                                  })
                                }
                                title="Cambia commessa"
                                aria-label="Cambia commessa"
                              >
                                Cambia
                              </button>
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
                <p className="dashboard-kicker">Cambia commessa</p>
                <h2 id="move-cost-title">Sposta spesa</h2>
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
                <span className="mobile-data-label">Sposta in</span>
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
                  <option value="">Seleziona commessa</option>
                  {reassignJobOrders
                    .filter((jobOrder) => jobOrder.id !== view.jobOrder.id)
                    .map((jobOrder) => (
                      <option key={jobOrder.id} value={jobOrder.id}>
                        {jobOrder.name}
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
                {movingCost ? "Spostamento..." : "Sposta spesa"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
