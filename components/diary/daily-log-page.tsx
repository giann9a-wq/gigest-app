"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatItalianLongDate, formatItalianShortDate } from "@/lib/date-format";

type ResourceOption = {
  value: string;
  label: string;
  type: "PERSON" | "EQUIPMENT";
};

type JobOrderOption = {
  id: string;
  name: string;
  type: string;
};

type ExternalResourceOption = {
  id: string;
  name: string;
};

type MaterialUsageRow = {
  id: string;
  jobOrderId: string;
  description: string;
  unitOfMeasure: string;
  quantity: number;
  usageDate: string;
  createdAt: string;
  updatedAt: string;
};

type MaterialFormState = {
  description: string;
  usageDate: string;
  unitOfMeasure: string;
  quantity: string;
};

type DeliveryNoteRow = {
  id: string;
  jobOrderId: string;
  supplier: string;
  description: string;
  usageDate: string;
  createdAt: string;
  updatedAt: string;
};

type DeliveryNoteFormState = {
  supplier: string;
  description: string;
  usageDate: string;
};

type InternalEditableRow = {
  localId: string;
  resourceValue: string;
  resourceLabel?: string;
  jobOrderId: string;
  jobOrderLabel?: string;
  hours: string;
  activityDescription: string;
};

type ExternalEditableRow = {
  localId: string;
  externalResourceId: string;
  externalResourceLabel?: string;
  jobOrderId: string;
  jobOrderLabel?: string;
  days: string;
  activityDescription: string;
};

type ExternalEconomyEditableRow = {
  localId: string;
  externalResourceId: string;
  externalResourceLabel?: string;
  jobOrderId: string;
  jobOrderLabel?: string;
  hours: string;
  activityDescription: string;
};

type PrintDay = {
  date: string;
  internalRows: InternalEditableRow[];
  externalRows: ExternalEditableRow[];
  externalEconomyRows: ExternalEconomyEditableRow[];
};

type PrintOptions = {
  mode: "single" | "multi";
  singleDate: string;
  selectedDates: string[];
  rangeFrom: string;
  rangeTo: string;
  onlyCompiled: boolean;
  includeInternal: boolean;
  includeExternal: boolean;
  includeTotals: boolean;
  includeDescriptions: boolean;
};

function todayAsInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T00:00:00`);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function enumerateDateRange(from: string, to: string) {
  if (!from || !to) return [];

  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return [];

  const dates: string[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const year = cursor.getFullYear();
    const month = `${cursor.getMonth() + 1}`.padStart(2, "0");
    const day = `${cursor.getDate()}`.padStart(2, "0");
    dates.push(`${year}-${month}-${day}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

function makeEmptyInternalRow(): InternalEditableRow {
  return {
    localId: crypto.randomUUID(),
    resourceValue: "",
    jobOrderId: "",
    hours: "",
    activityDescription: "",
  };
}

function makeEmptyExternalRow(): ExternalEditableRow {
  return {
    localId: crypto.randomUUID(),
    externalResourceId: "",
    jobOrderId: "",
    days: "",
    activityDescription: "",
  };
}

function makeEmptyExternalEconomyRow(): ExternalEconomyEditableRow {
  return {
    localId: crypto.randomUUID(),
    externalResourceId: "",
    jobOrderId: "",
    hours: "",
    activityDescription: "",
  };
}

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

function sumNumericStrings(values: string[]) {
  return values.reduce((sum, value) => {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) ? sum + numericValue : sum;
  }, 0);
}

function toOneDecimal(value: number) {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function isFilledInternal(row: InternalEditableRow) {
  return row.resourceValue.trim() && row.jobOrderId.trim() && row.hours.trim();
}

function isFilledExternal(row: ExternalEditableRow) {
  return row.externalResourceId.trim() && row.jobOrderId.trim() && row.days.trim();
}

function isFilledExternalEconomy(row: ExternalEconomyEditableRow) {
  return row.externalResourceId.trim() && row.jobOrderId.trim() && row.hours.trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function printRowsTable(
  title: string,
  emptyMessage: string,
  rows: Array<{ resource: string; jobOrder: string; quantity: string; description: string }>,
  quantityLabel: string,
  includeDescriptions: boolean
) {
  const body =
    rows.length === 0
      ? `<tr><td colspan="${includeDescriptions ? 4 : 3}" class="empty">${escapeHtml(emptyMessage)}</td></tr>`
      : rows
          .map(
            (row) => `
              <tr>
                <td>${escapeHtml(row.resource || "-")}</td>
                <td>${escapeHtml(row.jobOrder || "-")}</td>
                <td class="num">${escapeHtml(row.quantity || "-")}</td>
                ${includeDescriptions ? `<td>${escapeHtml(row.description || "-")}</td>` : ""}
              </tr>`
          )
          .join("");

  return `
    <section class="print-section">
      <h2>${escapeHtml(title)}</h2>
      <table>
        <thead>
          <tr>
            <th>Risorsa</th>
            <th>Commessa</th>
            <th>${escapeHtml(quantityLabel)}</th>
            ${includeDescriptions ? "<th>Descrizione</th>" : ""}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function buildPrintHtml(days: PrintDay[], options: PrintOptions) {
  const dayPanels = days.map((day) => {
      const internalRows = day.internalRows.filter(isFilledInternal);
      const externalRows = day.externalRows.filter(isFilledExternal);
      const externalEconomyRows = day.externalEconomyRows.filter(isFilledExternalEconomy);
      const totalHours = sumNumericStrings(internalRows.map((row) => row.hours));
      const totalDays = sumNumericStrings(externalRows.map((row) => row.days));
      const totalEconomyHours = sumNumericStrings(externalEconomyRows.map((row) => row.hours));

      return `
        <article class="print-day">
          <header class="print-header">
            <div>
              <div class="brand">GiGest</div>
              <h1>Diario del cantiere</h1>
              <p>${escapeHtml(formatItalianLongDate(day.date))}</p>
            </div>
            <div class="print-date">${escapeHtml(formatItalianShortDate(day.date))}</div>
          </header>
          ${
            options.includeTotals
              ? `<section class="print-totals">
                  <div><span>Interne</span><strong>${internalRows.length}</strong></div>
                  <div><span>Ore interne</span><strong>${toOneDecimal(totalHours)}</strong></div>
                  <div><span>Subappalto</span><strong>${externalRows.length}</strong></div>
                  <div><span>Giornate esterne</span><strong>${toOneDecimal(totalDays)}</strong></div>
                  <div><span>Economia</span><strong>${externalEconomyRows.length}</strong></div>
                  <div><span>Ore economia</span><strong>${toOneDecimal(totalEconomyHours)}</strong></div>
                </section>`
              : ""
          }
          ${
            options.includeInternal
              ? printRowsTable(
                  "Risorse interne",
                  "Nessuna risorsa interna caricata.",
                  internalRows.map((row) => ({
                    resource: row.resourceLabel || row.resourceValue,
                    jobOrder: row.jobOrderLabel || row.jobOrderId,
                    quantity: toOneDecimal(Number(row.hours) || 0),
                    description: row.activityDescription,
                  })),
                  "Ore",
                  options.includeDescriptions
                )
              : ""
          }
          ${
            options.includeExternal
              ? printRowsTable(
                  "Risorse esterne",
                  "Nessuna risorsa esterna caricata.",
                  externalRows.map((row) => ({
                    resource: row.externalResourceLabel || row.externalResourceId,
                    jobOrder: row.jobOrderLabel || row.jobOrderId,
                    quantity: toOneDecimal(Number(row.days) || 0),
                    description: row.activityDescription,
                  })),
                  "Giornate",
                  options.includeDescriptions
                )
              : ""
          }
          ${
            options.includeExternal
              ? printRowsTable(
                  "Risorse in economia",
                  "Nessuna risorsa in economia caricata.",
                  externalEconomyRows.map((row) => ({
                    resource: row.externalResourceLabel || row.externalResourceId,
                    jobOrder: row.jobOrderLabel || row.jobOrderId,
                    quantity: toOneDecimal(Number(row.hours) || 0),
                    description: row.activityDescription,
                  })),
                  "Ore",
                  options.includeDescriptions
                )
              : ""
          }
        </article>`;
    });

  const pages: string[] = [];
  for (let index = 0; index < dayPanels.length; index += 2) {
    pages.push(`
      <section class="print-sheet">
        ${dayPanels[index]}
        ${dayPanels[index + 1] ?? '<article class="print-day print-day-empty"></article>'}
      </section>`);
  }

  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Diario del cantiere</title>
        <style>
          @page { size: A4 landscape; margin: 8mm; }
          * { box-sizing: border-box; }
          body { margin: 0; color: #1f2937; font-family: Arial, sans-serif; background: #fff; }
          .print-sheet { height: calc(210mm - 16mm); page-break-after: always; display: grid; grid-template-columns: 1fr 1fr; gap: 5mm; }
          .print-sheet:last-child { page-break-after: auto; }
          .print-day { min-width: 0; overflow: hidden; padding: 0 3mm 0 0; border-right: 1px dashed #d1d5db; break-inside: avoid; }
          .print-day:last-child { border-right: none; padding: 0 0 0 3mm; }
          .print-day-empty { border-right: none; }
          .print-header { display: flex; justify-content: space-between; gap: 12px; border-bottom: 2px solid #f97316; padding-bottom: 6px; margin-bottom: 7px; }
          .brand { color: #f97316; font-weight: 900; letter-spacing: .08em; text-transform: uppercase; font-size: 9px; }
          h1 { margin: 2px 0; font-size: 16px; }
          h2 { margin: 0 0 4px; font-size: 11px; }
          p { margin: 0; color: #6b7280; }
          .print-header p { font-size: 10px; }
          .print-date { align-self: start; padding: 5px 8px; border-radius: 10px; background: #fff7ed; color: #9a3412; font-size: 11px; font-weight: 800; }
          .print-totals { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin: 7px 0 8px; }
          .print-totals div { border: 1px solid #e5e7eb; border-radius: 9px; padding: 5px 6px; background: #f8fafc; }
          .print-totals span { display: block; color: #6b7280; font-size: 8px; font-weight: 700; text-transform: uppercase; }
          .print-totals strong { display: block; margin-top: 2px; font-size: 12px; }
          .print-section { margin-top: 7px; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; }
          th { background: #f8fafc; color: #6b7280; text-transform: uppercase; font-size: 7px; letter-spacing: .05em; }
          th, td { border: 1px solid #e5e7eb; padding: 3px 4px; text-align: left; vertical-align: top; }
          .num { text-align: right; font-weight: 800; white-space: nowrap; }
          .empty { text-align: center; color: #6b7280; }
        </style>
      </head>
      <body>${pages.join("")}</body>
    </html>`;
}

export function DailyLogPage() {
  const router = useRouter();
  const [referenceDate, setReferenceDate] = useState(todayAsInputValue());
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [externalResources, setExternalResources] = useState<ExternalResourceOption[]>([]);
  const [internalRows, setInternalRows] = useState<InternalEditableRow[]>([
    makeEmptyInternalRow(),
    makeEmptyInternalRow(),
    makeEmptyInternalRow(),
  ]);
  const [externalRows, setExternalRows] = useState<ExternalEditableRow[]>([
    makeEmptyExternalRow(),
    makeEmptyExternalRow(),
  ]);
  const [externalEconomyRows, setExternalEconomyRows] = useState<ExternalEconomyEditableRow[]>([
    makeEmptyExternalEconomyRow(),
  ]);
  const [externalResourceDraft, setExternalResourceDraft] = useState("");
  const [showExternalResourceManager, setShowExternalResourceManager] = useState(false);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [materialsDialogOpen, setMaterialsDialogOpen] = useState(false);
  const [deliveryNotesDialogOpen, setDeliveryNotesDialogOpen] = useState(false);
  const [selectedMaterialJobOrderId, setSelectedMaterialJobOrderId] = useState("");
  const [selectedDeliveryNoteJobOrderId, setSelectedDeliveryNoteJobOrderId] = useState("");
  const [materialRows, setMaterialRows] = useState<MaterialUsageRow[]>([]);
  const [materialSuggestions, setMaterialSuggestions] = useState<string[]>([]);
  const [materialUnitSuggestions, setMaterialUnitSuggestions] = useState<string[]>([]);
  const [deliveryNoteRows, setDeliveryNoteRows] = useState<DeliveryNoteRow[]>([]);
  const [deliveryNoteSupplierSuggestions, setDeliveryNoteSupplierSuggestions] = useState<string[]>([]);
  const [deliveryNoteDescriptionSuggestions, setDeliveryNoteDescriptionSuggestions] = useState<string[]>([]);
  const [materialForm, setMaterialForm] = useState<MaterialFormState>({
    description: "",
    usageDate: todayAsInputValue(),
    unitOfMeasure: "",
    quantity: "",
  });
  const [deliveryNoteForm, setDeliveryNoteForm] = useState<DeliveryNoteFormState>({
    supplier: "",
    description: "",
    usageDate: todayAsInputValue(),
  });
  const [editingMaterialId, setEditingMaterialId] = useState("");
  const [editingDeliveryNoteId, setEditingDeliveryNoteId] = useState("");
  const [materialEditForm, setMaterialEditForm] = useState<MaterialFormState>({
    description: "",
    usageDate: todayAsInputValue(),
    unitOfMeasure: "",
    quantity: "",
  });
  const [deliveryNoteEditForm, setDeliveryNoteEditForm] = useState<DeliveryNoteFormState>({
    supplier: "",
    description: "",
    usageDate: todayAsInputValue(),
  });
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [deliveryNotesLoading, setDeliveryNotesLoading] = useState(false);
  const [deliveryNotesSaving, setDeliveryNotesSaving] = useState(false);
  const [printLoading, setPrintLoading] = useState(false);
  const [printPreviewDays, setPrintPreviewDays] = useState<PrintDay[]>([]);
  const printPreviewRequestRef = useRef(0);
  const [printOptions, setPrintOptions] = useState<PrintOptions>({
    mode: "single",
    singleDate: referenceDate,
    selectedDates: [],
    rangeFrom: referenceDate,
    rangeTo: referenceDate,
    onlyCompiled: true,
    includeInternal: true,
    includeExternal: true,
    includeTotals: true,
    includeDescriptions: true,
  });
  const [printDateDraft, setPrintDateDraft] = useState(referenceDate);

  const [loading, setLoading] = useState(true);
  const [loadingRows, setLoadingRows] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingExternalResource, setSavingExternalResource] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function resourceLabel(value: string) {
    return resources.find((resource) => resource.value === value)?.label ?? "";
  }

  function jobOrderLabel(id: string) {
    return jobOrders.find((jobOrder) => jobOrder.id === id)?.name ?? "";
  }

  function externalResourceLabel(id: string) {
    return externalResources.find((resource) => resource.id === id)?.name ?? "";
  }

  function hydrateInternalRows(rows: InternalEditableRow[]) {
    return rows.map((row) => ({
      ...row,
      resourceLabel: row.resourceLabel || resourceLabel(row.resourceValue),
      jobOrderLabel: row.jobOrderLabel || jobOrderLabel(row.jobOrderId),
    }));
  }

  function hydrateExternalRows(rows: ExternalEditableRow[]) {
    return rows.map((row) => ({
      ...row,
      externalResourceLabel: row.externalResourceLabel || externalResourceLabel(row.externalResourceId),
      jobOrderLabel: row.jobOrderLabel || jobOrderLabel(row.jobOrderId),
    }));
  }

  function hydrateExternalEconomyRows(rows: ExternalEconomyEditableRow[]) {
    return rows.map((row) => ({
      ...row,
      externalResourceLabel: row.externalResourceLabel || externalResourceLabel(row.externalResourceId),
      jobOrderLabel: row.jobOrderLabel || jobOrderLabel(row.jobOrderId),
    }));
  }

  function currentPrintDay(): PrintDay {
    return {
      date: referenceDate,
      internalRows: hydrateInternalRows(internalRows),
      externalRows: hydrateExternalRows(externalRows),
      externalEconomyRows: hydrateExternalEconomyRows(externalEconomyRows),
    };
  }

  function setInternalRowValue(localId: string, patch: Partial<InternalEditableRow>) {
    setInternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function setExternalRowValue(localId: string, patch: Partial<ExternalEditableRow>) {
    setExternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function setExternalEconomyRowValue(localId: string, patch: Partial<ExternalEconomyEditableRow>) {
    setExternalEconomyRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function addInternalRow() {
    setInternalRows((current) => [...current, makeEmptyInternalRow()]);
  }

  function addExternalRow() {
    setExternalRows((current) => [...current, makeEmptyExternalRow()]);
  }

  function addExternalEconomyRow() {
    setExternalEconomyRows((current) => [...current, makeEmptyExternalEconomyRow()]);
  }

  function copyInternalDescriptionFromPrevious(index: number) {
    setInternalRows((current) => {
      const previousDescription = current[index - 1]?.activityDescription ?? "";
      return current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, activityDescription: previousDescription } : row
      );
    });
  }

  function copyExternalDescriptionFromPrevious(index: number) {
    setExternalRows((current) => {
      const previousDescription = current[index - 1]?.activityDescription ?? "";
      return current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, activityDescription: previousDescription } : row
      );
    });
  }

  function copyExternalEconomyDescriptionFromPrevious(index: number) {
    setExternalEconomyRows((current) => {
      const previousDescription = current[index - 1]?.activityDescription ?? "";
      return current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, activityDescription: previousDescription } : row
      );
    });
  }

  function removeInternalRow(localId: string) {
    setInternalRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyInternalRow()];
    });
  }

  function removeExternalRow(localId: string) {
    setExternalRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyExternalRow()];
    });
  }

  function removeExternalEconomyRow(localId: string) {
    setExternalEconomyRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyExternalEconomyRow()];
    });
  }

  async function loadOptions() {
    const data = await safeJsonFetch("/api/diario/options");
    setResources(data.resources ?? []);
    setJobOrders(data.jobOrders ?? []);
    setExternalResources(data.externalResources ?? []);
  }

  async function fetchRowsForDate(date: string) {
    const data = await safeJsonFetch(`/api/diario/batch?date=${date}`);

    const loadedInternalRows: InternalEditableRow[] =
      !data.internalRows || data.internalRows.length === 0
        ? []
        : data.internalRows.map((row: any) => ({
            localId: crypto.randomUUID(),
            resourceValue: row.resourceValue ?? "",
            resourceLabel: row.resourceLabel ?? "",
            jobOrderId: row.jobOrderId ?? "",
            jobOrderLabel: row.jobOrderLabel ?? "",
            hours: row.hours?.toString() ?? "",
            activityDescription: row.activityDescription ?? "",
          }));

    const loadedExternalRows: ExternalEditableRow[] =
      !data.externalRows || data.externalRows.length === 0
        ? []
        : data.externalRows.map((row: any) => ({
            localId: crypto.randomUUID(),
            externalResourceId: row.externalResourceId ?? "",
            externalResourceLabel: row.externalResourceLabel ?? "",
            jobOrderId: row.jobOrderId ?? "",
            jobOrderLabel: row.jobOrderLabel ?? "",
            days: row.days?.toString() ?? "",
            activityDescription: row.activityDescription ?? "",
          }));

    const loadedExternalEconomyRows: ExternalEconomyEditableRow[] =
      !data.externalEconomyRows || data.externalEconomyRows.length === 0
        ? []
        : data.externalEconomyRows.map((row: any) => ({
            localId: crypto.randomUUID(),
            externalResourceId: row.externalResourceId ?? "",
            externalResourceLabel: row.externalResourceLabel ?? "",
            jobOrderId: row.jobOrderId ?? "",
            jobOrderLabel: row.jobOrderLabel ?? "",
            hours: row.hours?.toString() ?? "",
            activityDescription: row.activityDescription ?? "",
          }));

    return { internalRows: loadedInternalRows, externalRows: loadedExternalRows, externalEconomyRows: loadedExternalEconomyRows };
  }

  async function loadRows(date: string) {
    setLoadingRows(true);

    try {
      const data = await fetchRowsForDate(date);
      setInternalRows(
        data.internalRows.length === 0
          ? [makeEmptyInternalRow(), makeEmptyInternalRow(), makeEmptyInternalRow()]
          : data.internalRows
      );
      setExternalRows(
        data.externalRows.length === 0
          ? [makeEmptyExternalRow(), makeEmptyExternalRow()]
          : data.externalRows
      );
      setExternalEconomyRows(
        data.externalEconomyRows.length === 0
          ? [makeEmptyExternalEconomyRow()]
          : data.externalEconomyRows
      );
    } finally {
      setLoadingRows(false);
    }
  }

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError("");

      try {
        await loadOptions();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento opzioni");
      } finally {
        setLoading(false);
      }
    }

    void init();
  }, []);

  useEffect(() => {
    async function refreshRows() {
      setError("");

      try {
        await loadRows(referenceDate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore nel caricamento attivita");
      }
    }

    void refreshRows();
  }, [referenceDate]);

  useEffect(() => {
    setPrintOptions((current) => ({
      ...current,
      rangeFrom: current.rangeFrom || referenceDate,
      rangeTo: current.rangeTo || referenceDate,
    }));
    setPrintDateDraft(referenceDate);
  }, [referenceDate]);

  async function handleSave(redirectAfterSave = false) {
    setSaving(true);
    setMessage("");
    setError("");

    try {
      const data = await safeJsonFetch("/api/diario/batch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          referenceDate,
          internalRows: internalRows.map((row) => ({
            resourceValue: row.resourceValue,
            jobOrderId: row.jobOrderId,
            hours: row.hours,
            activityDescription: row.activityDescription,
          })),
          externalRows: externalRows.map((row) => ({
            externalResourceId: row.externalResourceId,
            jobOrderId: row.jobOrderId,
            days: row.days,
            activityDescription: row.activityDescription,
          })),
          externalEconomyRows: externalEconomyRows.map((row) => ({
            externalResourceId: row.externalResourceId,
            jobOrderId: row.jobOrderId,
            hours: row.hours,
            activityDescription: row.activityDescription,
          })),
        }),
      });

      setMessage(
        `Salvataggio completato. Interne: ${data.savedInternalRows}. Subappalto: ${data.savedExternalRows}. Economia: ${data.savedExternalEconomyRows ?? 0}.`
      );
      await loadRows(referenceDate);
      if (redirectAfterSave) {
        router.push("/dashboard");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicatePreviousDay() {
    setLoadingRows(true);
    setError("");

    try {
      const previousDate = shiftDate(referenceDate, -1);
      const data = await fetchRowsForDate(previousDate);
      setInternalRows(
        data.internalRows.length === 0
          ? [makeEmptyInternalRow(), makeEmptyInternalRow(), makeEmptyInternalRow()]
          : data.internalRows.map((row) => ({ ...row, localId: crypto.randomUUID() }))
      );
      setExternalRows(
        data.externalRows.length === 0
          ? [makeEmptyExternalRow(), makeEmptyExternalRow()]
          : data.externalRows.map((row) => ({ ...row, localId: crypto.randomUUID() }))
      );
      setExternalEconomyRows(
        data.externalEconomyRows.length === 0
          ? [makeEmptyExternalEconomyRow()]
          : data.externalEconomyRows.map((row) => ({ ...row, localId: crypto.randomUUID() }))
      );
      setMessage(`Righe duplicate dal ${formatItalianShortDate(previousDate)}. Ricordati di salvare il diario.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella duplicazione del giorno precedente");
    } finally {
      setLoadingRows(false);
    }
  }

  async function handleAddExternalResource() {
    if (!externalResourceDraft.trim()) return;

    setSavingExternalResource(true);
    setError("");

    try {
      const data = await safeJsonFetch("/api/diario/external-resources", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: externalResourceDraft }),
      });

      setExternalResources((current) =>
        [...current, data.resource].sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }))
      );
      setExternalResourceDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio risorsa esterna");
    } finally {
      setSavingExternalResource(false);
    }
  }

  async function handleDeleteExternalResource(id: string) {
    setError("");

    try {
      await safeJsonFetch(`/api/diario/external-resources?id=${id}`, { method: "DELETE" });
      setExternalResources((current) => current.filter((resource) => resource.id !== id));
      setExternalRows((current) =>
        current.map((row) => (row.externalResourceId === id ? { ...row, externalResourceId: "" } : row))
      );
      setExternalEconomyRows((current) =>
        current.map((row) => (row.externalResourceId === id ? { ...row, externalResourceId: "" } : row))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nella rimozione risorsa esterna");
    }
  }

  async function loadMaterialRows(jobOrderId: string) {
    setMaterialsLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch(`/api/diario/materiali${jobOrderId ? `?jobOrderId=${jobOrderId}` : ""}`);
      setMaterialRows(data.rows ?? []);
      setMaterialSuggestions(data.suggestions ?? []);
      setMaterialUnitSuggestions(data.unitSuggestions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento materiali");
    } finally {
      setMaterialsLoading(false);
    }
  }

  function openMaterialsDialog() {
    const initialJobOrderId = selectedMaterialJobOrderId || "";
    setMaterialsDialogOpen(true);
    setSelectedMaterialJobOrderId(initialJobOrderId);
    setMaterialForm({
      description: "",
      usageDate: todayAsInputValue(),
      unitOfMeasure: "",
      quantity: "",
    });
    setEditingMaterialId("");
    void loadMaterialRows(initialJobOrderId);
  }

  function changeMaterialJobOrder(jobOrderId: string) {
    setSelectedMaterialJobOrderId(jobOrderId);
    setEditingMaterialId("");
    void loadMaterialRows(jobOrderId);
  }

  async function handleSaveMaterial() {
    if (!selectedMaterialJobOrderId) {
      setError("Seleziona una commessa per registrare il materiale.");
      return;
    }

    setMaterialsSaving(true);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch("/api/diario/materiali", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobOrderId: selectedMaterialJobOrderId,
          ...materialForm,
        }),
      });

      setMaterialForm({
        description: "",
        usageDate: todayAsInputValue(),
        unitOfMeasure: materialForm.unitOfMeasure,
        quantity: "",
      });
      setMessage("Materiale salvato nel diario.");
      await loadMaterialRows(selectedMaterialJobOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio materiale");
    } finally {
      setMaterialsSaving(false);
    }
  }

  function startEditMaterial(row: MaterialUsageRow) {
    setEditingMaterialId(row.id);
    setMaterialEditForm({
      description: row.description,
      usageDate: row.usageDate,
      unitOfMeasure: row.unitOfMeasure,
      quantity: row.quantity.toString(),
    });
  }

  async function handleUpdateMaterial() {
    if (!editingMaterialId || !selectedMaterialJobOrderId) return;

    setMaterialsSaving(true);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/diario/materiali/${editingMaterialId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobOrderId: selectedMaterialJobOrderId,
          ...materialEditForm,
        }),
      });
      setEditingMaterialId("");
      setMessage("Materiale aggiornato.");
      await loadMaterialRows(selectedMaterialJobOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'aggiornamento materiale");
    } finally {
      setMaterialsSaving(false);
    }
  }

  async function handleDeleteMaterial(row: MaterialUsageRow) {
    if (!selectedMaterialJobOrderId) return;
    const confirmed = window.confirm(`Eliminare il materiale "${row.description}" del ${formatItalianShortDate(row.usageDate)}?`);
    if (!confirmed) return;

    setMaterialsSaving(true);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/diario/materiali/${row.id}`, { method: "DELETE" });
      if (editingMaterialId === row.id) {
        setEditingMaterialId("");
      }
      setMessage("Materiale eliminato.");
      await loadMaterialRows(selectedMaterialJobOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'eliminazione materiale");
    } finally {
      setMaterialsSaving(false);
    }
  }

  async function loadDeliveryNoteRows(jobOrderId: string) {
    setDeliveryNotesLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch(`/api/diario/bolle${jobOrderId ? `?jobOrderId=${jobOrderId}` : ""}`);
      setDeliveryNoteRows(data.rows ?? []);
      setDeliveryNoteSupplierSuggestions(data.supplierSuggestions ?? []);
      setDeliveryNoteDescriptionSuggestions(data.descriptionSuggestions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento bolle");
    } finally {
      setDeliveryNotesLoading(false);
    }
  }

  function openDeliveryNotesDialog() {
    const initialJobOrderId = selectedDeliveryNoteJobOrderId || "";
    setDeliveryNotesDialogOpen(true);
    setSelectedDeliveryNoteJobOrderId(initialJobOrderId);
    setDeliveryNoteForm({
      supplier: "",
      description: "",
      usageDate: todayAsInputValue(),
    });
    setEditingDeliveryNoteId("");
    void loadDeliveryNoteRows(initialJobOrderId);
  }

  function changeDeliveryNoteJobOrder(jobOrderId: string) {
    setSelectedDeliveryNoteJobOrderId(jobOrderId);
    setEditingDeliveryNoteId("");
    void loadDeliveryNoteRows(jobOrderId);
  }

  async function handleSaveDeliveryNote() {
    if (!selectedDeliveryNoteJobOrderId) {
      setError("Seleziona una commessa per registrare la bolla.");
      return;
    }

    setDeliveryNotesSaving(true);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch("/api/diario/bolle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobOrderId: selectedDeliveryNoteJobOrderId,
          ...deliveryNoteForm,
        }),
      });

      setDeliveryNoteForm({
        supplier: "",
        description: "",
        usageDate: todayAsInputValue(),
      });
      setMessage("Bolla di cantiere salvata.");
      await loadDeliveryNoteRows(selectedDeliveryNoteJobOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel salvataggio bolla");
    } finally {
      setDeliveryNotesSaving(false);
    }
  }

  function startEditDeliveryNote(row: DeliveryNoteRow) {
    setEditingDeliveryNoteId(row.id);
    setDeliveryNoteEditForm({
      supplier: row.supplier,
      description: row.description,
      usageDate: row.usageDate,
    });
  }

  async function handleUpdateDeliveryNote() {
    if (!editingDeliveryNoteId || !selectedDeliveryNoteJobOrderId) return;

    setDeliveryNotesSaving(true);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/diario/bolle/${editingDeliveryNoteId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobOrderId: selectedDeliveryNoteJobOrderId,
          ...deliveryNoteEditForm,
        }),
      });
      setEditingDeliveryNoteId("");
      setMessage("Bolla di cantiere aggiornata.");
      await loadDeliveryNoteRows(selectedDeliveryNoteJobOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'aggiornamento bolla");
    } finally {
      setDeliveryNotesSaving(false);
    }
  }

  async function handleDeleteDeliveryNote(row: DeliveryNoteRow) {
    if (!selectedDeliveryNoteJobOrderId) return;
    const confirmed = window.confirm(`Eliminare la bolla di "${row.supplier}" del ${formatItalianShortDate(row.usageDate)}?`);
    if (!confirmed) return;

    setDeliveryNotesSaving(true);
    setError("");
    setMessage("");

    try {
      await safeJsonFetch(`/api/diario/bolle/${row.id}`, { method: "DELETE" });
      if (editingDeliveryNoteId === row.id) {
        setEditingDeliveryNoteId("");
      }
      setMessage("Bolla di cantiere eliminata.");
      await loadDeliveryNoteRows(selectedDeliveryNoteJobOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nell'eliminazione bolla");
    } finally {
      setDeliveryNotesSaving(false);
    }
  }

  const totalInternalHours = useMemo(() => sumNumericStrings(internalRows.map((row) => row.hours)), [internalRows]);
  const totalExternalDays = useMemo(() => sumNumericStrings(externalRows.map((row) => row.days)), [externalRows]);
  const totalExternalEconomyHours = useMemo(
    () => sumNumericStrings(externalEconomyRows.map((row) => row.hours)),
    [externalEconomyRows]
  );

  const completedInternalRows = useMemo(
    () => internalRows.filter((row) => row.resourceValue.trim() && row.jobOrderId.trim() && row.hours.trim()).length,
    [internalRows]
  );

  const completedExternalRows = useMemo(
    () => externalRows.filter((row) => row.externalResourceId.trim() && row.jobOrderId.trim() && row.days.trim()).length,
    [externalRows]
  );

  const completedExternalEconomyRows = useMemo(
    () => externalEconomyRows.filter((row) => row.externalResourceId.trim() && row.jobOrderId.trim() && row.hours.trim()).length,
    [externalEconomyRows]
  );

  async function buildPrintDays(options = printOptions) {
    if (options.mode === "single") {
      const selectedDate = options.singleDate || referenceDate;
      if (selectedDate === referenceDate) return [currentPrintDay()];

      const rows = await fetchRowsForDate(selectedDate);
      return [
        {
          date: selectedDate,
          internalRows: rows.internalRows,
          externalRows: rows.externalRows,
          externalEconomyRows: rows.externalEconomyRows,
        },
      ];
    }

    const hasSelectedDates = options.selectedDates.length > 0;
    const hasOnlyDefaultRange = options.rangeFrom === referenceDate && options.rangeTo === referenceDate;
    const rangeDates = hasSelectedDates && hasOnlyDefaultRange ? [] : enumerateDateRange(options.rangeFrom, options.rangeTo);
    const uniqueDates = [...new Set([...options.selectedDates, ...rangeDates])].sort();
    const dates = uniqueDates.length > 0 ? uniqueDates : [referenceDate];
    const days: PrintDay[] = [];

    for (const date of dates) {
      if (date === referenceDate) {
        days.push(currentPrintDay());
        continue;
      }

      const rows = await fetchRowsForDate(date);
      const day = {
        date,
        internalRows: rows.internalRows,
        externalRows: rows.externalRows,
        externalEconomyRows: rows.externalEconomyRows,
      };
      if (!options.onlyCompiled || rows.internalRows.length > 0 || rows.externalRows.length > 0 || rows.externalEconomyRows.length > 0) {
        days.push(day);
      }
    }

    return days.filter(
      (day) => !options.onlyCompiled || day.internalRows.length > 0 || day.externalRows.length > 0 || day.externalEconomyRows.length > 0
    );
  }

  async function refreshPrintPreview(options = printOptions) {
    const requestId = printPreviewRequestRef.current + 1;
    printPreviewRequestRef.current = requestId;
    setPrintLoading(true);
    setError("");

    try {
      const days = await buildPrintDays(options);
      if (requestId === printPreviewRequestRef.current) {
        setPrintPreviewDays(days);
      }
    } catch (err) {
      if (requestId === printPreviewRequestRef.current) {
        setError(err instanceof Error ? err.message : "Errore nella preparazione della stampa");
      }
    } finally {
      if (requestId === printPreviewRequestRef.current) {
        setPrintLoading(false);
      }
    }
  }

  function openPrintDialog() {
    setPrintDialogOpen(true);
    const nextOptions = {
      ...printOptions,
      singleDate: referenceDate,
      selectedDates: [],
      rangeFrom: referenceDate,
      rangeTo: referenceDate,
    };
    setPrintOptions(nextOptions);
    void refreshPrintPreview(nextOptions);
  }

  async function handlePrint() {
    const days = printPreviewDays.length > 0 ? printPreviewDays : await buildPrintDays();
    if (days.length === 0) {
      setError("Nessun giorno da stampare con i filtri selezionati.");
      return;
    }

    const printWindow = window.open("", "_blank", "width=1200,height=900");
    if (!printWindow) {
      setError("Popup bloccato dal browser. Consenti i popup per stampare il PDF.");
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(days, printOptions));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function updatePrintOptions(patch: Partial<PrintOptions>) {
    const nextOptions = { ...printOptions, ...patch };
    if (patch.mode === "single") {
      nextOptions.singleDate = nextOptions.singleDate || referenceDate;
      nextOptions.selectedDates = [];
    }
    if (patch.mode === "multi") {
      nextOptions.selectedDates = [];
    }
    setPrintOptions(nextOptions);
    void refreshPrintPreview(nextOptions);
  }

  function addPrintDate() {
    if (!printDateDraft) return;
    const selectedDates = [...new Set([...printOptions.selectedDates, printDateDraft])].sort();
    updatePrintOptions({ selectedDates });
  }

  return (
    <div className="diary-page diary-workspace-page">
      <section className="diary-workspace-shell">
        <DailyLogHeader onPrint={openPrintDialog} />

        <DailyLogDateCard
          referenceDate={referenceDate}
          onDateChange={setReferenceDate}
          onToday={() => setReferenceDate(todayAsInputValue())}
          onDuplicatePreviousDay={handleDuplicatePreviousDay}
          loadingRows={loadingRows}
        />

        <DailyLogStatsBar
          completedInternalRows={completedInternalRows}
          totalInternalHours={totalInternalHours}
          completedExternalRows={completedExternalRows}
          totalExternalDays={totalExternalDays}
          completedExternalEconomyRows={completedExternalEconomyRows}
          totalExternalEconomyHours={totalExternalEconomyHours}
        />

        <div className="diary-workspace-shortcuts">
          <button className="button" type="button" onClick={openMaterialsDialog}>Diario dei Materiali</button>
          <button className="button" type="button" onClick={openDeliveryNotesDialog}>Diario Bolle di Cantiere</button>
          <button className="mobile-button-secondary" type="button" onClick={() => router.push("/risorse")}>Risorse</button>
          <button className="mobile-button-secondary" type="button" onClick={() => router.push("/commesse")}>Commesse</button>
          <button className="mobile-button-secondary" type="button" onClick={() => router.push("/dashboard-commessa")}>Dashboard commessa</button>
        </div>

        {message ? <div className="scad-success">{message}</div> : null}
        {error ? <div className="scad-error">{error}</div> : null}

        <InternalResourcesSection
          rows={internalRows}
          resources={resources}
          jobOrders={jobOrders}
          loading={loading}
          loadingRows={loadingRows}
          onAddRow={addInternalRow}
          onCopyPreviousDescription={copyInternalDescriptionFromPrevious}
          onRemoveRow={removeInternalRow}
          onChangeRow={setInternalRowValue}
        />

        <ExternalResourcesSection
          rows={externalRows}
          economyRows={externalEconomyRows}
          externalResources={externalResources}
          jobOrders={jobOrders}
          loading={loading}
          loadingRows={loadingRows}
          externalResourceDraft={externalResourceDraft}
          showExternalResourceManager={showExternalResourceManager}
          savingExternalResource={savingExternalResource}
          onAddRow={addExternalRow}
          onAddEconomyRow={addExternalEconomyRow}
          onCopyPreviousDescription={copyExternalDescriptionFromPrevious}
          onCopyPreviousEconomyDescription={copyExternalEconomyDescriptionFromPrevious}
          onRemoveRow={removeExternalRow}
          onRemoveEconomyRow={removeExternalEconomyRow}
          onChangeRow={setExternalRowValue}
          onChangeEconomyRow={setExternalEconomyRowValue}
          onToggleManager={() => setShowExternalResourceManager((current) => !current)}
          onDraftChange={setExternalResourceDraft}
          onAddExternalResource={handleAddExternalResource}
          onDeleteExternalResource={handleDeleteExternalResource}
        />

        <div className="diary-sticky-actions">
          <div>
            <strong>{formatItalianShortDate(referenceDate)}</strong>
            <span>{completedInternalRows + completedExternalRows + completedExternalEconomyRows} righe compilate</span>
          </div>
          <div>
            <button className="mobile-button-secondary" type="button" onClick={openPrintDialog}>Stampa PDF</button>
            <button className="mobile-button-secondary" type="button" onClick={() => void handleSave(true)} disabled={saving || loading}>
              Salva e chiudi
            </button>
            <button className="button" type="button" onClick={() => void handleSave()} disabled={saving || loading}>
              {saving ? "Salvataggio..." : "Salva diario"}
            </button>
          </div>
        </div>
      </section>

      {printDialogOpen ? (
        <DailyLogPrintDialog
          options={printOptions}
          printDateDraft={printDateDraft}
          previewDays={printPreviewDays}
          loading={printLoading}
          onClose={() => setPrintDialogOpen(false)}
          onOptionsChange={updatePrintOptions}
          onPrintDateDraftChange={setPrintDateDraft}
          onAddPrintDate={addPrintDate}
          onRemovePrintDate={(date) =>
            updatePrintOptions({ selectedDates: printOptions.selectedDates.filter((selectedDate) => selectedDate !== date) })
          }
          onPrint={() => void handlePrint()}
        />
      ) : null}

      {materialsDialogOpen ? (
        <MaterialDiaryDialog
          jobOrders={jobOrders}
          selectedJobOrderId={selectedMaterialJobOrderId}
          rows={materialRows}
          form={materialForm}
          editForm={materialEditForm}
          editingId={editingMaterialId}
          materialSuggestions={materialSuggestions}
          unitSuggestions={materialUnitSuggestions}
          loading={materialsLoading}
          saving={materialsSaving}
          onClose={() => setMaterialsDialogOpen(false)}
          onJobOrderChange={changeMaterialJobOrder}
          onFormChange={(patch) => setMaterialForm((current) => ({ ...current, ...patch }))}
          onEditFormChange={(patch) => setMaterialEditForm((current) => ({ ...current, ...patch }))}
          onSave={() => void handleSaveMaterial()}
          onStartEdit={startEditMaterial}
          onCancelEdit={() => setEditingMaterialId("")}
          onUpdate={() => void handleUpdateMaterial()}
          onDelete={(row) => void handleDeleteMaterial(row)}
        />
      ) : null}

      {deliveryNotesDialogOpen ? (
        <DeliveryNotesDiaryDialog
          jobOrders={jobOrders}
          selectedJobOrderId={selectedDeliveryNoteJobOrderId}
          rows={deliveryNoteRows}
          form={deliveryNoteForm}
          editForm={deliveryNoteEditForm}
          editingId={editingDeliveryNoteId}
          supplierSuggestions={deliveryNoteSupplierSuggestions}
          descriptionSuggestions={deliveryNoteDescriptionSuggestions}
          loading={deliveryNotesLoading}
          saving={deliveryNotesSaving}
          onClose={() => setDeliveryNotesDialogOpen(false)}
          onJobOrderChange={changeDeliveryNoteJobOrder}
          onFormChange={(patch) => setDeliveryNoteForm((current) => ({ ...current, ...patch }))}
          onEditFormChange={(patch) => setDeliveryNoteEditForm((current) => ({ ...current, ...patch }))}
          onSave={() => void handleSaveDeliveryNote()}
          onStartEdit={startEditDeliveryNote}
          onCancelEdit={() => setEditingDeliveryNoteId("")}
          onUpdate={() => void handleUpdateDeliveryNote()}
          onDelete={(row) => void handleDeleteDeliveryNote(row)}
        />
      ) : null}
    </div>
  );
}

function formatMaterialQuantity(value: number) {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function MaterialDiaryDialog({
  jobOrders,
  selectedJobOrderId,
  rows,
  form,
  editForm,
  editingId,
  materialSuggestions,
  unitSuggestions,
  loading,
  saving,
  onClose,
  onJobOrderChange,
  onFormChange,
  onEditFormChange,
  onSave,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  jobOrders: JobOrderOption[];
  selectedJobOrderId: string;
  rows: MaterialUsageRow[];
  form: MaterialFormState;
  editForm: MaterialFormState;
  editingId: string;
  materialSuggestions: string[];
  unitSuggestions: string[];
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onJobOrderChange: (jobOrderId: string) => void;
  onFormChange: (patch: Partial<MaterialFormState>) => void;
  onEditFormChange: (patch: Partial<MaterialFormState>) => void;
  onSave: () => void;
  onStartEdit: (row: MaterialUsageRow) => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onDelete: (row: MaterialUsageRow) => void;
}) {
  return (
    <div className="diary-print-backdrop" role="dialog" aria-modal="true">
      <section className="diary-print-dialog material-diary-dialog">
        <header className="diary-print-dialog-head">
          <div>
            <p className="dashboard-kicker">Diario materiali</p>
            <h2>Materiali utilizzati</h2>
            <p>Registra materiali liberi e riusa le descrizioni gia inserite.</p>
          </div>
          <button type="button" className="mobile-button-secondary" onClick={onClose}>Chiudi</button>
        </header>

        <div className="material-diary-body">
          <label className="material-diary-field material-diary-field-wide">
            <span>Commessa</span>
            <select value={selectedJobOrderId} onChange={(event) => onJobOrderChange(event.target.value)}>
              <option value="">Seleziona commessa</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name} ({jobOrder.type})
                </option>
              ))}
            </select>
          </label>

          {selectedJobOrderId ? (
            <>
              <div className="material-diary-form">
                <label className="material-diary-field material-diary-field-wide">
                  <span>Descrizione Materiale</span>
                  <input
                    list="material-diary-suggestions"
                    type="text"
                    value={form.description}
                    onChange={(event) => onFormChange({ description: event.target.value })}
                    placeholder="Es. cemento, ferro, tubazioni"
                  />
                </label>
                <label className="material-diary-field">
                  <span>Data</span>
                  <input type="date" value={form.usageDate} onChange={(event) => onFormChange({ usageDate: event.target.value })} />
                </label>
                <label className="material-diary-field">
                  <span>Unita di Misura</span>
                  <input
                    list="material-unit-suggestions"
                    type="text"
                    value={form.unitOfMeasure}
                    onChange={(event) => onFormChange({ unitOfMeasure: event.target.value })}
                    placeholder="kg, m, pz"
                  />
                </label>
                <label className="material-diary-field">
                  <span>Quantita</span>
                  <input type="number" min="0" step="0.001" value={form.quantity} onChange={(event) => onFormChange({ quantity: event.target.value })} placeholder="0" />
                </label>
                <div className="material-diary-save">
                  <button type="button" className="button" onClick={onSave} disabled={saving}>
                    {saving ? "Salvataggio..." : "Salva materiale"}
                  </button>
                </div>
              </div>

              <datalist id="material-diary-suggestions">
                {materialSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>
              <datalist id="material-unit-suggestions">
                {unitSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>

              <div className="material-diary-table-wrap">
                <table className="material-diary-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Materiale</th>
                      <th>Unita</th>
                      <th>Quantita</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5}>Caricamento materiali...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={5}>Nessun materiale inserito per questa commessa.</td></tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          {editingId === row.id ? (
                            <>
                              <td><input type="date" value={editForm.usageDate} onChange={(event) => onEditFormChange({ usageDate: event.target.value })} /></td>
                              <td><input list="material-diary-suggestions" value={editForm.description} onChange={(event) => onEditFormChange({ description: event.target.value })} /></td>
                              <td><input list="material-unit-suggestions" value={editForm.unitOfMeasure} onChange={(event) => onEditFormChange({ unitOfMeasure: event.target.value })} /></td>
                              <td><input type="number" min="0" step="0.001" value={editForm.quantity} onChange={(event) => onEditFormChange({ quantity: event.target.value })} /></td>
                              <td>
                                <div className="material-diary-row-actions">
                                  <button type="button" onClick={onUpdate} disabled={saving}>Salva</button>
                                  <button type="button" onClick={onCancelEdit}>Annulla</button>
                                  <button type="button" className="material-diary-delete-button" onClick={() => onDelete(row)} disabled={saving}>Elimina</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{formatItalianShortDate(row.usageDate)}</td>
                              <td><strong>{row.description}</strong></td>
                              <td>{row.unitOfMeasure}</td>
                              <td>{formatMaterialQuantity(row.quantity)}</td>
                              <td>
                                <div className="material-diary-row-actions">
                                  <button type="button" className="material-diary-edit-button" onClick={() => onStartEdit(row)}>
                                    Modifica
                                  </button>
                                  <button type="button" className="material-diary-delete-button" onClick={() => onDelete(row)} disabled={saving}>
                                    Elimina
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="job-premium-empty-state">Scegli una commessa per inserire e consultare i materiali usati.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function DeliveryNotesDiaryDialog({
  jobOrders,
  selectedJobOrderId,
  rows,
  form,
  editForm,
  editingId,
  supplierSuggestions,
  descriptionSuggestions,
  loading,
  saving,
  onClose,
  onJobOrderChange,
  onFormChange,
  onEditFormChange,
  onSave,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
}: {
  jobOrders: JobOrderOption[];
  selectedJobOrderId: string;
  rows: DeliveryNoteRow[];
  form: DeliveryNoteFormState;
  editForm: DeliveryNoteFormState;
  editingId: string;
  supplierSuggestions: string[];
  descriptionSuggestions: string[];
  loading: boolean;
  saving: boolean;
  onClose: () => void;
  onJobOrderChange: (jobOrderId: string) => void;
  onFormChange: (patch: Partial<DeliveryNoteFormState>) => void;
  onEditFormChange: (patch: Partial<DeliveryNoteFormState>) => void;
  onSave: () => void;
  onStartEdit: (row: DeliveryNoteRow) => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onDelete: (row: DeliveryNoteRow) => void;
}) {
  return (
    <div className="diary-print-backdrop" role="dialog" aria-modal="true">
      <section className="diary-print-dialog material-diary-dialog">
        <header className="diary-print-dialog-head">
          <div>
            <p className="dashboard-kicker">Diario bolle</p>
            <h2>Bolle di cantiere</h2>
            <p>Registra bolle per commessa e riusa fornitore e descrizione gia inseriti.</p>
          </div>
          <button type="button" className="mobile-button-secondary" onClick={onClose}>Chiudi</button>
        </header>

        <div className="material-diary-body">
          <label className="material-diary-field material-diary-field-wide">
            <span>Commessa</span>
            <select value={selectedJobOrderId} onChange={(event) => onJobOrderChange(event.target.value)}>
              <option value="">Seleziona commessa</option>
              {jobOrders.map((jobOrder) => (
                <option key={jobOrder.id} value={jobOrder.id}>
                  {jobOrder.name} ({jobOrder.type})
                </option>
              ))}
            </select>
          </label>

          {selectedJobOrderId ? (
            <>
              <div className="material-diary-form delivery-note-diary-form">
                <label className="material-diary-field">
                  <span>Fornitore</span>
                  <input
                    list="delivery-note-supplier-suggestions"
                    type="text"
                    value={form.supplier}
                    onChange={(event) => onFormChange({ supplier: event.target.value })}
                    placeholder="Es. Rossi Srl"
                  />
                </label>
                <label className="material-diary-field">
                  <span>Data</span>
                  <input type="date" value={form.usageDate} onChange={(event) => onFormChange({ usageDate: event.target.value })} />
                </label>
                <label className="material-diary-field material-diary-field-wide">
                  <span>Descrizione</span>
                  <input
                    list="delivery-note-description-suggestions"
                    type="text"
                    value={form.description}
                    onChange={(event) => onFormChange({ description: event.target.value })}
                    placeholder="Es. Bolla DDt materiali elettrici"
                  />
                </label>
                <div className="material-diary-save">
                  <button type="button" className="button" onClick={onSave} disabled={saving}>
                    {saving ? "Salvataggio..." : "Salva bolla"}
                  </button>
                </div>
              </div>

              <datalist id="delivery-note-supplier-suggestions">
                {supplierSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>
              <datalist id="delivery-note-description-suggestions">
                {descriptionSuggestions.map((suggestion) => <option key={suggestion} value={suggestion} />)}
              </datalist>

              <div className="material-diary-table-wrap">
                <table className="material-diary-table delivery-note-diary-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Fornitore</th>
                      <th>Descrizione</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4}>Caricamento bolle...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={4}>Nessuna bolla inserita per questa commessa.</td></tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          {editingId === row.id ? (
                            <>
                              <td><input type="date" value={editForm.usageDate} onChange={(event) => onEditFormChange({ usageDate: event.target.value })} /></td>
                              <td><input list="delivery-note-supplier-suggestions" value={editForm.supplier} onChange={(event) => onEditFormChange({ supplier: event.target.value })} /></td>
                              <td><input list="delivery-note-description-suggestions" value={editForm.description} onChange={(event) => onEditFormChange({ description: event.target.value })} /></td>
                              <td>
                                <div className="material-diary-row-actions">
                                  <button type="button" onClick={onUpdate} disabled={saving}>Salva</button>
                                  <button type="button" onClick={onCancelEdit}>Annulla</button>
                                  <button type="button" className="material-diary-delete-button" onClick={() => onDelete(row)} disabled={saving}>Elimina</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{formatItalianShortDate(row.usageDate)}</td>
                              <td><strong>{row.supplier}</strong></td>
                              <td>{row.description}</td>
                              <td>
                                <div className="material-diary-row-actions">
                                  <button type="button" className="material-diary-edit-button" onClick={() => onStartEdit(row)}>
                                    Modifica
                                  </button>
                                  <button type="button" className="material-diary-delete-button" onClick={() => onDelete(row)} disabled={saving}>
                                    Elimina
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="job-premium-empty-state">Scegli una commessa per inserire e consultare le bolle registrate.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function DailyLogHeader({ onPrint }: { onPrint: () => void }) {
  return (
    <header className="diary-workspace-header">
      <div>
        <p className="dashboard-kicker">Inserimento operativo</p>
        <h1>Diario del cantiere</h1>
        <p>Compila risorse interne ed esterne con una vista piu compatta e orientata alla giornata.</p>
      </div>
      <button className="button" type="button" onClick={onPrint}>Stampa PDF</button>
    </header>
  );
}

function DailyLogDateCard({
  referenceDate,
  loadingRows,
  onDateChange,
  onToday,
  onDuplicatePreviousDay,
}: {
  referenceDate: string;
  loadingRows: boolean;
  onDateChange: (date: string) => void;
  onToday: () => void;
  onDuplicatePreviousDay: () => void;
}) {
  return (
    <section className="diary-day-hero">
      <div>
        <span>Giorno in compilazione</span>
        <strong>{formatItalianLongDate(referenceDate)}</strong>
        <small>{formatItalianShortDate(referenceDate)}</small>
      </div>
      <div className="diary-day-actions">
        <label>
          <span>Cambia giorno</span>
          <input type="date" value={referenceDate} onChange={(event) => onDateChange(event.target.value)} />
        </label>
        <button type="button" className="mobile-button-secondary" onClick={onToday}>Oggi</button>
        <button type="button" className="mobile-button-secondary" onClick={onDuplicatePreviousDay} disabled={loadingRows}>
          Duplica giorno precedente
        </button>
      </div>
    </section>
  );
}

function DailyLogStatsBar({
  completedInternalRows,
  totalInternalHours,
  completedExternalRows,
  totalExternalDays,
  completedExternalEconomyRows,
  totalExternalEconomyHours,
}: {
  completedInternalRows: number;
  totalInternalHours: number;
  completedExternalRows: number;
  totalExternalDays: number;
  completedExternalEconomyRows: number;
  totalExternalEconomyHours: number;
}) {
  return (
    <section className="diary-kpi-strip">
      <div><span>Interne</span><strong>{completedInternalRows}</strong></div>
      <div><span>Ore interne</span><strong>{toOneDecimal(totalInternalHours)}</strong></div>
      <div><span>Subappalto</span><strong>{completedExternalRows}</strong></div>
      <div><span>Giornate subappalto</span><strong>{toOneDecimal(totalExternalDays)}</strong></div>
      <div><span>Economia</span><strong>{completedExternalEconomyRows}</strong></div>
      <div><span>Ore economia</span><strong>{toOneDecimal(totalExternalEconomyHours)}</strong></div>
    </section>
  );
}

function CompactDiarySection({
  title,
  subtitle,
  children,
  extraAction,
  onAddRow,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  extraAction?: React.ReactNode;
  onAddRow: () => void;
}) {
  return (
    <section className="diary-compact-section">
      <div className="diary-compact-section-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div>
          {extraAction}
          <button type="button" className="button" onClick={onAddRow}>+ Aggiungi</button>
        </div>
      </div>
      {children}
    </section>
  );
}

function InternalResourcesSection({
  rows,
  resources,
  jobOrders,
  loading,
  loadingRows,
  onAddRow,
  onCopyPreviousDescription,
  onRemoveRow,
  onChangeRow,
}: {
  rows: InternalEditableRow[];
  resources: ResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  onAddRow: () => void;
  onCopyPreviousDescription: (index: number) => void;
  onRemoveRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<InternalEditableRow>) => void;
}) {
  return (
    <CompactDiarySection title="Risorse interne" subtitle="Personale e mezzi interni caricati a ore sulla commessa." onAddRow={onAddRow}>
      <div className="diary-compact-table">
        <div className="diary-compact-head diary-compact-head-internal">
          <span>Risorsa</span><span>Commessa</span><span>Ore</span><span>Descrizione</span><span>Azioni</span>
        </div>
        {rows.map((row, index) => (
          <div key={row.localId} className="diary-compact-row diary-compact-row-internal">
            <select value={row.resourceValue} onChange={(event) => onChangeRow(row.localId, { resourceValue: event.target.value })} disabled={loading || loadingRows}>
              <option value="">Seleziona risorsa</option>
              {resources.map((resource) => <option key={resource.value} value={resource.value}>{resource.label}</option>)}
            </select>
            <select value={row.jobOrderId} onChange={(event) => onChangeRow(row.localId, { jobOrderId: event.target.value })} disabled={loading || loadingRows}>
              <option value="">Seleziona commessa</option>
              {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
            </select>
            <input type="number" step="0.1" min="0.1" value={row.hours} onChange={(event) => onChangeRow(row.localId, { hours: event.target.value })} placeholder="0.0" disabled={loadingRows} />
            <textarea rows={1} className="diary-description-textarea" value={row.activityDescription} onChange={(event) => onChangeRow(row.localId, { activityDescription: event.target.value })} placeholder="Descrizione lavoro" disabled={loadingRows} />
            <div className="diary-compact-actions">
              {index > 0 ? (
                <button type="button" className="diary-icon-action diary-icon-action-copy" onClick={() => onCopyPreviousDescription(index)} disabled={loadingRows} title="Copia descrizione riga precedente" aria-label="Copia descrizione riga precedente">
                  <CopyDescriptionIcon />
                </button>
              ) : null}
              <button type="button" className="diary-icon-action diary-icon-action-delete" onClick={() => onRemoveRow(row.localId)} title={`Rimuovi riga ${index + 1}`} aria-label={`Rimuovi riga ${index + 1}`}>
                <TrashIcon />
              </button>
            </div>
          </div>
        ))}
      </div>
    </CompactDiarySection>
  );
}

function ExternalResourcesSection({
  rows,
  economyRows,
  externalResources,
  jobOrders,
  loading,
  loadingRows,
  externalResourceDraft,
  showExternalResourceManager,
  savingExternalResource,
  onAddRow,
  onAddEconomyRow,
  onCopyPreviousDescription,
  onCopyPreviousEconomyDescription,
  onRemoveRow,
  onRemoveEconomyRow,
  onChangeRow,
  onChangeEconomyRow,
  onToggleManager,
  onDraftChange,
  onAddExternalResource,
  onDeleteExternalResource,
}: {
  rows: ExternalEditableRow[];
  economyRows: ExternalEconomyEditableRow[];
  externalResources: ExternalResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  externalResourceDraft: string;
  showExternalResourceManager: boolean;
  savingExternalResource: boolean;
  onAddRow: () => void;
  onAddEconomyRow: () => void;
  onCopyPreviousDescription: (index: number) => void;
  onCopyPreviousEconomyDescription: (index: number) => void;
  onRemoveRow: (localId: string) => void;
  onRemoveEconomyRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<ExternalEditableRow>) => void;
  onChangeEconomyRow: (localId: string, patch: Partial<ExternalEconomyEditableRow>) => void;
  onToggleManager: () => void;
  onDraftChange: (value: string) => void;
  onAddExternalResource: () => void;
  onDeleteExternalResource: (id: string) => void;
}) {
  return (
    <CompactDiarySection
      title="Risorse esterne"
      subtitle="Caricamenti separati tra subappalto a giornate ed economia a ore."
      onAddRow={onAddRow}
      extraAction={<button type="button" className="mobile-button-secondary" onClick={onToggleManager}>Modifica elenco</button>}
    >
      {showExternalResourceManager ? (
        <div className="diary-external-manager diary-external-manager-compact">
          <div className="diary-external-manager-form">
            <input value={externalResourceDraft} onChange={(event) => onDraftChange(event.target.value)} className="diary-table-input" placeholder="Nuova risorsa esterna" />
            <button type="button" className="button" onClick={onAddExternalResource} disabled={savingExternalResource || !externalResourceDraft.trim()}>
              {savingExternalResource ? "Salvataggio..." : "Aggiungi voce"}
            </button>
          </div>
          <div className="diary-external-chip-list">
            {externalResources.length === 0 ? (
              <p className="muted">Nessuna risorsa esterna disponibile.</p>
            ) : (
              externalResources.map((resource) => (
                <div key={resource.id} className="diary-external-chip">
                  <span>{resource.name}</span>
                  <button type="button" className="diary-chip-remove" onClick={() => onDeleteExternalResource(resource.id)} title={`Rimuovi ${resource.name}`}>&times;</button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : null}

      <details className="diary-resource-accordion">
        <summary>
          <span>Risorse in subappalto</span>
          <small>{rows.filter(isFilledExternal).length} righe · giornate</small>
        </summary>
        <ExternalResourceRowsTable
          rows={rows}
          externalResources={externalResources}
          jobOrders={jobOrders}
          loading={loading}
          loadingRows={loadingRows}
          quantityLabel="Giornate"
          quantityKey="days"
          onAddRow={onAddRow}
          onCopyPreviousDescription={onCopyPreviousDescription}
          onRemoveRow={onRemoveRow}
          onChangeRow={onChangeRow}
        />
      </details>

      <details className="diary-resource-accordion">
        <summary>
          <span>Risorse in economia</span>
          <small>{economyRows.filter(isFilledExternalEconomy).length} righe · ore</small>
        </summary>
        <ExternalEconomyRowsTable
          rows={economyRows}
          externalResources={externalResources}
          jobOrders={jobOrders}
          loading={loading}
          loadingRows={loadingRows}
          onAddRow={onAddEconomyRow}
          onCopyPreviousDescription={onCopyPreviousEconomyDescription}
          onRemoveRow={onRemoveEconomyRow}
          onChangeRow={onChangeEconomyRow}
        />
      </details>
    </CompactDiarySection>
  );
}

function ExternalResourceRowsTable({
  rows,
  externalResources,
  jobOrders,
  loading,
  loadingRows,
  quantityLabel,
  quantityKey,
  onAddRow,
  onCopyPreviousDescription,
  onRemoveRow,
  onChangeRow,
}: {
  rows: ExternalEditableRow[];
  externalResources: ExternalResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  quantityLabel: string;
  quantityKey: "days";
  onAddRow: () => void;
  onCopyPreviousDescription: (index: number) => void;
  onRemoveRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<ExternalEditableRow>) => void;
}) {
  return (
    <div className="diary-compact-table">
      <div className="diary-compact-head diary-compact-head-external">
        <span>Risorsa</span><span>Commessa</span><span>{quantityLabel}</span><span>Descrizione</span><span>Azioni</span>
      </div>
      {rows.map((row, index) => (
        <div key={row.localId} className="diary-compact-row diary-compact-row-external">
          <select value={row.externalResourceId} onChange={(event) => onChangeRow(row.localId, { externalResourceId: event.target.value })} disabled={loading || loadingRows}>
            <option value="">Seleziona risorsa esterna</option>
            {externalResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
          </select>
          <select value={row.jobOrderId} onChange={(event) => onChangeRow(row.localId, { jobOrderId: event.target.value })} disabled={loading || loadingRows}>
            <option value="">Seleziona commessa</option>
            {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
          </select>
          <input type="number" step="0.1" min="0.1" value={row[quantityKey]} onChange={(event) => onChangeRow(row.localId, { [quantityKey]: event.target.value })} placeholder="0.0" disabled={loadingRows} />
          <textarea rows={1} className="diary-description-textarea" value={row.activityDescription} onChange={(event) => onChangeRow(row.localId, { activityDescription: event.target.value })} placeholder="Descrizione attivita" disabled={loadingRows} />
          <div className="diary-compact-actions">
            {index > 0 ? (
              <button type="button" className="diary-icon-action diary-icon-action-copy" onClick={() => onCopyPreviousDescription(index)} disabled={loadingRows} title="Copia descrizione riga precedente" aria-label="Copia descrizione riga precedente">
                <CopyDescriptionIcon />
              </button>
            ) : null}
            <button type="button" className="diary-icon-action diary-icon-action-delete" onClick={() => onRemoveRow(row.localId)} title={`Rimuovi riga ${index + 1}`} aria-label={`Rimuovi riga ${index + 1}`}>
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}
      <div className="diary-accordion-actions">
        <button type="button" className="mobile-button-secondary" onClick={onAddRow}>+ Aggiungi subappalto</button>
      </div>
    </div>
  );
}

function ExternalEconomyRowsTable({
  rows,
  externalResources,
  jobOrders,
  loading,
  loadingRows,
  onAddRow,
  onCopyPreviousDescription,
  onRemoveRow,
  onChangeRow,
}: {
  rows: ExternalEconomyEditableRow[];
  externalResources: ExternalResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  onAddRow: () => void;
  onCopyPreviousDescription: (index: number) => void;
  onRemoveRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<ExternalEconomyEditableRow>) => void;
}) {
  return (
    <div className="diary-compact-table">
      <div className="diary-compact-head diary-compact-head-external">
        <span>Risorsa</span><span>Commessa</span><span>Ore</span><span>Descrizione</span><span>Azioni</span>
      </div>
      {rows.map((row, index) => (
        <div key={row.localId} className="diary-compact-row diary-compact-row-external">
          <select value={row.externalResourceId} onChange={(event) => onChangeRow(row.localId, { externalResourceId: event.target.value })} disabled={loading || loadingRows}>
            <option value="">Seleziona risorsa esterna</option>
            {externalResources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
          </select>
          <select value={row.jobOrderId} onChange={(event) => onChangeRow(row.localId, { jobOrderId: event.target.value })} disabled={loading || loadingRows}>
            <option value="">Seleziona commessa</option>
            {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
          </select>
          <input type="number" step="0.1" min="0.1" value={row.hours} onChange={(event) => onChangeRow(row.localId, { hours: event.target.value })} placeholder="0.0" disabled={loadingRows} />
          <textarea rows={1} className="diary-description-textarea" value={row.activityDescription} onChange={(event) => onChangeRow(row.localId, { activityDescription: event.target.value })} placeholder="Descrizione attivita" disabled={loadingRows} />
          <div className="diary-compact-actions">
            {index > 0 ? (
              <button type="button" className="diary-icon-action diary-icon-action-copy" onClick={() => onCopyPreviousDescription(index)} disabled={loadingRows} title="Copia descrizione riga precedente" aria-label="Copia descrizione riga precedente">
                <CopyDescriptionIcon />
              </button>
            ) : null}
            <button type="button" className="diary-icon-action diary-icon-action-delete" onClick={() => onRemoveRow(row.localId)} title={`Rimuovi riga ${index + 1}`} aria-label={`Rimuovi riga ${index + 1}`}>
              <TrashIcon />
            </button>
          </div>
        </div>
      ))}
      <div className="diary-accordion-actions">
        <button type="button" className="mobile-button-secondary" onClick={onAddRow}>+ Aggiungi economia</button>
      </div>
    </div>
  );
}

function DailyLogPrintDialog({
  options,
  printDateDraft,
  previewDays,
  loading,
  onClose,
  onOptionsChange,
  onPrintDateDraftChange,
  onAddPrintDate,
  onRemovePrintDate,
  onPrint,
}: {
  options: PrintOptions;
  printDateDraft: string;
  previewDays: PrintDay[];
  loading: boolean;
  onClose: () => void;
  onOptionsChange: (patch: Partial<PrintOptions>) => void;
  onPrintDateDraftChange: (date: string) => void;
  onAddPrintDate: () => void;
  onRemovePrintDate: (date: string) => void;
  onPrint: () => void;
}) {
  return (
    <div className="diary-print-backdrop" role="dialog" aria-modal="true">
      <section className="diary-print-dialog">
        <header className="diary-print-dialog-head">
          <div>
            <p className="dashboard-kicker">Stampa Diario</p>
            <h2>Configura PDF A4</h2>
            <p>Prepara una stampa pulita per uno o piu giorni.</p>
          </div>
          <button type="button" className="mobile-button-secondary" onClick={onClose}>Chiudi</button>
        </header>

        <div className="diary-print-grid">
          <aside className="diary-print-options">
            <div className="diary-print-option-group">
              <span>Modalita</span>
              <label><input type="radio" checked={options.mode === "single"} onChange={() => onOptionsChange({ mode: "single" })} /> Giorno singolo</label>
              <label><input type="radio" checked={options.mode === "multi"} onChange={() => onOptionsChange({ mode: "multi" })} /> Piu giorni</label>
            </div>

            {options.mode === "single" ? (
              <div className="diary-print-option-group">
                <span>Giorno da stampare</span>
                <input
                  type="date"
                  value={options.singleDate}
                  onChange={(event) => onOptionsChange({ singleDate: event.target.value })}
                />
              </div>
            ) : null}

            {options.mode === "multi" ? (
              <div className="diary-print-option-group">
                <span>Date</span>
                <div className="diary-print-date-row">
                  <input type="date" value={printDateDraft} onChange={(event) => onPrintDateDraftChange(event.target.value)} />
                  <button type="button" className="mobile-button-secondary" onClick={onAddPrintDate}>Aggiungi</button>
                </div>
                <div className="diary-print-chip-list">
                  {options.selectedDates.map((date) => (
                    <button key={date} type="button" onClick={() => onRemovePrintDate(date)}>
                      {formatItalianShortDate(date)} x
                    </button>
                  ))}
                </div>
                <label>Dal <input type="date" value={options.rangeFrom} onChange={(event) => onOptionsChange({ rangeFrom: event.target.value })} /></label>
                <label>Al <input type="date" value={options.rangeTo} onChange={(event) => onOptionsChange({ rangeTo: event.target.value })} /></label>
                <label><input type="checkbox" checked={options.onlyCompiled} onChange={(event) => onOptionsChange({ onlyCompiled: event.target.checked })} /> Includi solo giorni compilati</label>
              </div>
            ) : null}

            <div className="diary-print-option-group">
              <span>Contenuti</span>
              <label><input type="checkbox" checked={options.includeInternal} onChange={(event) => onOptionsChange({ includeInternal: event.target.checked })} /> Risorse interne</label>
              <label><input type="checkbox" checked={options.includeExternal} onChange={(event) => onOptionsChange({ includeExternal: event.target.checked })} /> Risorse esterne</label>
              <label><input type="checkbox" checked={options.includeTotals} onChange={(event) => onOptionsChange({ includeTotals: event.target.checked })} /> Totali giornata</label>
              <label><input type="checkbox" checked={options.includeDescriptions} onChange={(event) => onOptionsChange({ includeDescriptions: event.target.checked })} /> Descrizioni complete</label>
            </div>

            <button type="button" className="button" onClick={onPrint} disabled={loading}>
              {loading ? "Preparazione..." : "Stampa / salva PDF"}
            </button>
          </aside>

          <DailyLogPrintPreview days={previewDays} options={options} loading={loading} />
        </div>
      </section>
    </div>
  );
}

function DailyLogPrintPreview({ days, options, loading }: { days: PrintDay[]; options: PrintOptions; loading: boolean }) {
  if (loading) {
    return <div className="diary-print-preview diary-print-preview-empty">Preparazione anteprima...</div>;
  }

  if (days.length === 0) {
    return <div className="diary-print-preview diary-print-preview-empty">Nessun giorno da stampare con i filtri selezionati.</div>;
  }

  return (
    <div className="diary-print-preview">
      {days.map((day) => {
        const internalRows = day.internalRows.filter(isFilledInternal);
        const externalRows = day.externalRows.filter(isFilledExternal);
        const externalEconomyRows = day.externalEconomyRows.filter(isFilledExternalEconomy);
        return (
          <article key={day.date} className="diary-print-preview-page">
            <header>
              <span>GiGest</span>
              <h3>{formatItalianLongDate(day.date)}</h3>
              <small>{formatItalianShortDate(day.date)}</small>
            </header>
            {options.includeTotals ? (
              <div className="diary-print-preview-totals">
                <span>Interne {internalRows.length}</span>
                <span>Ore {toOneDecimal(sumNumericStrings(internalRows.map((row) => row.hours)))}</span>
                <span>Subappalto {externalRows.length}</span>
                <span>Giornate {toOneDecimal(sumNumericStrings(externalRows.map((row) => row.days)))}</span>
                <span>Economia {externalEconomyRows.length}</span>
                <span>Ore economia {toOneDecimal(sumNumericStrings(externalEconomyRows.map((row) => row.hours)))}</span>
              </div>
            ) : null}
            {options.includeInternal ? <PrintPreviewRows title="Risorse interne" rows={internalRows.map((row) => row.resourceLabel || row.resourceValue)} /> : null}
            {options.includeExternal ? <PrintPreviewRows title="Risorse in subappalto" rows={externalRows.map((row) => row.externalResourceLabel || row.externalResourceId)} /> : null}
            {options.includeExternal ? <PrintPreviewRows title="Risorse in economia" rows={externalEconomyRows.map((row) => row.externalResourceLabel || row.externalResourceId)} /> : null}
          </article>
        );
      })}
    </div>
  );
}

function PrintPreviewRows({ title, rows }: { title: string; rows: string[] }) {
  return (
    <section>
      <h4>{title}</h4>
      {rows.length === 0 ? <p>Nessuna riga.</p> : rows.slice(0, 5).map((row, index) => <p key={`${row}-${index}`}>{row || "-"}</p>)}
      {rows.length > 5 ? <p>+ {rows.length - 5} righe</p> : null}
    </section>
  );
}

function CopyDescriptionIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M8 8h10v12H8z" />
      <path d="M6 16H4V4h10v2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M5 7h14" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M8 7l1-3h6l1 3" />
      <path d="M7 7l1 13h8l1-13" />
    </svg>
  );
}
