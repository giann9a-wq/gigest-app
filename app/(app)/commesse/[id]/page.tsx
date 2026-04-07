"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type JobTypeValue = "SITE" | "TRAINING" | "LEAVE" | "SICKNESS" | "OTHER";
type ResourceStatusValue = "ACTIVE" | "SUSPENDED" | "ENDED";

type JobOrderForm = {
  name: string;
  type: JobTypeValue | "";
  startDate: string;
  status: ResourceStatusValue | "";
  endDate: string;
  description: string;
  activityCount: number;
  createdAt: string;
  updatedAt: string;
};

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

  const [jobOrder, setJobOrder] = useState<JobOrderForm>({
    name: "",
    type: "",
    startDate: "",
    status: "ACTIVE",
    endDate: "",
    description: "",
    activityCount: 0,
    createdAt: "",
    updatedAt: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch(`/api/commesse/${params.id}`);

      setJobOrder({
        name: data.jobOrder.name ?? "",
        type: data.jobOrder.type ?? "",
        startDate: data.jobOrder.startDate ?? "",
        status: data.jobOrder.status ?? "ACTIVE",
        endDate: data.jobOrder.endDate ?? "",
        description: data.jobOrder.description ?? "",
        activityCount: data.jobOrder.activityCount ?? 0,
        createdAt: data.jobOrder.createdAt ?? "",
        updatedAt: data.jobOrder.updatedAt ?? "",
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
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await safeJsonFetch(`/api/commesse/${params.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: jobOrder.name,
          type: jobOrder.type,
          startDate: jobOrder.startDate,
          status: jobOrder.status,
          endDate: jobOrder.endDate,
          description: jobOrder.description,
        }),
      });

      setMessage("Scheda commessa salvata correttamente.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ margin: 0 }}>Scheda Commessa</h1>
        <button className="button" type="button" onClick={() => router.push("/commesse")}>
          Chiudi
        </button>
      </div>

      {message ? <div style={{ color: "#166534", fontWeight: 700, marginBottom: 16 }}>{message}</div> : null}
      {error ? <div style={{ color: "#b91c1c", fontWeight: 700, marginBottom: 16 }}>{error}</div> : null}

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 0, marginBottom: 24 }}>
        <div style={labelCell}>Commessa</div>
        <div style={valueCell}>
          <input
            style={inputStyle}
            value={jobOrder.name}
            onChange={(e) => setJobOrder({ ...jobOrder, name: e.target.value })}
            disabled={loading}
          />
        </div>

        <div style={labelCell}>Tipologia</div>
        <div style={valueCell}>
          <select
            style={inputStyle}
            value={jobOrder.type}
            onChange={(e) => setJobOrder({ ...jobOrder, type: e.target.value as JobTypeValue })}
            disabled={loading}
          >
            <option value="SITE">{jobTypeLabel("SITE")}</option>
            <option value="TRAINING">{jobTypeLabel("TRAINING")}</option>
            <option value="LEAVE">{jobTypeLabel("LEAVE")}</option>
            <option value="SICKNESS">{jobTypeLabel("SICKNESS")}</option>
            <option value="OTHER">{jobTypeLabel("OTHER")}</option>
          </select>
        </div>

        <div style={labelCell}>Data Inizio</div>
        <div style={valueCell}>
          <input
            type="date"
            style={inputStyle}
            value={jobOrder.startDate}
            onChange={(e) => setJobOrder({ ...jobOrder, startDate: e.target.value })}
            disabled={loading}
          />
        </div>

        <div style={labelCell}>Stato</div>
        <div style={valueCell}>
          <select
            style={inputStyle}
            value={jobOrder.status}
            onChange={(e) => setJobOrder({ ...jobOrder, status: e.target.value as ResourceStatusValue })}
            disabled={loading}
          >
            <option value="ACTIVE">{statusLabel("ACTIVE")}</option>
            <option value="SUSPENDED">{statusLabel("SUSPENDED")}</option>
            <option value="ENDED">{statusLabel("ENDED")}</option>
          </select>
        </div>

        <div style={labelCell}>Data Fine</div>
        <div style={valueCell}>
          <input
            type="date"
            style={inputStyle}
            value={jobOrder.endDate}
            onChange={(e) => setJobOrder({ ...jobOrder, endDate: e.target.value })}
            disabled={loading}
          />
        </div>

        <div style={labelCell}>Descrizione</div>
        <div style={valueCell}>
          <textarea
            style={{ ...inputStyle, minHeight: 110, resize: "vertical" }}
            value={jobOrder.description}
            onChange={(e) => setJobOrder({ ...jobOrder, description: e.target.value })}
            disabled={loading}
          />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 16,
          marginBottom: 20,
        }}
      >
        <div style={infoCardStyle}>
          <div style={infoLabelStyle}>Attività Diario collegate</div>
          <div style={infoValueStyle}>{jobOrder.activityCount}</div>
        </div>
        <div style={infoCardStyle}>
          <div style={infoLabelStyle}>Creata il</div>
          <div style={infoValueStyle}>{formatDateTime(jobOrder.createdAt)}</div>
        </div>
        <div style={infoCardStyle}>
          <div style={infoLabelStyle}>Ultimo aggiornamento</div>
          <div style={infoValueStyle}>{formatDateTime(jobOrder.updatedAt)}</div>
        </div>
      </div>

      <div
        style={{
          background: "#fff7ed",
          border: "1px solid #fdba74",
          borderRadius: 12,
          padding: 16,
          color: "#9a3412",
          marginBottom: 20,
        }}
      >
        Questa scheda è pronta per essere estesa con i campi aggiuntivi della dashboard commessa appena li definisci.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
        <button className="button" type="button" onClick={() => router.push("/commesse")}>
          Torna a Commesse
        </button>
        <button className="button" type="button" onClick={handleSave} disabled={saving || loading}>
          {saving ? "Salvataggio..." : "Salva"}
        </button>
      </div>
    </div>
  );
}

const labelCell: React.CSSProperties = {
  background: "#f97316",
  color: "white",
  padding: "12px 14px",
  fontWeight: 700,
  border: "2px solid white",
};

const valueCell: React.CSSProperties = {
  background: "#fff7ed",
  padding: "10px 12px",
  border: "2px solid white",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 8px",
  borderRadius: 8,
  border: "1px solid #d1d5db",
  background: "white",
  font: "inherit",
};

const infoCardStyle: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #fed7aa",
  borderRadius: 12,
  padding: 16,
};

const infoLabelStyle: React.CSSProperties = {
  color: "#9a3412",
  fontSize: 13,
  fontWeight: 700,
  marginBottom: 8,
};

const infoValueStyle: React.CSSProperties = {
  color: "#111827",
  fontSize: 18,
  fontWeight: 700,
};
