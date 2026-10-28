"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  JobDashboardView,
  type JobOrderDashboardResponse,
  type JobOrderOption,
} from "@/components/dashboard/job-dashboard-view";
import { JobOrderTabs } from "@/components/layout/job-order-tabs";

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

export default function DashboardCommessaPage() {
  const searchParams = useSearchParams();
  const from2 = searchParams.get("from") === "commesse2";
  const initialJobOrderId = searchParams.get("jobOrderId") ?? "";
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState(initialJobOrderId);
  const [dashboard, setDashboard] = useState<JobOrderDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError("");

      try {
        const data = await safeJsonFetch(from2 ? "/api/commesse" : "/api/commesse?dashboardOnly=true");
        const rows = (Array.isArray(data.rows) ? data.rows : []) as JobOrderOption[];
        setJobOrders(from2 ? rows.filter(row => row.type === "SITE" || row.type === "OTHER") : rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento commesse");
      } finally {
        setLoading(false);
      }
    }

    loadOptions();
  }, [from2]);

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
    <div className="job-dashboard-page job-premium-page">
      <section className="job-premium-shell">
        <JobOrderTabs current="dashboard" />
        {from2 && <nav className="sheet-context-nav" aria-label="Navigazione commessa"><Link className="text-link" href={"/commesse2" as Route}>← Gestione Commesse2</Link>{selectedJobOrderId && <Link className="text-link" href={`/commesse/${selectedJobOrderId}?from=commesse2` as Route}>Apri scheda commessa →</Link>}</nav>}

        {error ? <div className="job-dashboard-error">{error}</div> : null}

        {dashboardLoading ? <div className="job-premium-loading">Caricamento dashboard...</div> : null}

        {!dashboardLoading && dashboard ? (
          <JobDashboardView
            dashboard={dashboard}
            jobOrders={jobOrders}
            selectedJobOrderId={selectedJobOrderId}
            loading={loading}
            onJobOrderChange={setSelectedJobOrderId}
          />
        ) : null}

        {!dashboardLoading && !dashboard && !error ? (
          <div className="job-premium-empty-landing">
            <div>
              <p className="job-premium-eyebrow">Gestione commessa</p>
              <h1>Seleziona una commessa</h1>
              <p>Scegli una commessa dal menu per visualizzare KPI, grafici e dettaglio costi.</p>
            </div>
            <label className="job-premium-select-field">
              <span>Commessa</span>
              <select
                value={selectedJobOrderId}
                onChange={(event) => setSelectedJobOrderId(event.target.value)}
                disabled={loading}
              >
                <option value="">Seleziona una commessa</option>
                {jobOrders.map((jobOrder) => (
                  <option key={jobOrder.id} value={jobOrder.id}>
                    {jobOrder.name}{jobOrder.status === "COMPLETED" ? " (Conclusa)" : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : null}
      </section>
    </div>
  );
}
