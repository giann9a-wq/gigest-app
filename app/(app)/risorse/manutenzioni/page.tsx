"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ResourceTabs } from "@/components/layout/resource-tabs";

type EquipmentOption = {
  id: string;
  nameDescription: string;
  type: "VEHICLE" | "EQUIPMENT";
  status: string;
};

type MaintenanceRow = {
  id: string;
  equipmentId: string;
  equipmentName: string;
  equipmentType: "VEHICLE" | "EQUIPMENT";
  interventionType: string;
  interventionDate: string;
  nextIntervention: string;
  isRecurring: boolean;
  recurrenceMonths: string | number;
  cost: string | number;
  notes: string;
  documents: Array<{ id: string; fileName: string }>;
};

type MaintenanceForm = {
  equipmentId: string;
  interventionType: string;
  interventionDate: string;
  nextIntervention: string;
  isRecurring: boolean;
  recurrenceMonths: string;
  cost: string;
  notes: string;
};

function emptyForm(): MaintenanceForm {
  return {
    equipmentId: "",
    interventionType: "",
    interventionDate: "",
    nextIntervention: "",
    isRecurring: false,
    recurrenceMonths: "",
    cost: "",
    notes: "",
  };
}

async function safeJsonFetch(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data;
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("it-IT");
}

function equipmentTypeLabel(type: "VEHICLE" | "EQUIPMENT") {
  return type === "VEHICLE" ? "Mezzo" : "Attrezzatura";
}

export default function ManutenzioniRisorsePage() {
  const [equipment, setEquipment] = useState<EquipmentOption[]>([]);
  const [rows, setRows] = useState<MaintenanceRow[]>([]);
  const [form, setForm] = useState<MaintenanceForm>(emptyForm());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/risorse/manutenzioni");
      setEquipment(data.equipment ?? []);
      setRows(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento manutenzioni");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  function setFormValue<K extends keyof MaintenanceForm>(key: K, value: MaintenanceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createMaintenance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await safeJsonFetch("/api/risorse/manutenzioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      setForm(emptyForm());
      setMessage("Manutenzione salvata e ribaltata nella scheda mezzo.");
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio manutenzione");
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      [row.equipmentName, equipmentTypeLabel(row.equipmentType), row.interventionType, row.notes]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [query, rows]);

  return (
    <div className="grid gap-4">
      <div className="card commesse-page-card">
        <div className="mobile-section-header">
          <div>
            <h1 className="mobile-section-title">Gestione Risorse</h1>
          </div>
        </div>

        <ResourceTabs current="maintenance" />

        {message ? <div className="job-dashboard-success">{message}</div> : null}
        {error ? <div className="job-dashboard-error">{error}</div> : null}

        <form className="resource-aggregate-form" onSubmit={createMaintenance}>
          <label className="report-control resource-aggregate-wide">
            <span>Mezzo / Attrezzatura</span>
            <select value={form.equipmentId} onChange={(event) => setFormValue("equipmentId", event.target.value)}>
              <option value="">Seleziona elemento</option>
              {equipment.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nameDescription}
                </option>
              ))}
            </select>
          </label>

          <label className="report-control resource-aggregate-wide">
            <span>Intervento</span>
            <input
              value={form.interventionType}
              onChange={(event) => setFormValue("interventionType", event.target.value)}
            />
          </label>

          <label className="report-control">
            <span>Data intervento</span>
            <input
              type="date"
              value={form.interventionDate}
              onChange={(event) => setFormValue("interventionDate", event.target.value)}
            />
          </label>

          <label className="report-control">
            <span>Prossima scadenza</span>
            <input
              type="date"
              value={form.nextIntervention}
              onChange={(event) => setFormValue("nextIntervention", event.target.value)}
            />
          </label>

          <label className="report-control">
            <span>Ricorrenza mesi</span>
            <input
              type="number"
              min="1"
              value={form.recurrenceMonths}
              onChange={(event) => {
                setFormValue("recurrenceMonths", event.target.value);
                setFormValue("isRecurring", event.target.value.trim() !== "");
              }}
              placeholder="Es. 12"
            />
          </label>

          <label className="report-control">
            <span>Costo</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.cost}
              onChange={(event) => setFormValue("cost", event.target.value)}
            />
          </label>

          <label className="report-control resource-aggregate-notes">
            <span>Note</span>
            <textarea value={form.notes} onChange={(event) => setFormValue("notes", event.target.value)} rows={2} />
          </label>

          <button type="submit" className="report-print-btn resource-aggregate-submit" disabled={saving}>
            {saving ? "Salvataggio..." : "Aggiungi manutenzione"}
          </button>
        </form>

        <div className="commesse-filter-bar">
          <label className="report-control commesse-filter-name">
            <span>Cerca</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mezzo, intervento..." />
          </label>
        </div>

        <div className="mobile-toolbar">
          <div className="mobile-table-meta commesse-table-meta">
            Voci visibili: <strong>{visibleRows.length}</strong> su {rows.length}
          </div>
        </div>

        <div className="mobile-table-shell commesse-table-shell">
          <table className="commesse-table resource-aggregate-table">
            <thead>
              <tr>
                <th>Mezzo / Attrezzatura</th>
                <th>Intervento</th>
                <th>Data</th>
                <th>Prossima scadenza</th>
                <th>Costo</th>
                <th>Allegati</th>
                <th>Scheda</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7}>Caricamento...</td>
                </tr>
              ) : visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={7}>Nessuna manutenzione da mostrare.</td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.equipmentName}</strong>
                      <small>{equipmentTypeLabel(row.equipmentType)}</small>
                    </td>
                    <td>
                      <strong>{row.interventionType}</strong>
                      {row.notes ? <small>{row.notes}</small> : null}
                    </td>
                    <td>{formatDate(row.interventionDate)}</td>
                    <td>
                      {formatDate(row.nextIntervention)}
                      {row.isRecurring ? <small>Ogni {row.recurrenceMonths} mesi</small> : null}
                    </td>
                    <td>{row.cost === "" ? "-" : `${Number(row.cost).toLocaleString("it-IT")} EUR`}</td>
                    <td>{row.documents.length}</td>
                    <td>
                      <Link className="button secondary" href={`/mezzi/${row.equipmentId}`}>
                        Apri
                      </Link>
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
