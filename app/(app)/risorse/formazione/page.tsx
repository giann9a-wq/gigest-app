"use client";

import Link from "next/link";
import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { ResourceTabs } from "@/components/layout/resource-tabs";

type PersonOption = {
  id: string;
  fullName: string;
  roleDescription: string | null;
  status: string;
};

type TrainingRow = {
  id: string;
  personId: string;
  personName: string;
  roleDescription: string;
  course: string;
  description: string;
  trainingDate: string;
  mandatory: boolean;
  expiresAt: string;
  isRecurring: boolean;
  recurrenceMonths: string | number;
  documents: Array<{ id: string; fileName: string }>;
};

type TrainingForm = {
  personId: string;
  course: string;
  description: string;
  trainingDate: string;
  mandatory: boolean;
  expiresAt: string;
  isRecurring: boolean;
  recurrenceMonths: string;
};

function emptyForm(): TrainingForm {
  return {
    personId: "",
    course: "",
    description: "",
    trainingDate: "",
    mandatory: false,
    expiresAt: "",
    isRecurring: false,
    recurrenceMonths: "",
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

export default function FormazioneRisorsePage() {
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [rows, setRows] = useState<TrainingRow[]>([]);
  const [form, setForm] = useState<TrainingForm>(emptyForm());
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadRows() {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/risorse/formazione");
      setPeople(data.people ?? []);
      setRows(data.rows ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento formazione");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRows();
  }, []);

  function setFormValue<K extends keyof TrainingForm>(key: K, value: TrainingForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function createTraining(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const data = await safeJsonFetch("/api/risorse/formazione", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      setForm(emptyForm());
      setMessage(
        data.calendarSyncError
          ? `Formazione salvata. Nota calendario: ${data.calendarSyncError}`
          : "Formazione salvata e ribaltata nella scheda risorsa."
      );
      await loadRows();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio formazione");
    } finally {
      setSaving(false);
    }
  }

  const visibleRows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;

    return rows.filter((row) =>
      [row.personName, row.roleDescription, row.course, row.description]
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

        <ResourceTabs current="training" />

        {message ? <div className="job-dashboard-success">{message}</div> : null}
        {error ? <div className="job-dashboard-error">{error}</div> : null}

        <form className="resource-aggregate-form" onSubmit={createTraining}>
          <label className="report-control resource-aggregate-wide">
            <span>Risorsa</span>
            <select value={form.personId} onChange={(event) => setFormValue("personId", event.target.value)}>
              <option value="">Seleziona risorsa</option>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </label>

          <label className="report-control resource-aggregate-wide">
            <span>Corso</span>
            <input value={form.course} onChange={(event) => setFormValue("course", event.target.value)} />
          </label>

          <label className="report-control">
            <span>Data corso</span>
            <input
              type="date"
              value={form.trainingDate}
              onChange={(event) => setFormValue("trainingDate", event.target.value)}
            />
          </label>

          <label className="report-control">
            <span>Scadenza</span>
            <input
              type="date"
              value={form.expiresAt}
              onChange={(event) => setFormValue("expiresAt", event.target.value)}
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

          <label className="resource-aggregate-check">
            <input
              type="checkbox"
              checked={form.mandatory}
              onChange={(event) => setFormValue("mandatory", event.target.checked)}
            />
            Obbligatorio
          </label>

          <label className="report-control resource-aggregate-notes">
            <span>Descrizione</span>
            <textarea
              value={form.description}
              onChange={(event) => setFormValue("description", event.target.value)}
              rows={2}
            />
          </label>

          <button type="submit" className="report-print-btn resource-aggregate-submit" disabled={saving}>
            {saving ? "Salvataggio..." : "Aggiungi formazione"}
          </button>
        </form>

        <div className="commesse-filter-bar">
          <label className="report-control commesse-filter-name">
            <span>Cerca</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Risorsa, corso..." />
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
                <th>Risorsa</th>
                <th>Corso</th>
                <th>Data</th>
                <th>Scadenza</th>
                <th>Note</th>
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
                  <td colSpan={7}>Nessuna formazione da mostrare.</td>
                </tr>
              ) : (
                visibleRows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.personName}</strong>
                      {row.roleDescription ? <small>{row.roleDescription}</small> : null}
                    </td>
                    <td>
                      <strong>{row.course}</strong>
                      <small>{row.mandatory ? "Obbligatorio" : "Facoltativo"}</small>
                    </td>
                    <td>{formatDate(row.trainingDate)}</td>
                    <td>
                      {formatDate(row.expiresAt)}
                      {row.isRecurring ? <small>Ogni {row.recurrenceMonths} mesi</small> : null}
                    </td>
                    <td>{row.description || "-"}</td>
                    <td>{row.documents.length}</td>
                    <td>
                      <Link className="button secondary" href={`/risorse/${row.personId}`}>
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
