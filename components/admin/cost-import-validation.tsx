"use client";

import { useEffect, useMemo, useState, useTransition } from "react";

type MatchStatus = "NEW" | "ALREADY_IMPORTED" | "POSSIBLE_DUPLICATE" | "INVALID";
type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED";
type CostActualCategory =
  | "MATERIE_PRIME"
  | "PRESTAZIONI_PROFESSIONALI"
  | "PRESTAZIONI_TERZI"
  | "SPESE_VARIE";

type SessionPayload = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  appliedAt: string | null;
  parseSummary: Record<string, unknown> | null;
  jobOrder: {
    id: string;
    name: string;
    type: string;
    status: string;
  };
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    alreadyImported: number;
    invalid: number;
    possibleDuplicate: number;
    newRows: number;
  };
  rows: Array<{
    id: string;
    rowIndex: number;
    sourceAccountCode: string | null;
    sourceAccountDescription: string | null;
    supplierCode: string | null;
    supplierName: string | null;
    documentDate: string;
    registrationDate: string;
    documentNumber: string;
    descriptionOriginal: string;
    descriptionNormalized: string;
    amount: number | null;
    suggestedCategory: CostActualCategory | null;
    fingerprint: string | null;
    matchStatus: MatchStatus;
    validationStatus: ValidationStatus;
    validationNote: string;
    finalCategory: CostActualCategory | null;
    finalDescription: string;
  }>;
};

const CATEGORY_OPTIONS: CostActualCategory[] = [
  "MATERIE_PRIME",
  "PRESTAZIONI_PROFESSIONALI",
  "PRESTAZIONI_TERZI",
  "SPESE_VARIE",
];

function formatCurrency(value: number | null) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value ?? 0);
}

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function categoryLabel(value: CostActualCategory | null) {
  if (!value) return "Da definire";
  return value.replaceAll("_", " ");
}

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }
  return data;
}

export function CostImportValidation({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [matchFilter, setMatchFilter] = useState<"ALL" | MatchStatus>("ALL");
  const [validationFilter, setValidationFilter] = useState<"ALL" | ValidationStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CostActualCategory>("ALL");
  const [bulkCategory, setBulkCategory] = useState<CostActualCategory>("MATERIE_PRIME");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingRowId, setPendingRowId] = useState("");
  const [isPending, startTransition] = useTransition();

  async function loadSession() {
    try {
      const payload = await jsonFetch<SessionPayload>(`/api/admin/import-costi/${sessionId}`);
      setSession(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Errore caricando la sessione");
    }
  }

  useEffect(() => {
    loadSession();
  }, [sessionId]);

  const filteredRows = useMemo(() => {
    if (!session) return [];
    return session.rows.filter((row) => {
      if (matchFilter !== "ALL" && row.matchStatus !== matchFilter) return false;
      if (validationFilter !== "ALL" && row.validationStatus !== validationFilter) return false;
      if (categoryFilter !== "ALL" && row.finalCategory !== categoryFilter) return false;
      return true;
    });
  }, [categoryFilter, matchFilter, session, validationFilter]);

  function toggleSelection(rowId: string) {
    setSelectedIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredRows.map((row) => row.id);
    const allSelected = visibleIds.every((id) => selectedIds.includes(id));

    setSelectedIds((current) =>
      allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]
    );
  }

  function runBulkAction(action: "approve" | "reject" | "set-category") {
    if (selectedIds.length === 0) {
      setError("Seleziona almeno una riga.");
      return;
    }

    setError("");
    setMessage("");

    startTransition(async () => {
      try {
        await jsonFetch(`/api/admin/import-costi/${sessionId}/rows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            rowIds: selectedIds,
            category: action === "set-category" ? bulkCategory : undefined,
          }),
        });
        setMessage(
          action === "approve"
            ? "Righe selezionate marcate come approvate."
            : action === "reject"
              ? "Righe selezionate marcate come rifiutate."
              : "Categoria applicata alle righe selezionate."
        );
        setSelectedIds([]);
        await loadSession();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Errore nelle azioni massive");
      }
    });
  }

  function saveRow(rowId: string, payload: Record<string, unknown>) {
    setPendingRowId(rowId);
    setError("");
    setMessage("");

    startTransition(async () => {
      try {
        await jsonFetch(`/api/admin/import-costi/${sessionId}/rows/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setMessage("Modifiche riga salvate.");
        await loadSession();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Errore salvando la riga");
      } finally {
        setPendingRowId("");
      }
    });
  }

  function applyApprovedRows() {
    setError("");
    setMessage("");

    startTransition(async () => {
      try {
        const result = await jsonFetch<{ createdCount: number; approvedCount: number }>(
          `/api/admin/import-costi/${sessionId}/apply`,
          { method: "POST" }
        );
        setMessage(
          `Conferma completata: ${result.createdCount} costi actual creati su ${result.approvedCount} righe approvate.`
        );
        await loadSession();
      } catch (applyError) {
        setError(applyError instanceof Error ? applyError.message : "Errore nella conferma import");
      }
    });
  }

  if (!session) {
    return <div className="card">Caricamento validazione costi...</div>;
  }

  return (
    <div className="cost-import-validation-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Import costi actual</p>
            <h2 style={{ margin: 0 }}>{session.jobOrder.name}</h2>
            <p className="mobile-section-subtitle">
              File: <strong>{session.fileName}</strong> · Sessione {session.status}
            </p>
          </div>
        </div>

        <div className="cost-import-stats">
          <div className="cost-import-stat-card"><span>Totale righe</span><strong>{session.stats.total}</strong></div>
          <div className="cost-import-stat-card"><span>Nuove</span><strong>{session.stats.newRows}</strong></div>
          <div className="cost-import-stat-card"><span>Gia importate</span><strong>{session.stats.alreadyImported}</strong></div>
          <div className="cost-import-stat-card"><span>Possibili duplicati</span><strong>{session.stats.possibleDuplicate}</strong></div>
          <div className="cost-import-stat-card"><span>Invalide</span><strong>{session.stats.invalid}</strong></div>
          <div className="cost-import-stat-card"><span>Approvate</span><strong>{session.stats.approved}</strong></div>
        </div>

        {message ? <div className="scad-success">{message}</div> : null}
        {error ? <div className="scad-error">{error}</div> : null}
      </section>

      <section className="card">
        <div className="scad-table-tools">
          <div className="cost-import-filters">
            <label className="mobile-data-field">
              <span className="mobile-data-label">Match</span>
              <select className="mobile-data-select" value={matchFilter} onChange={(event) => setMatchFilter(event.target.value as "ALL" | MatchStatus)}>
                <option value="ALL">Tutte</option>
                <option value="NEW">Solo nuove</option>
                <option value="ALREADY_IMPORTED">Gia importate</option>
                <option value="POSSIBLE_DUPLICATE">Possibili duplicati</option>
                <option value="INVALID">Invalide</option>
              </select>
            </label>

            <label className="mobile-data-field">
              <span className="mobile-data-label">Validazione</span>
              <select className="mobile-data-select" value={validationFilter} onChange={(event) => setValidationFilter(event.target.value as "ALL" | ValidationStatus)}>
                <option value="ALL">Tutte</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approvate</option>
                <option value="REJECTED">Rifiutate</option>
              </select>
            </label>

            <label className="mobile-data-field">
              <span className="mobile-data-label">Categoria</span>
              <select className="mobile-data-select" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value as "ALL" | CostActualCategory)}>
                <option value="ALL">Tutte</option>
                {CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {categoryLabel(category)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="cost-import-bulk-bar">
            <button type="button" className="mobile-button-secondary" onClick={toggleSelectAllVisible}>
              {filteredRows.every((row) => selectedIds.includes(row.id)) ? "Deseleziona tutto" : "Seleziona tutto"}
            </button>
            <button type="button" className="button" onClick={() => runBulkAction("approve")} disabled={isPending}>
              Approva selezionate
            </button>
            <button type="button" className="mobile-button-secondary" onClick={() => runBulkAction("reject")} disabled={isPending}>
              Rifiuta selezionate
            </button>
            <select className="mobile-data-select cost-import-inline-select" value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value as CostActualCategory)}>
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(category)}
                </option>
              ))}
            </select>
            <button type="button" className="mobile-button-secondary" onClick={() => runBulkAction("set-category")} disabled={isPending}>
              Imposta categoria
            </button>
            <button type="button" className="button" onClick={applyApprovedRows} disabled={isPending}>
              Conferma nei costi actual
            </button>
          </div>
        </div>

        <div className="scad-table-wrap">
          <table className="scad-table cost-import-table">
            <thead>
              <tr>
                <th>Sel.</th>
                <th>Match</th>
                <th>Conto sorgente</th>
                <th>Fornitore</th>
                <th>Data</th>
                <th>Documento</th>
                <th>Descrizione finale</th>
                <th>Importo</th>
                <th>Categoria</th>
                <th>Validazione</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelection(row.id)} />
                  </td>
                  <td>
                    <div className={`cost-import-badge cost-import-badge-${row.matchStatus.toLowerCase()}`}>{row.matchStatus}</div>
                    {row.validationNote ? <div className="muted">{row.validationNote}</div> : null}
                  </td>
                  <td>
                    <strong>{row.sourceAccountCode || "-"}</strong>
                    <div>{row.sourceAccountDescription || "-"}</div>
                  </td>
                  <td>
                    <strong>{row.supplierCode || "-"}</strong>
                    <div>{row.supplierName || "-"}</div>
                  </td>
                  <td>{formatDate(row.documentDate || row.registrationDate)}</td>
                  <td>{row.documentNumber || "-"}</td>
                  <td>
                    <input
                      className="scad-table-filter-input"
                      defaultValue={row.finalDescription}
                      onBlur={(event) =>
                        saveRow(row.id, {
                          finalDescription: event.target.value,
                        })
                      }
                    />
                    {pendingRowId === row.id ? <div className="muted">Salvataggio...</div> : null}
                  </td>
                  <td>{formatCurrency(row.amount)}</td>
                  <td>
                    <select
                      className="mobile-data-select"
                      value={row.finalCategory ?? ""}
                      onChange={(event) =>
                        saveRow(row.id, {
                          finalCategory: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Da definire</option>
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {categoryLabel(category)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>{row.validationStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
