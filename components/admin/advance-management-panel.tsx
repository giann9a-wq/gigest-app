"use client";

import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "@/lib/number-format";

type JobOrderOption = {
  id: string;
  name: string;
};

type AdvanceRow = {
  id: string;
  jobOrderId: string;
  jobOrderName: string;
  advanceDate: string;
  description: string;
  amount: number;
  isActive: boolean;
  disabledReason: string;
  disabledAt: string | null;
};

type AdvanceForm = {
  jobOrderId: string;
  advanceDate: string;
  description: string;
  amount: string;
  isActive: boolean;
  disabledReason: string;
};

function todayAsInputValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function emptyForm(): AdvanceForm {
  return {
    jobOrderId: "",
    advanceDate: todayAsInputValue(),
    description: "",
    amount: "",
    isActive: true,
    disabledReason: "",
  };
}

function formatDate(value: string) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString("it-IT");
}

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }

  return data;
}

export function AdvanceManagementPanel() {
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [advances, setAdvances] = useState<AdvanceRow[]>([]);
  const [form, setForm] = useState<AdvanceForm>(emptyForm());
  const [editingId, setEditingId] = useState("");
  const [editingForm, setEditingForm] = useState<AdvanceForm>(emptyForm());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const activeTotal = useMemo(
    () => advances.filter((row) => row.isActive).reduce((total, row) => total + row.amount, 0),
    [advances]
  );

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const data = await jsonFetch<{ advances: AdvanceRow[]; jobOrders: JobOrderOption[] }>("/api/admin/acconti");
      setAdvances(data.advances ?? []);
      setJobOrders(data.jobOrders ?? []);
      setForm((current) => ({
        ...current,
        jobOrderId: current.jobOrderId || data.jobOrders?.[0]?.id || "",
      }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore caricando gli acconti");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function setFormValue<K extends keyof AdvanceForm>(key: K, value: AdvanceForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function setEditingFormValue<K extends keyof AdvanceForm>(key: K, value: AdvanceForm[K]) {
    setEditingForm((current) => ({ ...current, [key]: value }));
  }

  async function createAdvance() {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await jsonFetch("/api/admin/acconti", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      setMessage("Acconto creato e ricavi commessa aggiornati.");
      setForm({ ...emptyForm(), jobOrderId: form.jobOrderId });
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore salvando l'acconto");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row: AdvanceRow) {
    setEditingId(row.id);
    setEditingForm({
      jobOrderId: row.jobOrderId,
      advanceDate: row.advanceDate,
      description: row.description,
      amount: String(row.amount),
      isActive: row.isActive,
      disabledReason: row.disabledReason,
    });
    setError("");
    setMessage("");
  }

  async function updateAdvance(id: string) {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      await jsonFetch(`/api/admin/acconti/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingForm),
      });
      setMessage("Acconto aggiornato e ricavi commessa ricalcolati.");
      setEditingId("");
      await loadData();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Errore aggiornando l'acconto");
    } finally {
      setSaving(false);
    }
  }

  async function deleteAdvance(row: AdvanceRow) {
    const confirmed = window.confirm(`Eliminare l'acconto "${row.description}" da ${formatCurrency(row.amount)}?`);
    if (!confirmed) return;

    setSaving(true);
    setMessage("");
    setError("");

    try {
      await jsonFetch(`/api/admin/acconti/${row.id}`, { method: "DELETE" });
      setMessage("Acconto eliminato e ricavi commessa ricalcolati.");
      await loadData();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Errore eliminando l'acconto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-stack">
      {message ? <div className="scad-success">{message}</div> : null}
      {error ? <div className="scad-error">{error}</div> : null}

      <section className="card admin-advance-form-card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Ricavi manuali</p>
            <h2 className="mobile-section-title">Nuovo acconto</h2>
            <p className="mobile-section-subtitle">
              Gli acconti attivi vengono sommati ai ricavi actual della commessa. Spegnili quando la fattura viene registrata.
            </p>
          </div>
          <div className="dashboard-pill">Attivi: {formatCurrency(activeTotal)}</div>
        </div>

        <div className="admin-advance-form">
          <label>
            <span>Commessa</span>
            <select value={form.jobOrderId} onChange={(event) => setFormValue("jobOrderId", event.target.value)}>
              <option value="">Seleziona commessa</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Data acconto</span>
            <input type="date" value={form.advanceDate} onChange={(event) => setFormValue("advanceDate", event.target.value)} />
          </label>
          <label>
            <span>Importo</span>
            <input type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setFormValue("amount", event.target.value)} />
          </label>
          <label className="admin-advance-field-wide">
            <span>Descrizione</span>
            <input value={form.description} onChange={(event) => setFormValue("description", event.target.value)} placeholder="Es. Acconto bonifico cliente" />
          </label>
          <button type="button" className="button" onClick={() => void createAdvance()} disabled={saving || loading}>
            Crea acconto
          </button>
        </div>
      </section>

      <section className="card">
        <div className="dashboard-card-head">
          <strong>Acconti inseriti</strong>
          <span className="dashboard-pill">{advances.length} voci</span>
        </div>

        <div className="documentale-table-wrap">
          <table className="documentale-table admin-advance-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Commessa</th>
                <th>Descrizione</th>
                <th>Importo</th>
                <th>Stato</th>
                <th>Motivo spegnimento</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}>Caricamento acconti...</td></tr>
              ) : advances.length === 0 ? (
                <tr><td colSpan={7}>Nessun acconto inserito.</td></tr>
              ) : (
                advances.map((row) => {
                  const isEditing = editingId === row.id;

                  return (
                    <tr key={row.id}>
                      {isEditing ? (
                        <>
                          <td><input type="date" value={editingForm.advanceDate} onChange={(event) => setEditingFormValue("advanceDate", event.target.value)} /></td>
                          <td>
                            <select value={editingForm.jobOrderId} onChange={(event) => setEditingFormValue("jobOrderId", event.target.value)}>
                              {jobOrders.map((jobOrder) => (
                                <option key={jobOrder.id} value={jobOrder.id}>{jobOrder.name}</option>
                              ))}
                            </select>
                          </td>
                          <td><input value={editingForm.description} onChange={(event) => setEditingFormValue("description", event.target.value)} /></td>
                          <td><input type="number" min="0" step="0.01" value={editingForm.amount} onChange={(event) => setEditingFormValue("amount", event.target.value)} /></td>
                          <td>
                            <label className="admin-advance-toggle">
                              <input type="checkbox" checked={editingForm.isActive} onChange={(event) => setEditingFormValue("isActive", event.target.checked)} />
                              <span>{editingForm.isActive ? "Attivo" : "Spento"}</span>
                            </label>
                          </td>
                          <td><input value={editingForm.disabledReason} onChange={(event) => setEditingFormValue("disabledReason", event.target.value)} placeholder="Es. fattura registrata" disabled={editingForm.isActive} /></td>
                          <td>
                            <div className="documentale-row-actions">
                              <button type="button" className="button" onClick={() => void updateAdvance(row.id)} disabled={saving}>Salva</button>
                              <button type="button" className="mobile-button-secondary" onClick={() => setEditingId("")} disabled={saving}>Annulla</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{formatDate(row.advanceDate)}</td>
                          <td><strong>{row.jobOrderName}</strong></td>
                          <td>{row.description}</td>
                          <td>{formatCurrency(row.amount)}</td>
                          <td><span className={`delivery-note-status delivery-note-status-${row.isActive ? "validated" : "pending"}`}>{row.isActive ? "Attivo" : "Spento"}</span></td>
                          <td>{row.disabledReason || "-"}</td>
                          <td>
                            <div className="documentale-row-actions">
                              <button type="button" className="mobile-button-secondary" onClick={() => startEdit(row)} title="Modifica">Modifica</button>
                              <button type="button" className="mobile-button-secondary" onClick={() => void deleteAdvance(row)} title="Elimina" disabled={saving}>Elimina</button>
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
