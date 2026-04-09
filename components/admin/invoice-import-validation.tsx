"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/number-format";

type MatchStatus = "NEW" | "ALREADY_IMPORTED" | "POSSIBLE_DUPLICATE" | "INVALID";
type ValidationStatus = "PENDING" | "APPROVED" | "REJECTED";

type JobOrderOption = {
  id: string;
  name: string;
  type: string;
  status: string;
};

type SessionPayload = {
  id: string;
  fileName: string;
  status: string;
  uploadedAt: string;
  appliedAt: string | null;
  parseSummary: Record<string, unknown> | null;
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    alreadyImported: number;
    invalid: number;
    possibleDuplicate: number;
    newRows: number;
    unassigned: number;
  };
  rows: Array<{
    id: string;
    rowIndexStart: number;
    rowIndexEnd: number;
    sourceAccountCode: string | null;
    sourceAccountDescription: string | null;
    registrationDate: string;
    registrationProtocol: string;
    causale: string;
    documentDate: string;
    invoiceNumber: string;
    customerCode: string | null;
    customerName: string | null;
    netAmount: number | null;
    vatAmount: number | null;
    grossAmount: number | null;
    fingerprint: string | null;
    matchStatus: MatchStatus;
    validationStatus: ValidationStatus;
    validationNote: string;
    jobOrderId: string;
    jobOrderName: string;
    suggestedJobOrderId: string;
    suggestedJobOrderName: string;
    suggestedJobOrderReason: string;
    assignmentSource: "SUGGESTED" | "MANUAL" | null;
  }>;
};

function formatDate(value: string) {
  if (!value) return "-";
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Errore server");
  }
  return data;
}

export function InvoiceImportValidation({
  sessionId,
  jobOrders,
}: {
  sessionId: string;
  jobOrders: JobOrderOption[];
}) {
  const [session, setSession] = useState<SessionPayload | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkJobOrderId, setBulkJobOrderId] = useState("");
  const [matchFilter, setMatchFilter] = useState<"ALL" | MatchStatus>("NEW");
  const [validationFilter, setValidationFilter] = useState<"ALL" | ValidationStatus>("ALL");
  const [assignmentFilter, setAssignmentFilter] = useState<"ALL" | "UNASSIGNED" | "ASSIGNED">("UNASSIGNED");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingRowId, setPendingRowId] = useState("");
  const [isPending, startTransition] = useTransition();

  async function loadSession() {
    try {
      const payload = await jsonFetch<SessionPayload>(`/api/admin/import-fatture/${sessionId}`);
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
      if (assignmentFilter === "UNASSIGNED" && row.jobOrderId) return false;
      if (assignmentFilter === "ASSIGNED" && !row.jobOrderId) return false;
      return true;
    });
  }, [assignmentFilter, matchFilter, session, validationFilter]);

  function toggleSelection(rowId: string) {
    setSelectedIds((current) =>
      current.includes(rowId) ? current.filter((id) => id !== rowId) : [...current, rowId]
    );
  }

  function toggleSelectAllVisible() {
    const visibleIds = filteredRows.map((row) => row.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));

    setSelectedIds((current) =>
      allSelected ? current.filter((id) => !visibleIds.includes(id)) : [...new Set([...current, ...visibleIds])]
    );
  }

  function runBulkAction(action: "assign-job-order" | "approve" | "reject") {
    if (selectedIds.length === 0) {
      setError("Seleziona almeno una riga.");
      return;
    }

    if (action === "assign-job-order" && !bulkJobOrderId) {
      setError("Seleziona prima una commessa da assegnare.");
      return;
    }

    setError("");
    setMessage("");

    startTransition(async () => {
      try {
        await jsonFetch(`/api/admin/import-fatture/${sessionId}/rows`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            rowIds: selectedIds,
            jobOrderId: action === "assign-job-order" ? bulkJobOrderId : null,
          }),
        });

        setMessage(
          action === "assign-job-order"
            ? "Commessa assegnata alle righe selezionate."
            : action === "approve"
              ? "Fatture selezionate marcate come approvate."
              : "Fatture selezionate marcate come rifiutate."
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
        await jsonFetch(`/api/admin/import-fatture/${sessionId}/rows/${rowId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        setMessage("Assegnazione riga salvata.");
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
          `/api/admin/import-fatture/${sessionId}/apply`,
          { method: "POST" }
        );
        setMessage(
          `Conferma completata: ${result.createdCount} fatture actual create su ${result.approvedCount} righe approvate.`
        );
        await loadSession();
      } catch (applyError) {
        setError(applyError instanceof Error ? applyError.message : "Errore nella conferma import");
      }
    });
  }

  if (!session) {
    return <div className="card">Caricamento validazione fatture...</div>;
  }

  return (
    <div className="cost-import-validation-page">
      <section className="card">
        <div className="mobile-section-header">
          <div>
            <p className="dashboard-kicker">Importa fatture emesse</p>
            <h2 style={{ margin: 0 }}>{session.fileName}</h2>
            <p className="mobile-section-subtitle">
              Staging globale fatture con assegnazione manuale commessa e deduplica su fingerprint stabile.
            </p>
          </div>
        </div>

        <div className="cost-import-stats">
          <div className="cost-import-stat-card"><span>Totale righe</span><strong>{session.stats.total}</strong></div>
          <div className="cost-import-stat-card"><span>Nuove</span><strong>{session.stats.newRows}</strong></div>
          <div className="cost-import-stat-card"><span>Gia importate</span><strong>{session.stats.alreadyImported}</strong></div>
          <div className="cost-import-stat-card"><span>Possibili duplicati</span><strong>{session.stats.possibleDuplicate}</strong></div>
          <div className="cost-import-stat-card"><span>Invalide</span><strong>{session.stats.invalid}</strong></div>
          <div className="cost-import-stat-card"><span>Non assegnate</span><strong>{session.stats.unassigned}</strong></div>
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
              <span className="mobile-data-label">Assegnazione</span>
              <select className="mobile-data-select" value={assignmentFilter} onChange={(event) => setAssignmentFilter(event.target.value as "ALL" | "UNASSIGNED" | "ASSIGNED")}>
                <option value="ALL">Tutte</option>
                <option value="UNASSIGNED">Non assegnate</option>
                <option value="ASSIGNED">Assegnate</option>
              </select>
            </label>
          </div>

          <div className="cost-import-bulk-bar">
            <button type="button" className="mobile-button-secondary" onClick={toggleSelectAllVisible}>
              {filteredRows.length > 0 && filteredRows.every((row) => selectedIds.includes(row.id))
                ? "Deseleziona tutto"
                : "Seleziona tutto"}
            </button>

            <select
              className="mobile-data-select"
              value={bulkJobOrderId}
              onChange={(event) => setBulkJobOrderId(event.target.value)}
            >
              <option value="">Assegna commessa...</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name}
                </option>
              ))}
            </select>

            <button type="button" className="mobile-button-secondary" onClick={() => runBulkAction("assign-job-order")} disabled={isPending}>
              Assegna commessa
            </button>
            <button type="button" className="button" onClick={() => runBulkAction("approve")} disabled={isPending}>
              Approva selezionate
            </button>
            <button type="button" className="mobile-button-secondary" onClick={() => runBulkAction("reject")} disabled={isPending}>
              Rifiuta selezionate
            </button>
            <button type="button" className="button" onClick={applyApprovedRows} disabled={isPending}>
              Conferma nel fatturato actual
            </button>
          </div>
        </div>

        <div className="scad-table-wrap">
          <table className="scad-table cost-import-table">
            <colgroup>
              <col style={{ width: "72px" }} />
              <col style={{ width: "190px" }} />
              <col style={{ width: "250px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "240px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "260px" }} />
              <col style={{ width: "140px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Sel.</th>
                <th>Match</th>
                <th>Conto ricavo</th>
                <th>Data</th>
                <th>Fattura</th>
                <th>Cliente</th>
                <th>Imponibile</th>
                <th>IVA</th>
                <th>Totale</th>
                <th>Commessa assegnata</th>
                <th>Validazione</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(row.id)}
                      onChange={() => toggleSelection(row.id)}
                    />
                  </td>
                  <td>
                    <div className={`cost-import-badge cost-import-badge-${row.matchStatus.toLowerCase()}`}>{row.matchStatus}</div>
                    {row.validationNote ? <div className="muted">{row.validationNote}</div> : null}
                  </td>
                  <td>{row.sourceAccountDescription || "-"}</td>
                  <td>{formatDate(row.documentDate || row.registrationDate)}</td>
                  <td>{row.invoiceNumber || "-"}</td>
                  <td>{row.customerName || "-"}</td>
                  <td>{formatCurrency(row.netAmount)}</td>
                  <td>{formatCurrency(row.vatAmount)}</td>
                  <td>{formatCurrency(row.grossAmount)}</td>
                  <td>
                    <select
                      className="mobile-data-select"
                      value={row.jobOrderId}
                      onChange={(event) =>
                        saveRow(row.id, {
                          jobOrderId: event.target.value || null,
                        })
                      }
                    >
                      <option value="">Da assegnare</option>
                      {jobOrders.map((jobOrder) => (
                        <option key={jobOrder.id} value={jobOrder.id}>
                          {jobOrder.name}
                        </option>
                        ))}
                      </select>
                    {row.assignmentSource === "SUGGESTED" && row.suggestedJobOrderName ? (
                      <div className="invoice-import-suggestion">
                        <strong>Suggerita</strong>
                        <span>{row.suggestedJobOrderName}</span>
                        {row.suggestedJobOrderReason ? (
                          <span className="muted">{row.suggestedJobOrderReason}</span>
                        ) : null}
                      </div>
                    ) : null}
                    {pendingRowId === row.id ? <div className="muted">Salvataggio...</div> : null}
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
