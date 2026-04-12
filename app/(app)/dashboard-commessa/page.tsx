"use client";

import { useEffect, useState } from "react";
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
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [selectedJobOrderId, setSelectedJobOrderId] = useState("");
  const [dashboard, setDashboard] = useState<JobOrderDashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError("");

      try {
        const data = await safeJsonFetch("/api/commesse");
        const rows = (Array.isArray(data.rows) ? data.rows : []) as JobOrderOption[];
        setJobOrders(rows);
        if (rows[0]?.id) {
          setSelectedJobOrderId(rows[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento commesse");
      } finally {
        setLoading(false);
      }
    }

    loadOptions();
  }, []);

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
      </section>
    </div>
  );
}
