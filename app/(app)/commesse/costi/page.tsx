"use client";

import { useEffect, useMemo, useState } from "react";
import { JobOrderTabs } from "@/components/layout/job-order-tabs";
import { formatCurrency } from "@/lib/number-format";

type CostCategoryKey =
  | "MATERIE_PRIME"
  | "PRESTAZIONI_PROFESSIONALI"
  | "PRESTAZIONI_TERZI"
  | "SPESE_VARIE";

type CostRow = {
  id: string;
  jobOrderName: string;
  category: CostCategoryKey;
  categoryLabel: string;
  supplierCode: string;
  supplierName: string;
  documentDate: string;
  documentNumber: string;
  description: string;
  amount: number;
};

type OptionsPayload = {
  jobOrders: Array<{ id: string; name: string }>;
  suppliers: string[];
  categories: Array<{ key: CostCategoryKey; label: string }>;
};

type Filters = {
  supplier: string;
  jobOrderId: string;
  from: string;
  to: string;
  category: CostCategoryKey | "";
};

const EMPTY_FILTERS: Filters = {
  supplier: "",
  jobOrderId: "",
  from: "",
  to: "",
  category: "",
};

async function jsonFetch<T>(url: string) {
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

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.supplier.trim()) params.set("supplier", filters.supplier.trim());
  if (filters.jobOrderId) params.set("jobOrderId", filters.jobOrderId);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.category) params.set("category", filters.category);
  return params.toString();
}

export default function CostiCommessePage() {
  const [options, setOptions] = useState<OptionsPayload>({
    jobOrders: [],
    suppliers: [],
    categories: [],
  });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [rows, setRows] = useState<CostRow[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setLoadingOptions(true);
      setError("");

      try {
        const data = await jsonFetch<OptionsPayload>("/api/commesse/costi?mode=options");
        setOptions(data);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Errore caricando opzioni costi");
      } finally {
        setLoadingOptions(false);
      }
    }

    loadOptions();
  }, []);

  async function loadRows(nextFilters = filters) {
    setLoading(true);
    setError("");

    try {
      const query = buildQuery(nextFilters);
      const data = await jsonFetch<{ rows: CostRow[]; totalAmount: number }>(
        `/api/commesse/costi${query ? `?${query}` : ""}`
      );
      setRows(data.rows);
      setTotalAmount(data.totalAmount);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore caricando costi");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRows(EMPTY_FILTERS);
  }, []);

  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    void loadRows(EMPTY_FILTERS);
  }

  function exportFilteredRows() {
    const query = buildQuery(filters);
    window.location.href = `/api/commesse/costi/export${query ? `?${query}` : ""}`;
  }

  const rowCountLabel = useMemo(() => {
    if (loading) return "Caricamento...";
    return `Righe visibili: ${rows.length}`;
  }, [loading, rows.length]);

  return (
    <div className="grid gap-4">
      <div className="card commesse-page-card">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Gestione Commesse</h1>
            <p className="mobile-section-subtitle">
              Elenco costi actual di tutte le commesse, filtrabile ed esportabile.
            </p>
          </div>
        </div>

        <JobOrderTabs current="costs" />

        {error ? <div className="scad-error">{error}</div> : null}

        <div className="commesse-filter-bar costi-filter-bar">
          <label className="report-control commesse-filter-name">
            <span>Fornitore</span>
            <input
              value={filters.supplier}
              list="cost-suppliers"
              onChange={(event) => setFilter("supplier", event.target.value)}
              placeholder="Nome o codice"
            />
            <datalist id="cost-suppliers">
              {options.suppliers.map((supplier) => (
                <option key={supplier} value={supplier} />
              ))}
            </datalist>
          </label>

          <label className="report-control">
            <span>Commessa</span>
            <select
              value={filters.jobOrderId}
              onChange={(event) => setFilter("jobOrderId", event.target.value)}
              disabled={loadingOptions}
            >
              <option value="">Tutte</option>
              {options.jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </label>

          <label className="report-control">
            <span>Dal</span>
            <input type="date" value={filters.from} onChange={(event) => setFilter("from", event.target.value)} />
          </label>

          <label className="report-control">
            <span>Al</span>
            <input type="date" value={filters.to} onChange={(event) => setFilter("to", event.target.value)} />
          </label>

          <label className="report-control">
            <span>Tipologia spesa</span>
            <select
              value={filters.category}
              onChange={(event) => setFilter("category", event.target.value as CostCategoryKey | "")}
              disabled={loadingOptions}
            >
              <option value="">Tutte</option>
              {options.categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </label>

          <button type="button" className="button" onClick={() => loadRows()} disabled={loading}>
            Applica filtri
          </button>
          <button type="button" className="report-print-btn" onClick={resetFilters} disabled={loading}>
            Azzera filtri
          </button>
        </div>

        <div className="mobile-toolbar">
          <div className="mobile-table-meta commesse-table-meta">
            {rowCountLabel} | Totale: <strong>{formatCurrency(totalAmount)}</strong>
          </div>
          <button type="button" className="button" onClick={exportFilteredRows} disabled={loading || rows.length === 0}>
            Esporta Excel
          </button>
        </div>

        <div className="mobile-table-shell commesse-table-shell costi-table-shell">
          <table className="commesse-table costi-commesse-table">
            <colgroup>
              <col className="costi-col-commessa" />
              <col className="costi-col-tipologia" />
              <col className="costi-col-fornitore" />
              <col className="costi-col-date" />
              <col className="costi-col-documento" />
              <col className="costi-col-descrizione" />
              <col className="costi-col-importo" />
            </colgroup>
            <thead>
              <tr>
                <th className="commesse-header-cell">Commessa</th>
                <th className="commesse-header-cell">Tipologia</th>
                <th className="commesse-header-cell">Fornitore</th>
                <th className="commesse-header-cell">Data</th>
                <th className="commesse-header-cell">Documento</th>
                <th className="commesse-header-cell">Descrizione</th>
                <th className="commesse-header-cell">Importo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="stats-empty-cell">
                    Caricamento...
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="stats-empty-cell">
                    Nessun costo trovato.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="commesse-body-cell">
                      <span className="commesse-table-value commesse-table-value-strong">{row.jobOrderName}</span>
                    </td>
                    <td className="commesse-body-cell">
                      <span className="commesse-table-value">{row.categoryLabel}</span>
                    </td>
                    <td className="commesse-body-cell">
                      <span className="commesse-table-value">
                        <strong>{row.supplierCode || "-"}</strong>
                        <br />
                        {row.supplierName || "-"}
                      </span>
                    </td>
                    <td className="commesse-body-cell">
                      <span className="commesse-table-value">{formatDate(row.documentDate)}</span>
                    </td>
                    <td className="commesse-body-cell">
                      <span className="commesse-table-value">{row.documentNumber || "-"}</span>
                    </td>
                    <td className="commesse-body-cell">
                      <span className="commesse-table-value">{row.description || "-"}</span>
                    </td>
                    <td className="commesse-body-cell">
                      <span className="commesse-table-value commesse-table-value-strong">{formatCurrency(row.amount)}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

