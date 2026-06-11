"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { formatItalianLongDate, formatItalianShortDate } from "@/lib/date-format";
import { PdfViewerModal } from "@/components/pdf-viewer-modal";

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
  usageCount?: number;
};

const EXTERNAL_RESOURCE_FAVORITES_KEY = "gigest.diary.externalResourceFavorites.v1";

type MaterialUsageRow = {
  id: string;
  jobOrderId: string;
  jobOrderLabel?: string;
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
  jobOrderLabel?: string;
  supplier: string;
  description: string;
  usageDate: string;
  validationStatus: "PENDING" | "VALIDATED";
  validationStatusLabel: string;
  validatedAt: string | null;
  documents: Array<{
    id: string;
    fileName: string;
    mimeType: string | null;
    sizeBytes: number | null;
    createdAt: string;
  }>;
  createdAt: string;
  updatedAt: string;
};

type DeliveryNoteFormState = {
  jobOrderId?: string;
  supplier: string;
  description: string;
  usageDate: string;
};

type PdfPreviewState = {
  title: string;
  url: string;
  subtitle?: string;
};

type InternalEditableRow = {
  localId: string;
  isSaved?: boolean;
  isEditing?: boolean;
  resourceValue: string;
  resourceLabel?: string;
  jobOrderId: string;
  jobOrderLabel?: string;
  hours: string;
  activityDescription: string;
};

type ExternalEditableRow = {
  localId: string;
  isSaved?: boolean;
  isEditing?: boolean;
  externalResourceId: string;
  externalResourceLabel?: string;
  jobOrderId: string;
  jobOrderLabel?: string;
  days: string;
  activityDescription: string;
};

type ExternalEconomyEditableRow = {
  localId: string;
  isSaved?: boolean;
  isEditing?: boolean;
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
  materialRows: MaterialUsageRow[];
  deliveryNoteRows: DeliveryNoteRow[];
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

type DailyOvertimeAlert = {
  resourceName: string;
  totalHours: number;
  overtimeHours: number;
  severity: "overtime" | "excess";
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
    isSaved: false,
    isEditing: true,
    resourceValue: "",
    jobOrderId: "",
    hours: "",
    activityDescription: "",
  };
}

function makeEmptyExternalRow(): ExternalEditableRow {
  return {
    localId: crypto.randomUUID(),
    isSaved: false,
    isEditing: true,
    externalResourceId: "",
    jobOrderId: "",
    days: "",
    activityDescription: "",
  };
}

function makeEmptyExternalEconomyRow(): ExternalEconomyEditableRow {
  return {
    localId: crypto.randomUUID(),
    isSaved: false,
    isEditing: true,
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

function countDistinctFilledValues(values: string[]) {
  return new Set(values.map((value) => value.trim()).filter(Boolean)).size;
}

function toOneDecimal(value: number) {
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatCompactHours(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : value.toLocaleString("it-IT", {
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
        <colgroup>
          <col class="resource-col" />
          <col class="job-col" />
          <col class="qty-col" />
          ${includeDescriptions ? '<col class="description-col" />' : ""}
        </colgroup>
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

function printSupplementaryTable(
  title: string,
  emptyMessage: string,
  rows: Array<{ usageDate: string; supplier: string; jobOrder: string; description: string }>
) {
  const body =
    rows.length === 0
      ? `<tr><td colspan="4" class="empty">${escapeHtml(emptyMessage)}</td></tr>`
      : rows
          .map(
            (row) => `
              <tr>
                <td class="date">${escapeHtml(formatItalianShortDate(row.usageDate))}</td>
                <td>${escapeHtml(row.supplier || "-")}</td>
                <td>${escapeHtml(row.jobOrder || "-")}</td>
                <td>${escapeHtml(row.description || "-")}</td>
              </tr>`
          )
          .join("");

  return `
    <section class="print-section">
      <h2>${escapeHtml(title)}</h2>
      <table class="print-supplementary-table">
        <colgroup>
          <col class="date-col" />
          <col class="supplier-col" />
          <col class="job-col" />
          <col class="description-col" />
        </colgroup>
        <thead>
          <tr>
            <th>Data</th>
            <th>Fornitore</th>
            <th>Commessa</th>
            <th>Descrizione</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </section>`;
}

function buildPrintFileName(days: PrintDay[]) {
  const firstDate = days[0]?.date || todayAsInputValue();
  return `Diario del cantiere ${firstDate}`;
}

function buildPrintHtml(days: PrintDay[], options: PrintOptions) {
  const documentTitle = buildPrintFileName(days);
  const dayPanels = days.map((day) => {
      const internalRows = day.internalRows.filter(isFilledInternal);
      const externalRows = day.externalRows.filter(isFilledExternal);
      const externalEconomyRows = day.externalEconomyRows.filter(isFilledExternalEconomy);
      const supplementaryRows = [
        ...day.deliveryNoteRows.map((row) => ({
          usageDate: row.usageDate,
          supplier: row.supplier,
          jobOrder: row.jobOrderLabel || row.jobOrderId,
          description: row.description,
        })),
        ...day.materialRows.map((row) => ({
          usageDate: row.usageDate,
          supplier: "Materiali",
          jobOrder: row.jobOrderLabel || row.jobOrderId,
          description: `${row.description}${row.quantity ? ` (${row.quantity} ${row.unitOfMeasure})` : ""}`,
        })),
      ].sort((a, b) => a.usageDate.localeCompare(b.usageDate) || a.jobOrder.localeCompare(b.jobOrder, "it", { sensitivity: "base" }));

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
          ${
            printSupplementaryTable(
              "Bolle e Materiali",
              "Nessuna bolla o materiale registrato per questa data.",
              supplementaryRows
            )
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
        <title>${escapeHtml(documentTitle)}</title>
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
          .print-section { margin-top: 7px; }
          table { width: 100%; border-collapse: collapse; font-size: 9px; table-layout: fixed; }
          th { background: #f8fafc; color: #6b7280; text-transform: uppercase; font-size: 7px; letter-spacing: .05em; }
          th, td { border: 1px solid #e5e7eb; padding: 3px 4px; text-align: left; vertical-align: top; }
          .num { text-align: right; font-weight: 800; white-space: nowrap; }
          table col.qty-col { width: 10%; }
          table col.resource-col { width: 24%; }
          table col.job-col { width: 24%; }
          table col.description-col { width: 42%; }
          .print-supplementary-table col.date-col { width: 14%; }
          .print-supplementary-table col.supplier-col { width: 22%; }
          .print-supplementary-table col.job-col { width: 24%; }
          .print-supplementary-table col.description-col { width: 40%; }
          .date { white-space: nowrap; }
          .empty { text-align: center; color: #6b7280; }
        </style>
      </head>
      <body>${pages.join("")}</body>
    </html>`;
}

export function DailyLogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [referenceDate, setReferenceDate] = useState(todayAsInputValue());
  const [resources, setResources] = useState<ResourceOption[]>([]);
  const [jobOrders, setJobOrders] = useState<JobOrderOption[]>([]);
  const [externalResources, setExternalResources] = useState<ExternalResourceOption[]>([]);
  const [favoriteExternalResourceNames, setFavoriteExternalResourceNames] = useState<string[]>([]);
  const [showExternalResourceFavoriteManager, setShowExternalResourceFavoriteManager] = useState(false);
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
  const [newScansCount, setNewScansCount] = useState(0);
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
  const [deliveryNoteAttachment, setDeliveryNoteAttachment] = useState<File | null>(null);
  const [editingMaterialId, setEditingMaterialId] = useState("");
  const [editingDeliveryNoteId, setEditingDeliveryNoteId] = useState("");
  const [materialEditForm, setMaterialEditForm] = useState<MaterialFormState>({
    description: "",
    usageDate: todayAsInputValue(),
    unitOfMeasure: "",
    quantity: "",
  });
  const [deliveryNoteEditForm, setDeliveryNoteEditForm] = useState<DeliveryNoteFormState>({
    jobOrderId: "",
    supplier: "",
    description: "",
    usageDate: todayAsInputValue(),
  });
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [materialsSaving, setMaterialsSaving] = useState(false);
  const [deliveryNotesLoading, setDeliveryNotesLoading] = useState(false);
  const [deliveryNotesSaving, setDeliveryNotesSaving] = useState(false);
  const [deliveryNoteUploadingId, setDeliveryNoteUploadingId] = useState("");
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  function confirmDiscardUnsavedChanges() {
    if (!hasUnsavedChanges) return true;
    return window.confirm("Modifiche al diario non salvate: sicuro di voler procedere senza salvare?");
  }

  function navigateWithUnsavedCheck(href: Route | string) {
    if (!confirmDiscardUnsavedChanges()) return;
    router.push(href as Route);
  }

  function changeReferenceDate(nextDate: string) {
    if (nextDate === referenceDate) return;
    if (!confirmDiscardUnsavedChanges()) return;
    setReferenceDate(nextDate);
  }

  function resourceLabel(value: string) {
    return resources.find((resource) => resource.value === value)?.label ?? "";
  }

  function jobOrderLabel(id: string) {
    return jobOrders.find((jobOrder) => jobOrder.id === id)?.name ?? "";
  }

  function externalResourceLabel(id: string) {
    return externalResources.find((resource) => resource.id === id || resource.name === id)?.name ?? id;
  }

  const favoriteExternalResourceKeySet = useMemo(
    () => new Set(favoriteExternalResourceNames.map((name) => name.trim().toLocaleLowerCase("it")).filter(Boolean)),
    [favoriteExternalResourceNames]
  );

  const orderedExternalResources = useMemo(
    () =>
      [...externalResources].sort((a, b) => {
        const aFavorite = favoriteExternalResourceKeySet.has(a.name.toLocaleLowerCase("it"));
        const bFavorite = favoriteExternalResourceKeySet.has(b.name.toLocaleLowerCase("it"));

        if (aFavorite !== bFavorite) return aFavorite ? -1 : 1;
        return (
          (b.usageCount ?? 0) - (a.usageCount ?? 0) ||
          a.name.localeCompare(b.name, "it", { sensitivity: "base" })
        );
      }),
    [externalResources, favoriteExternalResourceKeySet]
  );

  function toggleFavoriteExternalResource(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;

    setFavoriteExternalResourceNames((current) => {
      const key = cleanName.toLocaleLowerCase("it");
      const exists = current.some((item) => item.trim().toLocaleLowerCase("it") === key);
      const next = exists
        ? current.filter((item) => item.trim().toLocaleLowerCase("it") !== key)
        : [cleanName, ...current];
      window.localStorage.setItem(EXTERNAL_RESOURCE_FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function addFavoriteExternalRow(name: string) {
    const cleanName = name.trim();
    if (!cleanName) return;

    setHasUnsavedChanges(true);
    setExternalRows((current) => [
      ...current,
      {
        ...makeEmptyExternalRow(),
        externalResourceId: cleanName,
        externalResourceLabel: cleanName,
      },
    ]);
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
    materialRows: [],
    deliveryNoteRows: [],
  };
}

  function setInternalRowValue(localId: string, patch: Partial<InternalEditableRow>) {
    setHasUnsavedChanges(true);
    setInternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function setExternalRowValue(localId: string, patch: Partial<ExternalEditableRow>) {
    setHasUnsavedChanges(true);
    setExternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function setExternalEconomyRowValue(localId: string, patch: Partial<ExternalEconomyEditableRow>) {
    setHasUnsavedChanges(true);
    setExternalEconomyRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function addInternalRow() {
    setHasUnsavedChanges(true);
    setInternalRows((current) => [...current, makeEmptyInternalRow()]);
  }

  function addExternalRow() {
    setHasUnsavedChanges(true);
    setExternalRows((current) => [...current, makeEmptyExternalRow()]);
  }

  function addExternalEconomyRow() {
    setHasUnsavedChanges(true);
    setExternalEconomyRows((current) => [...current, makeEmptyExternalEconomyRow()]);
  }

  function editInternalRow(localId: string) {
    setInternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, isEditing: true } : row))
    );
  }

  function editExternalRow(localId: string) {
    setExternalRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, isEditing: true } : row))
    );
  }

  function editExternalEconomyRow(localId: string) {
    setExternalEconomyRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, isEditing: true } : row))
    );
  }

  function duplicateInternalRow(localId: string) {
    setHasUnsavedChanges(true);
    setInternalRows((current) => {
      const index = current.findIndex((row) => row.localId === localId);
      if (index < 0) return current;
      const source = current[index];
      const duplicate: InternalEditableRow = {
        ...source,
        localId: crypto.randomUUID(),
        isSaved: false,
        isEditing: true,
      };
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)];
    });
  }

  function duplicateExternalRow(localId: string) {
    setHasUnsavedChanges(true);
    setExternalRows((current) => {
      const index = current.findIndex((row) => row.localId === localId);
      if (index < 0) return current;
      const source = current[index];
      const duplicate: ExternalEditableRow = {
        ...source,
        localId: crypto.randomUUID(),
        isSaved: false,
        isEditing: true,
      };
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)];
    });
  }

  function duplicateExternalEconomyRow(localId: string) {
    setHasUnsavedChanges(true);
    setExternalEconomyRows((current) => {
      const index = current.findIndex((row) => row.localId === localId);
      if (index < 0) return current;
      const source = current[index];
      const duplicate: ExternalEconomyEditableRow = {
        ...source,
        localId: crypto.randomUUID(),
        isSaved: false,
        isEditing: true,
      };
      return [...current.slice(0, index + 1), duplicate, ...current.slice(index + 1)];
    });
  }

  function removeInternalRow(localId: string) {
    setHasUnsavedChanges(true);
    setInternalRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyInternalRow()];
    });
  }

  function removeExternalRow(localId: string) {
    setHasUnsavedChanges(true);
    setExternalRows((current) => {
      const updated = current.filter((row) => row.localId !== localId);
      return updated.length > 0 ? updated : [makeEmptyExternalRow()];
    });
  }

  function removeExternalEconomyRow(localId: string) {
    setHasUnsavedChanges(true);
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
            isSaved: true,
            isEditing: false,
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
            isSaved: true,
            isEditing: false,
            externalResourceId: row.externalResourceId ?? "",
            externalResourceLabel: row.externalResourceLabel ?? row.externalResourceId ?? "",
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
            isSaved: true,
            isEditing: false,
            externalResourceId: row.externalResourceId ?? "",
            externalResourceLabel: row.externalResourceLabel ?? row.externalResourceId ?? "",
            jobOrderId: row.jobOrderId ?? "",
            jobOrderLabel: row.jobOrderLabel ?? "",
            hours: row.hours?.toString() ?? "",
            activityDescription: row.activityDescription ?? "",
          }));

    return { internalRows: loadedInternalRows, externalRows: loadedExternalRows, externalEconomyRows: loadedExternalEconomyRows };
  }

  async function fetchPrintSupplementaryRowsForDate(date: string) {
    const [materialsData, deliveryNotesData] = await Promise.all([
      safeJsonFetch(`/api/diario/materiali?date=${date}`),
      safeJsonFetch(`/api/diario/bolle?date=${date}`),
    ]);

    return {
      materialRows: (materialsData.rows ?? []) as MaterialUsageRow[],
      deliveryNoteRows: (deliveryNotesData.rows ?? []) as DeliveryNoteRow[],
    };
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
      setHasUnsavedChanges(false);
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
    try {
      const raw = window.localStorage.getItem(EXTERNAL_RESOURCE_FAVORITES_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setFavoriteExternalResourceNames(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
    } catch {
      setFavoriteExternalResourceNames([]);
    }
  }, []);

  useEffect(() => {
    async function loadNewScansCount() {
      try {
        const data = await safeJsonFetch("/api/documentale/scansioni/count");
        setNewScansCount(Number(data.count ?? 0));
      } catch {
        setNewScansCount(0);
      }
    }

    void loadNewScansCount();
  }, []);

  useEffect(() => {
    if (!loading && searchParams.get("open") === "bolle" && !deliveryNotesDialogOpen) {
      openDeliveryNotesDialog();
    }
  }, [loading, searchParams, deliveryNotesDialogOpen]);

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

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (!hasUnsavedChanges) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function handleDocumentClick(event: MouseEvent) {
      if (!hasUnsavedChanges) return;
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      if (confirmDiscardUnsavedChanges()) return;
      event.preventDefault();
      event.stopPropagation();
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleDocumentClick, true);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleDocumentClick, true);
    };
  }, [hasUnsavedChanges]);

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
            externalResourceName: row.externalResourceLabel || row.externalResourceId,
            jobOrderId: row.jobOrderId,
            days: row.days,
            activityDescription: row.activityDescription,
          })),
          externalEconomyRows: externalEconomyRows.map((row) => ({
            externalResourceId: row.externalResourceId,
            externalResourceName: row.externalResourceLabel || row.externalResourceId,
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
          : data.internalRows.map((row) => ({ ...row, localId: crypto.randomUUID(), isSaved: false, isEditing: true }))
      );
      setExternalRows(
        data.externalRows.length === 0
          ? [makeEmptyExternalRow(), makeEmptyExternalRow()]
          : data.externalRows.map((row) => ({ ...row, localId: crypto.randomUUID(), isSaved: false, isEditing: true }))
      );
      setExternalEconomyRows(
        data.externalEconomyRows.length === 0
          ? [makeEmptyExternalEconomyRow()]
          : data.externalEconomyRows.map((row) => ({ ...row, localId: crypto.randomUUID(), isSaved: false, isEditing: true }))
      );
      setHasUnsavedChanges(true);
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
    setDeliveryNoteAttachment(null);
    setEditingDeliveryNoteId("");
    void safeJsonFetch("/api/documentale/scansioni/count")
      .then((data) => setNewScansCount(Number(data.count ?? 0)))
      .catch(() => setNewScansCount(0));
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
      const data = (await safeJsonFetch("/api/diario/bolle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          jobOrderId: selectedDeliveryNoteJobOrderId,
          ...deliveryNoteForm,
        }),
      })) as { row: DeliveryNoteRow };

      if (deliveryNoteAttachment) {
        await uploadDeliveryNoteAttachment(data.row.id, deliveryNoteAttachment);
      }

      setDeliveryNoteForm({
        supplier: "",
        description: "",
        usageDate: todayAsInputValue(),
      });
      setDeliveryNoteAttachment(null);
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
      jobOrderId: row.jobOrderId,
      supplier: row.supplier,
      description: row.description,
      usageDate: row.usageDate,
    });
  }

  async function handleUpdateDeliveryNote() {
    const targetJobOrderId = deliveryNoteEditForm.jobOrderId || selectedDeliveryNoteJobOrderId;
    if (!editingDeliveryNoteId || !targetJobOrderId) return;

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
          ...deliveryNoteEditForm,
          jobOrderId: targetJobOrderId,
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

  async function uploadDeliveryNoteAttachment(deliveryNoteId: string, file: File, replaceExisting = false) {
    const formData = new FormData();
    formData.append("file", file);
    if (replaceExisting) {
      formData.append("replace", "true");
    }

    await safeJsonFetch(`/api/diario/bolle/${deliveryNoteId}/documenti`, {
      method: "POST",
      body: formData,
    });
  }

  async function handleUploadDeliveryNoteAttachment(row: DeliveryNoteRow, file: File | null, replaceExisting = false) {
    if (!selectedDeliveryNoteJobOrderId || !file) return;

    setDeliveryNoteUploadingId(row.id);
    setError("");
    setMessage("");

    try {
      await uploadDeliveryNoteAttachment(row.id, file, replaceExisting);
      setMessage(replaceExisting ? "Allegato sostituito." : "Allegato caricato.");
      await loadDeliveryNoteRows(selectedDeliveryNoteJobOrderId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore nel caricamento allegato");
    } finally {
      setDeliveryNoteUploadingId("");
    }
  }

  const totalInternalHours = useMemo(() => sumNumericStrings(internalRows.map((row) => row.hours)), [internalRows]);
  const totalExternalDays = useMemo(() => sumNumericStrings(externalRows.map((row) => row.days)), [externalRows]);
  const totalExternalEconomyHours = useMemo(
    () => sumNumericStrings(externalEconomyRows.map((row) => row.hours)),
    [externalEconomyRows]
  );

  const dailyOvertimeAlerts = useMemo<DailyOvertimeAlert[]>(() => {
    const hoursByResource = new Map<string, { resourceName: string; totalHours: number }>();

    for (const row of internalRows) {
      if (!row.isSaved || row.isEditing || !isFilledInternal(row)) continue;

      const hours = Number(row.hours);
      if (!Number.isFinite(hours)) continue;

      const resourceName =
        row.resourceLabel ||
        resources.find((resource) => resource.value === row.resourceValue)?.label ||
        row.resourceValue;
      const current = hoursByResource.get(row.resourceValue) ?? { resourceName, totalHours: 0 };
      current.totalHours += hours;
      hoursByResource.set(row.resourceValue, current);
    }

    return [...hoursByResource.values()]
      .map((item) => {
        const totalHours = Math.round(item.totalHours * 10) / 10;
        const overtimeHours = Math.round((totalHours - 8) * 10) / 10;

        if (overtimeHours <= 0) return null;

        return {
          resourceName: item.resourceName,
          totalHours,
          overtimeHours,
          severity: totalHours > 10 ? "excess" : "overtime",
        } satisfies DailyOvertimeAlert;
      })
      .filter((item): item is DailyOvertimeAlert => Boolean(item))
      .sort((a, b) => b.totalHours - a.totalHours || a.resourceName.localeCompare(b.resourceName, "it", { sensitivity: "base" }));
  }, [internalRows, resources]);

  const completedInternalRows = useMemo(
    () =>
      countDistinctFilledValues(
        internalRows
          .filter((row) => row.resourceValue.trim() && row.jobOrderId.trim() && row.hours.trim())
          .map((row) => row.resourceValue)
      ),
    [internalRows]
  );

  const completedExternalRows = useMemo(
    () =>
      countDistinctFilledValues(
        externalRows
          .filter((row) => row.externalResourceId.trim() && row.jobOrderId.trim() && row.days.trim())
          .map((row) => row.externalResourceId)
      ),
    [externalRows]
  );

  const completedExternalEconomyRows = useMemo(
    () =>
      countDistinctFilledValues(
        externalEconomyRows
          .filter((row) => row.externalResourceId.trim() && row.jobOrderId.trim() && row.hours.trim())
          .map((row) => row.externalResourceId)
      ),
    [externalEconomyRows]
  );

  async function buildPrintDays(options = printOptions) {
    if (options.mode === "single") {
      const selectedDate = options.singleDate || referenceDate;
      const [rows, supplementary] = await Promise.all([
        selectedDate === referenceDate ? Promise.resolve(currentPrintDay()) : fetchRowsForDate(selectedDate),
        fetchPrintSupplementaryRowsForDate(selectedDate),
      ]);

      return [
        {
          date: selectedDate,
          internalRows: rows.internalRows,
          externalRows: rows.externalRows,
          externalEconomyRows: rows.externalEconomyRows,
          materialRows: supplementary.materialRows,
          deliveryNoteRows: supplementary.deliveryNoteRows,
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
      const [rows, supplementary] = await Promise.all([
        date === referenceDate ? Promise.resolve(currentPrintDay()) : fetchRowsForDate(date),
        fetchPrintSupplementaryRowsForDate(date),
      ]);
      const day = {
        date,
        internalRows: rows.internalRows,
        externalRows: rows.externalRows,
        externalEconomyRows: rows.externalEconomyRows,
        materialRows: supplementary.materialRows,
        deliveryNoteRows: supplementary.deliveryNoteRows,
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

    printWindow.document.title = buildPrintFileName(days);
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
        <DailyLogDateCard
          referenceDate={referenceDate}
          onDateChange={changeReferenceDate}
          onToday={() => changeReferenceDate(todayAsInputValue())}
          onDuplicatePreviousDay={handleDuplicatePreviousDay}
          loadingRows={loadingRows}
          onPrint={openPrintDialog}
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
          <button className="mobile-button-secondary" type="button" onClick={() => navigateWithUnsavedCheck("/risorse")}>Risorse</button>
          <button className="mobile-button-secondary" type="button" onClick={() => navigateWithUnsavedCheck("/commesse")}>Commesse</button>
        </div>

        {message ? <div className="scad-success">{message}</div> : null}
        {error ? <div className="scad-error">{error}</div> : null}

        <DailyOvertimeAlerts alerts={dailyOvertimeAlerts} />

        <InternalResourcesSection
          rows={internalRows}
          resources={resources}
          jobOrders={jobOrders}
          loading={loading}
          loadingRows={loadingRows}
          onAddRow={addInternalRow}
          onDuplicateRow={duplicateInternalRow}
          onRemoveRow={removeInternalRow}
          onChangeRow={setInternalRowValue}
          onEditRow={editInternalRow}
        />

        <ExternalResourcesSection
          rows={externalRows}
          economyRows={externalEconomyRows}
          externalResources={orderedExternalResources}
          favoriteResourceNames={favoriteExternalResourceNames}
          showFavoriteManager={showExternalResourceFavoriteManager}
          jobOrders={jobOrders}
          loading={loading}
          loadingRows={loadingRows}
          externalResourceDraft={externalResourceDraft}
          showExternalResourceManager={showExternalResourceManager}
          savingExternalResource={savingExternalResource}
          onAddRow={addExternalRow}
          onAddEconomyRow={addExternalEconomyRow}
          onDuplicateRow={duplicateExternalRow}
          onDuplicateEconomyRow={duplicateExternalEconomyRow}
          onRemoveRow={removeExternalRow}
          onRemoveEconomyRow={removeExternalEconomyRow}
          onChangeRow={setExternalRowValue}
          onChangeEconomyRow={setExternalEconomyRowValue}
          onToggleFavoriteResource={toggleFavoriteExternalResource}
          onToggleFavoriteManager={() => setShowExternalResourceFavoriteManager((current) => !current)}
          onAddFavoriteRow={addFavoriteExternalRow}
          onEditRow={editExternalRow}
          onEditEconomyRow={editExternalEconomyRow}
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
          newScansCount={newScansCount}
          loading={deliveryNotesLoading}
          saving={deliveryNotesSaving}
          uploadingId={deliveryNoteUploadingId}
          attachment={deliveryNoteAttachment}
          onClose={() => setDeliveryNotesDialogOpen(false)}
          onJobOrderChange={changeDeliveryNoteJobOrder}
          onFormChange={(patch) => setDeliveryNoteForm((current) => ({ ...current, ...patch }))}
          onAttachmentChange={setDeliveryNoteAttachment}
          onEditFormChange={(patch) => setDeliveryNoteEditForm((current) => ({ ...current, ...patch }))}
          onSave={() => void handleSaveDeliveryNote()}
          onStartEdit={startEditDeliveryNote}
          onCancelEdit={() => setEditingDeliveryNoteId("")}
          onUpdate={() => void handleUpdateDeliveryNote()}
          onDelete={(row) => void handleDeleteDeliveryNote(row)}
          onUploadAttachment={(row, file, replaceExisting) => void handleUploadDeliveryNoteAttachment(row, file, replaceExisting)}
          onOpenScans={() => navigateWithUnsavedCheck("/documentale?tab=scansioni&source=diario-bolle" as Route)}
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
                                  <button type="button" className="ui-action-button" onClick={onUpdate} disabled={saving}>Salva</button>
                                  <button type="button" className="ui-nav-button" onClick={onCancelEdit}>Annulla</button>
                                  <button type="button" className="ui-danger-button" onClick={() => onDelete(row)} disabled={saving}>Elimina</button>
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
                                  <button type="button" className="ui-icon-button ui-icon-button-edit" onClick={() => onStartEdit(row)} title="Modifica" aria-label="Modifica">
                                    <PencilIcon />
                                  </button>
                                  <button type="button" className="ui-icon-button ui-icon-button-danger" onClick={() => onDelete(row)} disabled={saving} title="Elimina" aria-label="Elimina">
                                    <TrashIcon />
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
  newScansCount,
  loading,
  saving,
  uploadingId,
  attachment,
  onClose,
  onJobOrderChange,
  onFormChange,
  onAttachmentChange,
  onEditFormChange,
  onSave,
  onStartEdit,
  onCancelEdit,
  onUpdate,
  onDelete,
  onUploadAttachment,
  onOpenScans,
}: {
  jobOrders: JobOrderOption[];
  selectedJobOrderId: string;
  rows: DeliveryNoteRow[];
  form: DeliveryNoteFormState;
  editForm: DeliveryNoteFormState;
  editingId: string;
  supplierSuggestions: string[];
  descriptionSuggestions: string[];
  newScansCount: number;
  loading: boolean;
  saving: boolean;
  uploadingId: string;
  attachment: File | null;
  onClose: () => void;
  onJobOrderChange: (jobOrderId: string) => void;
  onFormChange: (patch: Partial<DeliveryNoteFormState>) => void;
  onAttachmentChange: (file: File | null) => void;
  onEditFormChange: (patch: Partial<DeliveryNoteFormState>) => void;
  onSave: () => void;
  onStartEdit: (row: DeliveryNoteRow) => void;
  onCancelEdit: () => void;
  onUpdate: () => void;
  onDelete: (row: DeliveryNoteRow) => void;
  onUploadAttachment: (row: DeliveryNoteRow, file: File | null, replaceExisting?: boolean) => void;
  onOpenScans: () => void;
}) {
  const [pdfPreview, setPdfPreview] = useState<PdfPreviewState | null>(null);

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

          {newScansCount > 0 ? (
            <button type="button" className="documentale-scan-inline-alert" onClick={onOpenScans}>
              Ci sono {newScansCount} nuove scansioni da inserire
            </button>
          ) : null}

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
                <label className="material-diary-field material-diary-field-wide">
                  <span>Allegato PDF</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    onChange={(event) => onAttachmentChange(event.target.files?.[0] ?? null)}
                  />
                  {attachment ? <small>{attachment.name}</small> : null}
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
                      <th>Commessa</th>
                      <th>Data</th>
                      <th>Fornitore</th>
                      <th>Descrizione</th>
                      <th>Stato</th>
                      <th>Allegati</th>
                      <th>Azioni</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7}>Caricamento bolle...</td></tr>
                    ) : rows.length === 0 ? (
                      <tr><td colSpan={7}>Nessuna bolla inserita per questa commessa.</td></tr>
                    ) : (
                      rows.map((row) => (
                        <tr key={row.id}>
                          {editingId === row.id ? (
                            <>
                              <td>
                                <select
                                  value={editForm.jobOrderId || selectedJobOrderId}
                                  onChange={(event) => onEditFormChange({ jobOrderId: event.target.value })}
                                >
                                  <option value="">Seleziona commessa</option>
                                  {jobOrders.map((jobOrder) => (
                                    <option key={jobOrder.id} value={jobOrder.id}>
                                      {jobOrder.name} ({jobOrder.type})
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td><input type="date" value={editForm.usageDate} onChange={(event) => onEditFormChange({ usageDate: event.target.value })} /></td>
                              <td><input list="delivery-note-supplier-suggestions" value={editForm.supplier} onChange={(event) => onEditFormChange({ supplier: event.target.value })} /></td>
                              <td><input list="delivery-note-description-suggestions" value={editForm.description} onChange={(event) => onEditFormChange({ description: event.target.value })} /></td>
                              <td>{row.validationStatusLabel}</td>
                              <td>
                                <div className="delivery-note-documents">
                                  {row.documents.map((document, index) => (
                                    <button
                                      key={document.id}
                                      type="button"
                                      className="document-link-button"
                                      onClick={() =>
                                        setPdfPreview({
                                          title: document.fileName,
                                          url: `/api/documentale/bolle/documenti/${document.id}`,
                                          subtitle: `${row.supplier} - ${formatItalianShortDate(row.usageDate)}`,
                                        })
                                      }
                                    >
                                      {row.documents.length > 1 ? `Vedi bolla pdf ${index + 1}` : "Vedi bolla pdf"}
                                    </button>
                                  ))}
                                  <label className="delivery-note-upload-inline">
                                    <span>
                                      {uploadingId === row.id
                                        ? "Caricamento..."
                                        : row.documents.length > 0
                                          ? "Sostituisci allegato"
                                          : "Allega"}
                                    </span>
                                    <input
                                      type="file"
                                      accept="application/pdf,image/*"
                                      disabled={Boolean(uploadingId)}
                                      onChange={(event) => {
                                        onUploadAttachment(row, event.target.files?.[0] ?? null, row.documents.length > 0);
                                        event.currentTarget.value = "";
                                      }}
                                    />
                                  </label>
                                </div>
                              </td>
                              <td>
                                <div className="material-diary-row-actions">
                                  <button type="button" className="ui-action-button" onClick={onUpdate} disabled={saving}>Salva</button>
                                  <button type="button" className="ui-nav-button" onClick={onCancelEdit}>Annulla</button>
                                  <button type="button" className="ui-danger-button" onClick={() => onDelete(row)} disabled={saving}>Elimina</button>
                                </div>
                              </td>
                            </>
                          ) : (
                            <>
                              <td>{jobOrders.find((jobOrder) => jobOrder.id === row.jobOrderId)?.name || "-"}</td>
                              <td>{formatItalianShortDate(row.usageDate)}</td>
                              <td><strong>{row.supplier}</strong></td>
                              <td>{row.description}</td>
                              <td>
                                <span className={`delivery-note-status delivery-note-status-${row.validationStatus.toLowerCase()}`}>
                                  {row.validationStatusLabel}
                                </span>
                              </td>
                              <td>
                                <div className="delivery-note-documents">
                                  {row.documents.length === 0 ? <span className="muted">Nessun allegato</span> : null}
                                  {row.documents.map((document, index) => (
                                    <button
                                      key={document.id}
                                      type="button"
                                      className="document-link-button"
                                      onClick={() =>
                                        setPdfPreview({
                                          title: document.fileName,
                                          url: `/api/documentale/bolle/documenti/${document.id}`,
                                          subtitle: `${row.supplier} - ${formatItalianShortDate(row.usageDate)}`,
                                        })
                                      }
                                    >
                                      {row.documents.length > 1 ? `Vedi bolla pdf ${index + 1}` : "Vedi bolla pdf"}
                                    </button>
                                  ))}
                                  {row.documents.length === 0 ? (
                                    <label className="delivery-note-upload-inline">
                                      <span>{uploadingId === row.id ? "Caricamento..." : "Allega"}</span>
                                      <input
                                        type="file"
                                        accept="application/pdf,image/*"
                                        disabled={Boolean(uploadingId)}
                                        onChange={(event) => {
                                          onUploadAttachment(row, event.target.files?.[0] ?? null);
                                          event.currentTarget.value = "";
                                        }}
                                      />
                                    </label>
                                  ) : null}
                                </div>
                              </td>
                              <td>
                                <div className="material-diary-row-actions">
                                  <button type="button" className="ui-icon-button ui-icon-button-edit" onClick={() => onStartEdit(row)} title="Modifica" aria-label="Modifica">
                                    <PencilIcon />
                                  </button>
                                  <button type="button" className="ui-icon-button ui-icon-button-danger" onClick={() => onDelete(row)} disabled={saving} title="Elimina" aria-label="Elimina">
                                    <TrashIcon />
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
      {pdfPreview ? (
        <PdfViewerModal
          title={pdfPreview.title}
          subtitle={pdfPreview.subtitle}
          url={pdfPreview.url}
          onClose={() => setPdfPreview(null)}
        />
      ) : null}
    </div>
  );
}

function DailyLogDateCard({
  referenceDate,
  loadingRows,
  onDateChange,
  onToday,
  onDuplicatePreviousDay,
  onPrint,
}: {
  referenceDate: string;
  loadingRows: boolean;
  onDateChange: (date: string) => void;
  onToday: () => void;
  onDuplicatePreviousDay: () => void;
  onPrint: () => void;
}) {
  const canNavigate = Boolean(referenceDate) && !loadingRows;

  return (
    <section className="diary-day-hero">
      <div className="diary-day-main">
        <div className="diary-day-head">
          <h1>Diario del Cantiere</h1>
        </div>
        <strong>{formatItalianLongDate(referenceDate)}</strong>
      </div>
      <div className="diary-day-actions">
        <button className="button diary-day-print-button" type="button" onClick={onPrint}>Stampa PDF</button>
        <label>
          <span>Cambia giorno</span>
          <div className="diary-day-date-input">
            <button
              type="button"
              className="diary-day-date-nav"
              onClick={() => onDateChange(shiftDate(referenceDate, -1))}
              disabled={!canNavigate}
              aria-label="Giorno precedente"
              title="Giorno precedente"
            >
              <ChevronLeftIcon />
            </button>
            <input type="date" value={referenceDate} onChange={(event) => onDateChange(event.target.value)} />
            <button
              type="button"
              className="diary-day-date-nav"
              onClick={() => onDateChange(shiftDate(referenceDate, 1))}
              disabled={!canNavigate}
              aria-label="Giorno successivo"
              title="Giorno successivo"
            >
              <ChevronRightIcon />
            </button>
          </div>
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

function DailyOvertimeAlerts({ alerts }: { alerts: DailyOvertimeAlert[] }) {
  if (alerts.length === 0) return null;

  return (
    <section className="diary-overtime-alert-row" aria-label="Avvisi straordinari giornata">
      {alerts.map((alert) => (
        <div
          key={alert.resourceName}
          className={`diary-overtime-alert diary-overtime-alert-${alert.severity}`}
        >
          {alert.severity === "excess" ? (
            <>
              <strong>{alert.resourceName}</strong>
              <span>verifica inserimento per {formatCompactHours(alert.overtimeHours)} ore di straordinari</span>
            </>
          ) : (
            <>
              <strong>{alert.resourceName}</strong>
              <span>{formatCompactHours(alert.overtimeHours)} ore di straordinari</span>
            </>
          )}
        </div>
      ))}
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
  onDuplicateRow,
  onRemoveRow,
  onChangeRow,
  onEditRow,
}: {
  rows: InternalEditableRow[];
  resources: ResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  onAddRow: () => void;
  onDuplicateRow: (localId: string) => void;
  onRemoveRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<InternalEditableRow>) => void;
  onEditRow: (localId: string) => void;
}) {
  return (
    <CompactDiarySection title="Risorse interne" subtitle="Personale e mezzi interni caricati a ore sulla commessa." onAddRow={onAddRow}>
      <div className="diary-compact-table">
        <div className="diary-compact-head diary-compact-head-internal">
          <span>Risorsa</span><span>Commessa</span><span>Ore</span><span>Descrizione</span><span>Azioni</span>
        </div>
        {rows.map((row, index) => {
          const isEditable = !row.isSaved || row.isEditing;
          const resourceName = row.resourceLabel || resources.find((resource) => resource.value === row.resourceValue)?.label || "-";
          const jobOrderName = row.jobOrderLabel || jobOrders.find((job) => job.id === row.jobOrderId)?.name || "-";

          return (
          <div key={row.localId} className={`diary-compact-row diary-compact-row-internal${isEditable ? "" : " diary-compact-row-readonly"}`}>
            {isEditable ? (
            <select value={row.resourceValue} onChange={(event) => onChangeRow(row.localId, { resourceValue: event.target.value })} disabled={loading || loadingRows}>
              <option value="">Seleziona risorsa</option>
              {resources.map((resource) => <option key={resource.value} value={resource.value}>{resource.label}</option>)}
            </select>
            ) : <div className="diary-readonly-value">{resourceName}</div>}
            {isEditable ? (
            <select value={row.jobOrderId} onChange={(event) => onChangeRow(row.localId, { jobOrderId: event.target.value })} disabled={loading || loadingRows}>
              <option value="">Seleziona commessa</option>
              {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
            </select>
            ) : <div className="diary-readonly-value">{jobOrderName}</div>}
            {isEditable ? (
            <input type="number" step="0.1" min="0.1" value={row.hours} onChange={(event) => onChangeRow(row.localId, { hours: event.target.value })} placeholder="0.0" disabled={loadingRows} />
            ) : <div className="diary-readonly-value">{row.hours || "-"}</div>}
            {isEditable ? (
            <textarea rows={1} className="diary-description-textarea" value={row.activityDescription} onChange={(event) => onChangeRow(row.localId, { activityDescription: event.target.value })} placeholder="Descrizione lavoro" disabled={loadingRows} />
            ) : <div className="diary-readonly-value diary-readonly-description">{row.activityDescription || "-"}</div>}
            <div className="diary-compact-actions">
              {!isEditable ? (
                <button type="button" className="diary-icon-action diary-icon-action-edit" onClick={() => onEditRow(row.localId)} disabled={loadingRows} title="Modifica riga" aria-label="Modifica riga">
                  <PencilIcon />
                </button>
              ) : null}
              <button type="button" className="diary-icon-action diary-icon-action-duplicate" onClick={() => onDuplicateRow(row.localId)} disabled={loadingRows} title="Duplica riga" aria-label="Duplica riga">
                <DuplicateRowIcon />
              </button>
              <button type="button" className="diary-icon-action diary-icon-action-delete" onClick={() => onRemoveRow(row.localId)} title={`Rimuovi riga ${index + 1}`} aria-label={`Rimuovi riga ${index + 1}`}>
                <TrashIcon />
              </button>
            </div>
          </div>
        );
        })}
      </div>
    </CompactDiarySection>
  );
}

function ExternalResourcesSection({
  rows,
  economyRows,
  externalResources,
  favoriteResourceNames,
  showFavoriteManager,
  jobOrders,
  loading,
  loadingRows,
  externalResourceDraft,
  showExternalResourceManager,
  savingExternalResource,
  onAddRow,
  onAddEconomyRow,
  onDuplicateRow,
  onDuplicateEconomyRow,
  onRemoveRow,
  onRemoveEconomyRow,
  onChangeRow,
  onChangeEconomyRow,
  onToggleFavoriteResource,
  onToggleFavoriteManager,
  onAddFavoriteRow,
  onEditRow,
  onEditEconomyRow,
  onToggleManager,
  onDraftChange,
  onAddExternalResource,
  onDeleteExternalResource,
}: {
  rows: ExternalEditableRow[];
  economyRows: ExternalEconomyEditableRow[];
  externalResources: ExternalResourceOption[];
  favoriteResourceNames: string[];
  showFavoriteManager: boolean;
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  externalResourceDraft: string;
  showExternalResourceManager: boolean;
  savingExternalResource: boolean;
  onAddRow: () => void;
  onAddEconomyRow: () => void;
  onDuplicateRow: (localId: string) => void;
  onDuplicateEconomyRow: (localId: string) => void;
  onRemoveRow: (localId: string) => void;
  onRemoveEconomyRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<ExternalEditableRow>) => void;
  onChangeEconomyRow: (localId: string, patch: Partial<ExternalEconomyEditableRow>) => void;
  onToggleFavoriteResource: (name: string) => void;
  onToggleFavoriteManager: () => void;
  onAddFavoriteRow: (name: string) => void;
  onEditRow: (localId: string) => void;
  onEditEconomyRow: (localId: string) => void;
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
      extraAction={
        <button type="button" className="mobile-button-secondary" onClick={onToggleFavoriteManager}>
          Seleziona preferiti
        </button>
      }
    >
      <datalist id="external-resource-suggestions">
        {externalResources.map((resource) => <option key={resource.id} value={resource.name} />)}
      </datalist>
      <datalist id="external-resource-favorite-suggestions">
        {favoriteResourceNames.map((name) => <option key={name} value={name} />)}
      </datalist>
      {showFavoriteManager ? (
        <div className="diary-favorite-manager">
          <div className="diary-favorite-manager-head">
            <strong>Preferiti fornitori</strong>
            {favoriteResourceNames.length > 0 ? (
              <select
                defaultValue=""
                onChange={(event) => {
                  onAddFavoriteRow(event.target.value);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Aggiungi riga da preferiti</option>
                {favoriteResourceNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="diary-favorite-picker">
            {externalResources.map((resource) => {
              const checked = favoriteResourceNames.some(
                (name) => name.trim().localeCompare(resource.name, "it", { sensitivity: "base" }) === 0
              );
              return (
                <label key={resource.id}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleFavoriteResource(resource.name)}
                  />
                  <span>{resource.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
      {favoriteResourceNames.length > 0 ? (
        <div className="diary-favorite-resource-strip">
          {favoriteResourceNames.slice(0, 8).map((name) => (
            <span key={name}>★ {name}</span>
          ))}
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
          onDuplicateRow={onDuplicateRow}
          onRemoveRow={onRemoveRow}
          onChangeRow={onChangeRow}
          onEditRow={onEditRow}
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
          onDuplicateRow={onDuplicateEconomyRow}
          onRemoveRow={onRemoveEconomyRow}
          onChangeRow={onChangeEconomyRow}
          onEditRow={onEditEconomyRow}
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
  onDuplicateRow,
  onRemoveRow,
  onChangeRow,
  onEditRow,
}: {
  rows: ExternalEditableRow[];
  externalResources: ExternalResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  quantityLabel: string;
  quantityKey: "days";
  onAddRow: () => void;
  onDuplicateRow: (localId: string) => void;
  onRemoveRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<ExternalEditableRow>) => void;
  onEditRow: (localId: string) => void;
}) {
  return (
    <div className="diary-compact-table">
      <div className="diary-compact-head diary-compact-head-external">
        <span>Risorsa</span><span>Commessa</span><span>{quantityLabel}</span><span>Descrizione</span><span>Azioni</span>
      </div>
      {rows.map((row, index) => {
        const isEditable = !row.isSaved || row.isEditing;
        const resourceName = row.externalResourceLabel || externalResources.find((resource) => resource.id === row.externalResourceId || resource.name === row.externalResourceId)?.name || row.externalResourceId || "-";
        const resourceInputValue = row.externalResourceLabel || row.externalResourceId;
        const jobOrderName = row.jobOrderLabel || jobOrders.find((job) => job.id === row.jobOrderId)?.name || "-";

        return (
        <div key={row.localId} className={`diary-compact-row diary-compact-row-external${isEditable ? "" : " diary-compact-row-readonly"}`}>
          {isEditable ? (
          <input
            value={resourceInputValue}
            onChange={(event) => onChangeRow(row.localId, { externalResourceId: event.target.value, externalResourceLabel: event.target.value })}
            list={resourceInputValue.trim() ? "external-resource-suggestions" : "external-resource-favorite-suggestions"}
            placeholder="Fornitore / societa"
            disabled={loading || loadingRows}
          />          ) : <div className="diary-readonly-value">{resourceName}</div>}
          {isEditable ? (
          <select value={row.jobOrderId} onChange={(event) => onChangeRow(row.localId, { jobOrderId: event.target.value })} disabled={loading || loadingRows}>
            <option value="">Seleziona commessa</option>
            {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
          </select>
          ) : <div className="diary-readonly-value">{jobOrderName}</div>}
          {isEditable ? (
          <input type="number" step="0.1" min="0.1" value={row[quantityKey]} onChange={(event) => onChangeRow(row.localId, { [quantityKey]: event.target.value })} placeholder="0.0" disabled={loadingRows} />
          ) : <div className="diary-readonly-value">{row[quantityKey] || "-"}</div>}
          {isEditable ? (
          <textarea rows={1} className="diary-description-textarea" value={row.activityDescription} onChange={(event) => onChangeRow(row.localId, { activityDescription: event.target.value })} placeholder="Descrizione attivita" disabled={loadingRows} />
          ) : <div className="diary-readonly-value diary-readonly-description">{row.activityDescription || "-"}</div>}
          <div className="diary-compact-actions">
            {!isEditable ? (
              <button type="button" className="diary-icon-action diary-icon-action-edit" onClick={() => onEditRow(row.localId)} disabled={loadingRows} title="Modifica riga" aria-label="Modifica riga">
                <PencilIcon />
              </button>
            ) : null}
            <button type="button" className="diary-icon-action diary-icon-action-duplicate" onClick={() => onDuplicateRow(row.localId)} disabled={loadingRows} title="Duplica riga" aria-label="Duplica riga">
              <DuplicateRowIcon />
            </button>
            <button type="button" className="diary-icon-action diary-icon-action-delete" onClick={() => onRemoveRow(row.localId)} title={`Rimuovi riga ${index + 1}`} aria-label={`Rimuovi riga ${index + 1}`}>
              <TrashIcon />
            </button>
          </div>
        </div>
      );
      })}
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
  onDuplicateRow,
  onRemoveRow,
  onChangeRow,
  onEditRow,
}: {
  rows: ExternalEconomyEditableRow[];
  externalResources: ExternalResourceOption[];
  jobOrders: JobOrderOption[];
  loading: boolean;
  loadingRows: boolean;
  onAddRow: () => void;
  onDuplicateRow: (localId: string) => void;
  onRemoveRow: (localId: string) => void;
  onChangeRow: (localId: string, patch: Partial<ExternalEconomyEditableRow>) => void;
  onEditRow: (localId: string) => void;
}) {
  return (
    <div className="diary-compact-table">
      <div className="diary-compact-head diary-compact-head-external">
        <span>Risorsa</span><span>Commessa</span><span>Ore</span><span>Descrizione</span><span>Azioni</span>
      </div>
      {rows.map((row, index) => {
        const isEditable = !row.isSaved || row.isEditing;
        const resourceName = row.externalResourceLabel || externalResources.find((resource) => resource.id === row.externalResourceId || resource.name === row.externalResourceId)?.name || row.externalResourceId || "-";
        const resourceInputValue = row.externalResourceLabel || row.externalResourceId;
        const jobOrderName = row.jobOrderLabel || jobOrders.find((job) => job.id === row.jobOrderId)?.name || "-";

        return (
        <div key={row.localId} className={`diary-compact-row diary-compact-row-external${isEditable ? "" : " diary-compact-row-readonly"}`}>
          {isEditable ? (
          <input
            value={resourceInputValue}
            onChange={(event) => onChangeRow(row.localId, { externalResourceId: event.target.value, externalResourceLabel: event.target.value })}
            list={resourceInputValue.trim() ? "external-resource-suggestions" : "external-resource-favorite-suggestions"}
            placeholder="Fornitore / societa"
            disabled={loading || loadingRows}
          />          ) : <div className="diary-readonly-value">{resourceName}</div>}
          {isEditable ? (
          <select value={row.jobOrderId} onChange={(event) => onChangeRow(row.localId, { jobOrderId: event.target.value })} disabled={loading || loadingRows}>
            <option value="">Seleziona commessa</option>
            {jobOrders.map((job) => <option key={job.id} value={job.id}>{job.name} ({job.type})</option>)}
          </select>
          ) : <div className="diary-readonly-value">{jobOrderName}</div>}
          {isEditable ? (
          <input type="number" step="0.1" min="0.1" value={row.hours} onChange={(event) => onChangeRow(row.localId, { hours: event.target.value })} placeholder="0.0" disabled={loadingRows} />
          ) : <div className="diary-readonly-value">{row.hours || "-"}</div>}
          {isEditable ? (
          <textarea rows={1} className="diary-description-textarea" value={row.activityDescription} onChange={(event) => onChangeRow(row.localId, { activityDescription: event.target.value })} placeholder="Descrizione attivita" disabled={loadingRows} />
          ) : <div className="diary-readonly-value diary-readonly-description">{row.activityDescription || "-"}</div>}
          <div className="diary-compact-actions">
            {!isEditable ? (
              <button type="button" className="diary-icon-action diary-icon-action-edit" onClick={() => onEditRow(row.localId)} disabled={loadingRows} title="Modifica riga" aria-label="Modifica riga">
                <PencilIcon />
              </button>
            ) : null}
            <button type="button" className="diary-icon-action diary-icon-action-duplicate" onClick={() => onDuplicateRow(row.localId)} disabled={loadingRows} title="Duplica riga" aria-label="Duplica riga">
              <DuplicateRowIcon />
            </button>
            <button type="button" className="diary-icon-action diary-icon-action-delete" onClick={() => onRemoveRow(row.localId)} title={`Rimuovi riga ${index + 1}`} aria-label={`Rimuovi riga ${index + 1}`}>
              <TrashIcon />
            </button>
          </div>
        </div>
      );
      })}
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

function DuplicateRowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M7 7h8v8H7z" />
      <path d="M11 11h8v8h-8z" />
      <path d="M4 5h1" />
      <path d="M17 19h3" />
      <text x="3.5" y="21" fontSize="6" fill="currentColor" stroke="none">x2</text>
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4z" />
      <path d="M13.5 6.5l4 4" />
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

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
