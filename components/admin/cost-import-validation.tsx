"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import { formatCurrency } from "@/lib/number-format";

type MatchStatus = "NEW" | "ALREADY_IMPORTED" | "UPDATED_DUPLICATE" | "POSSIBLE_DUPLICATE" | "INVALID";
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
  allJobOrders: Array<{
    id: string;
    name: string;
    type: string;
    status: string;
  }>;
  stats: {
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    alreadyImported: number;
    updatedDuplicate: number;
    invalid: number;
    possibleDuplicate: number;
    newRows: number;
  };
  rows: Array<{
    id: string;
    jobOrderId: string;
    jobOrderName: string;
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

type SplitDraftRow = {
  jobOrderId: string;
  amount: string;
  finalCategory: CostActualCategory | "";
  finalDescription: string;
};

const CATEGORY_OPTIONS: CostActualCategory[] = [
  "MATERIE_PRIME",
  "PRESTAZIONI_PROFESSIONALI",
  "PRESTAZIONI_TERZI",
  "SPESE_VARIE",
];

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

function matchStatusLabel(row: SessionPayload["rows"][number]) {
  if (
    row.matchStatus === "ALREADY_IMPORTED" &&
    /spostata|ripartita/i.test(row.validationNote)
  ) {
    return "GIA IMPORTATA / SPOSTATA";
  }

  return row.matchStatus;
}

function amountToCents(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) return Number.NaN;
  return Math.round(parsed * 100);
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
  const [expandedInvalidRows, setExpandedInvalidRows] = useState<string[]>([]);
  const [rowDrafts, setRowDrafts] = useState<
    Record<
      string,
      {
        sourceAccountCode: string;
        sourceAccountDescription: string;
        supplierCode: string;
        supplierName: string;
        documentDate: string;
        registrationDate: string;
        documentNumber: string;
        amount: string;
        finalDescription: string;
        finalCategory: string;
        jobOrderId: string;
        validationNote: string;
      }
    >
  >({});
  const [matchFilter, setMatchFilter] = useState<"ALL" | MatchStatus>("NEW");
  const [validationFilter, setValidationFilter] = useState<"ALL" | ValidationStatus>("ALL");
  const [categoryFilter, setCategoryFilter] = useState<"ALL" | CostActualCategory>("ALL");
  const [splitRow, setSplitRow] = useState<SessionPayload["rows"][number] | null>(null);
  const [splitDraftRows, setSplitDraftRows] = useState<SplitDraftRow[]>([]);
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

  function createRowDraft(row: SessionPayload["rows"][number]) {
    return {
      sourceAccountCode: row.sourceAccountCode ?? "",
      sourceAccountDescription: row.sourceAccountDescription ?? "",
      supplierCode: row.supplierCode ?? "",
      supplierName: row.supplierName ?? "",
      documentDate: row.documentDate ?? "",
      registrationDate: row.registrationDate ?? "",
      documentNumber: row.documentNumber ?? "",
      amount: row.amount == null ? "" : String(row.amount),
      finalDescription: row.finalDescription ?? "",
      finalCategory: row.finalCategory ?? "",
      jobOrderId: row.jobOrderId ?? "",
      validationNote: row.validationNote ?? "",
    };
  }

  function getRowDraft(row: SessionPayload["rows"][number]) {
    return rowDrafts[row.id] ?? createRowDraft(row);
  }

  function getCorrectionInputClass(isMissing: boolean) {
    return `admin-password-input${isMissing ? " cost-import-missing-field" : ""}`;
  }

  function getCorrectionSelectClass(isMissing: boolean) {
    return `mobile-data-select${isMissing ? " cost-import-missing-field" : ""}`;
  }

  function updateRowDraft(row: SessionPayload["rows"][number], field: string, value: string) {
    setRowDrafts((current) => ({
      ...current,
      [row.id]: {
        ...(current[row.id] ?? createRowDraft(row)),
        [field]: value,
      },
    }));
  }

  function toggleInvalidEditor(row: SessionPayload["rows"][number]) {
    setRowDrafts((current) => ({
      ...current,
      [row.id]: current[row.id] ?? createRowDraft(row),
    }));
    setExpandedInvalidRows((current) =>
      current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id]
    );
  }

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

  function approveAndApplySelectedRows() {
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
            action: "approve",
            rowIds: selectedIds,
          }),
        });
        const result = await jsonFetch<{
          createdCount: number;
          updatedCount: number;
          removedDuplicateCount: number;
          approvedCount: number;
        }>(
          `/api/admin/import-costi/${sessionId}/apply`,
          { method: "POST" }
        );
        setMessage(
          `Approvazione e conferma completate: ${result.createdCount} costi creati, ${result.updatedCount} aggiornati${
            result.removedDuplicateCount > 0
              ? `, ${result.removedDuplicateCount} duplicati rimossi`
              : ""
          } su ${result.approvedCount} righe approvate.`
        );
        setSelectedIds([]);
        await loadSession();
      } catch (actionError) {
        setError(actionError instanceof Error ? actionError.message : "Errore in approvazione e conferma");
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

  function saveInvalidCorrection(row: SessionPayload["rows"][number]) {
    const draft = getRowDraft(row);
    saveRow(row.id, {
      sourceAccountCode: draft.sourceAccountCode,
      sourceAccountDescription: draft.sourceAccountDescription,
      supplierCode: draft.supplierCode,
      supplierName: draft.supplierName,
      documentDate: draft.documentDate || null,
      registrationDate: draft.registrationDate || null,
      documentNumber: draft.documentNumber,
      amount: draft.amount === "" ? null : Number(draft.amount),
      finalDescription: draft.finalDescription,
      finalCategory: draft.finalCategory || null,
      jobOrderId: draft.jobOrderId,
      validationNote: draft.validationNote,
    });
  }

  function openSplitModal(row: SessionPayload["rows"][number]) {
    const amount = row.amount ?? 0;
    const half = Number((amount / 2).toFixed(2));
    const remaining = Number((amount - half).toFixed(2));

    setSplitRow(row);
    setSplitDraftRows([
      {
        jobOrderId: row.jobOrderId,
        amount: half ? String(half) : "",
        finalCategory: row.finalCategory ?? "",
        finalDescription: row.finalDescription || row.descriptionOriginal || "",
      },
      {
        jobOrderId: row.jobOrderId,
        amount: remaining ? String(remaining) : "",
        finalCategory: row.finalCategory ?? "",
        finalDescription: row.finalDescription || row.descriptionOriginal || "",
      },
    ]);
    setError("");
    setMessage("");
  }

  function updateSplitDraft(index: number, field: keyof SplitDraftRow, value: string) {
    setSplitDraftRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  }

  function addSplitDraftRow() {
    if (!splitRow) return;
    setSplitDraftRows((current) => [
      ...current,
      {
        jobOrderId: splitRow.jobOrderId,
        amount: "",
        finalCategory: splitRow.finalCategory ?? "",
        finalDescription: splitRow.finalDescription || splitRow.descriptionOriginal || "",
      },
    ]);
  }

  function removeSplitDraftRow(index: number) {
    setSplitDraftRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
  }

  function applySplit() {
    if (!splitRow) return;

    setPendingRowId(splitRow.id);
    setError("");
    setMessage("");

    startTransition(async () => {
      try {
        await jsonFetch(`/api/admin/import-costi/${sessionId}/rows/${splitRow.id}/split`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            splits: splitDraftRows.map((row) => ({
              jobOrderId: row.jobOrderId,
              amount: row.amount,
              finalCategory: row.finalCategory || null,
              finalDescription: row.finalDescription,
            })),
          }),
        });
        setMessage("Costo diviso correttamente. Le nuove righe sono da verificare e approvare.");
        setSplitRow(null);
        setSplitDraftRows([]);
        await loadSession();
      } catch (splitError) {
        setError(splitError instanceof Error ? splitError.message : "Errore dividendo il costo");
      } finally {
        setPendingRowId("");
      }
    });
  }

  if (!session) {
    return <div className="card">Caricamento validazione costi...</div>;
  }

  const splitOriginalCents = amountToCents(splitRow?.amount);
  const splitDraftCents = splitDraftRows.reduce(
    (total, row) => total + amountToCents(row.amount),
    0
  );
  const splitDifferenceCents =
    Number.isFinite(splitOriginalCents) && Number.isFinite(splitDraftCents)
      ? splitDraftCents - splitOriginalCents
      : Number.NaN;
  const splitIsBalanced = splitRow != null && splitDifferenceCents === 0;
  const splitHasInvalidRows =
    splitDraftRows.length < 2 ||
    splitDraftRows.some((row) => {
      const cents = amountToCents(row.amount);
      return !row.jobOrderId || !row.finalCategory || !Number.isFinite(cents) || cents <= 0;
    });

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
          <div className="cost-import-stat-card"><span>Duplicate aggiornate</span><strong>{session.stats.updatedDuplicate}</strong></div>
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
                <option value="UPDATED_DUPLICATE">Duplicate aggiornate</option>
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
            <button type="button" className="mobile-button-secondary" onClick={() => runBulkAction("reject")} disabled={isPending}>
              Rifiuta selezionate
            </button>
            <button type="button" className="button" onClick={approveAndApplySelectedRows} disabled={isPending}>
              Approva e conferma
            </button>
          </div>
        </div>

        <div className="mobile-table-shell commesse-table-shell cost-import-table-shell">
          <table className="scad-table cost-import-table">
            <colgroup>
              <col style={{ width: "72px" }} />
              <col style={{ width: "180px" }} />
              <col style={{ width: "280px" }} />
              <col style={{ width: "140px" }} />
              <col style={{ width: "260px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "260px" }} />
              <col style={{ width: "210px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "150px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Sel.</th>
                <th>Match</th>
                <th>Fornitore</th>
                <th>Data</th>
                <th>Descrizione finale</th>
                <th>Importo</th>
                <th>Commessa</th>
                <th>Categoria</th>
                <th>Validazione</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const isInvalid = row.matchStatus === "INVALID";
                const isExpanded = expandedInvalidRows.includes(row.id);
                const draft = getRowDraft(row);
                const missingSupplier = !draft.supplierName.trim();
                const missingDate = !draft.documentDate && !draft.registrationDate;
                const missingDocument = !draft.documentNumber.trim();
                const missingAmount = draft.amount === "";
                const missingCategory = !draft.finalCategory;

                return (
                  <Fragment key={row.id}>
                    <tr key={row.id}>
                      <td>
                        <input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggleSelection(row.id)} />
                      </td>
                      <td>
                        <div className={`cost-import-badge cost-import-badge-${row.matchStatus.toLowerCase()}`}>{matchStatusLabel(row)}</div>
                        {row.validationNote ? <div className="muted">{row.validationNote}</div> : null}
                        {isInvalid ? (
                          <button
                            type="button"
                            className="mobile-button-secondary"
                            style={{ marginTop: 8 }}
                            onClick={() => toggleInvalidEditor(row)}
                          >
                            {isExpanded ? "Chiudi correzione" : "Correggi import"}
                          </button>
                        ) : null}
                      </td>
                      <td>{row.supplierName || "-"} </td>
                      <td>{formatDate(row.documentDate || row.registrationDate)}</td>
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
                          value={row.jobOrderId}
                          onChange={(event) =>
                            saveRow(row.id, {
                              jobOrderId: event.target.value,
                            })
                          }
                        >
                          {session.allJobOrders.map((jobOrder) => (
                            <option key={jobOrder.id} value={jobOrder.id}>
                              {jobOrder.name}
                            </option>
                          ))}
                        </select>
                      </td>
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
                      <td>
                        <button
                          type="button"
                          className="mobile-button-secondary"
                          onClick={() => openSplitModal(row)}
                          disabled={session.status === "APPLIED" || row.amount == null || isPending}
                        >
                          Dividi
                        </button>
                      </td>
                    </tr>
                    {isInvalid && isExpanded ? (
                      <tr>
                        <td colSpan={10}>
                          <div className="admin-grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Codice conto</span>
                              <input
                                className="admin-password-input"
                                value={draft.sourceAccountCode}
                                onChange={(event) => updateRowDraft(row, "sourceAccountCode", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Conto sorgente</span>
                              <input
                                className="admin-password-input"
                                value={draft.sourceAccountDescription}
                                onChange={(event) => updateRowDraft(row, "sourceAccountDescription", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Codice fornitore</span>
                              <input
                                className="admin-password-input"
                                value={draft.supplierCode}
                                onChange={(event) => updateRowDraft(row, "supplierCode", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Fornitore</span>
                              <input
                                className={getCorrectionInputClass(missingSupplier)}
                                value={draft.supplierName}
                                onChange={(event) => updateRowDraft(row, "supplierName", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Data documento</span>
                              <input
                                type="date"
                                className={getCorrectionInputClass(missingDate)}
                                value={draft.documentDate}
                                onChange={(event) => updateRowDraft(row, "documentDate", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Data registrazione</span>
                              <input
                                type="date"
                                className={getCorrectionInputClass(missingDate)}
                                value={draft.registrationDate}
                                onChange={(event) => updateRowDraft(row, "registrationDate", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Documento</span>
                              <input
                                className={getCorrectionInputClass(missingDocument)}
                                value={draft.documentNumber}
                                onChange={(event) => updateRowDraft(row, "documentNumber", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Importo</span>
                              <input
                                type="number"
                                step="0.01"
                                className={getCorrectionInputClass(missingAmount)}
                                value={draft.amount}
                                onChange={(event) => updateRowDraft(row, "amount", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Categoria finale</span>
                              <select
                                className={getCorrectionSelectClass(missingCategory)}
                                value={draft.finalCategory}
                                onChange={(event) => updateRowDraft(row, "finalCategory", event.target.value)}
                              >
                                <option value="">Da definire</option>
                                {CATEGORY_OPTIONS.map((category) => (
                                  <option key={category} value={category}>
                                    {categoryLabel(category)}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Commessa</span>
                              <select
                                className="mobile-data-select"
                                value={draft.jobOrderId}
                                onChange={(event) => updateRowDraft(row, "jobOrderId", event.target.value)}
                              >
                                {session.allJobOrders.map((jobOrder) => (
                                  <option key={jobOrder.id} value={jobOrder.id}>
                                    {jobOrder.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="mobile-data-field" style={{ gridColumn: "1 / span 2" }}>
                              <span className="mobile-data-label">Descrizione finale</span>
                              <input
                                className="admin-password-input"
                                value={draft.finalDescription}
                                onChange={(event) => updateRowDraft(row, "finalDescription", event.target.value)}
                              />
                            </label>
                            <label className="mobile-data-field">
                              <span className="mobile-data-label">Nota validazione</span>
                              <input
                                className="admin-password-input"
                                value={draft.validationNote}
                                onChange={(event) => updateRowDraft(row, "validationNote", event.target.value)}
                              />
                            </label>
                          </div>
                          <div className="cost-import-bulk-bar" style={{ marginTop: 12 }}>
                            <button type="button" className="button" onClick={() => saveInvalidCorrection(row)} disabled={isPending}>
                              Salva correzione
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {splitRow ? (
        <div className="cost-import-split-backdrop" role="dialog" aria-modal="true" aria-labelledby="cost-import-split-title">
          <div className="cost-import-split-modal">
            <div className="cost-import-split-head">
              <div>
                <p className="dashboard-kicker">Split costo</p>
                <h3 id="cost-import-split-title">Dividi voce costo</h3>
                <p className="mobile-section-subtitle">
                  {splitRow.supplierName || "Fornitore non definito"} - documento {splitRow.documentNumber || "-"}
                </p>
              </div>
              <button type="button" className="mobile-button-secondary" onClick={() => setSplitRow(null)} disabled={isPending}>
                Chiudi
              </button>
            </div>

            <div className="cost-import-split-summary">
              <div>
                <span>Importo origine</span>
                <strong>{formatCurrency(splitRow.amount)}</strong>
              </div>
              <div>
                <span>Totale allocato</span>
                <strong>{formatCurrency(splitDraftCents / 100)}</strong>
              </div>
              <div className={splitIsBalanced ? "cost-import-split-ok" : "cost-import-split-ko"}>
                <span>Differenza</span>
                <strong>{Number.isFinite(splitDifferenceCents) ? formatCurrency(splitDifferenceCents / 100) : "-"}</strong>
              </div>
            </div>

            <div className="cost-import-split-list">
              {splitDraftRows.map((draft, index) => (
                <div key={index} className="cost-import-split-row">
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Commessa</span>
                    <select
                      className="mobile-data-select"
                      value={draft.jobOrderId}
                      onChange={(event) => updateSplitDraft(index, "jobOrderId", event.target.value)}
                    >
                      {session.allJobOrders.map((jobOrder) => (
                        <option key={jobOrder.id} value={jobOrder.id}>
                          {jobOrder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Importo</span>
                    <input
                      type="number"
                      step="0.01"
                      className="admin-password-input"
                      value={draft.amount}
                      onChange={(event) => updateSplitDraft(index, "amount", event.target.value)}
                    />
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Categoria</span>
                    <select
                      className="mobile-data-select"
                      value={draft.finalCategory}
                      onChange={(event) => updateSplitDraft(index, "finalCategory", event.target.value)}
                    >
                      <option value="">Da definire</option>
                      {CATEGORY_OPTIONS.map((category) => (
                        <option key={category} value={category}>
                          {categoryLabel(category)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mobile-data-field">
                    <span className="mobile-data-label">Descrizione</span>
                    <input
                      className="admin-password-input"
                      value={draft.finalDescription}
                      onChange={(event) => updateSplitDraft(index, "finalDescription", event.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="icon-action-button icon-action-button-danger"
                    onClick={() => removeSplitDraftRow(index)}
                    disabled={splitDraftRows.length <= 2 || isPending}
                    title="Rimuovi riga split"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>

            {!splitIsBalanced ? (
              <div className="scad-error">
                Lo split deve allocare esattamente il totale origine: non sono ammessi sotto-allocazione o over-allocazione.
              </div>
            ) : null}

            <div className="cost-import-split-actions">
              <button type="button" className="mobile-button-secondary" onClick={addSplitDraftRow} disabled={isPending}>
                Aggiungi riga
              </button>
              <div>
                <button type="button" className="mobile-button-secondary" onClick={() => setSplitRow(null)} disabled={isPending}>
                  Annulla
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={applySplit}
                  disabled={isPending || !splitIsBalanced || splitHasInvalidRows}
                >
                  {pendingRowId === splitRow.id ? "Divido..." : "Conferma split"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
