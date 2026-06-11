"use client";

import { useEffect, useMemo, useState } from "react";

type ReportDay = {
  iso: string;
  dayNumber: number;
  weekdayShort: string;
  isWeekend: boolean;
};

type ReportGroup = {
  key: "WORK" | "RAIN" | "LEAVE" | "NATIONAL_HOLIDAY" | "SICKNESS";
  label: string;
  values: number[];
  total: number;
};

type ReportWorkDetail = {
  jobOrderId: string;
  jobOrderName: string;
  values: number[];
  total: number;
};

type ReportResource = {
  id: string;
  fullName: string;
  roleDescription: string;
  expectedDailyHours: number;
  groups: ReportGroup[];
  workDetails: ReportWorkDetail[];
  total: number;
  hasHours: boolean;
  isAlwaysSelectable: boolean;
  isWorker: boolean;
};

type MonthlyReportResponse = {
  month: number;
  year: number;
  days: ReportDay[];
  resources: ReportResource[];
};

function getCurrentMonth() {
  const now = new Date();
  return {
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function formatMonthInput(month: number) {
  return String(month).padStart(2, "0");
}

function formatHours(value: number) {
  if (!value) return "";
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatMonthLabel(month: number, year: number) {
  return new Date(year, month - 1, 1).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
  });
}

async function safeJsonFetch(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Errore caricamento report");
  }

  return data as MonthlyReportResponse;
}

export default function StampaRisorseMesePage() {
  const current = getCurrentMonth();
  const [month, setMonth] = useState(current.month);
  const [year, setYear] = useState(current.year);
  const [report, setReport] = useState<MonthlyReportResponse | null>(null);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[] | null>(null);
  const [isResourceFilterOpen, setIsResourceFilterOpen] = useState(false);
  const [expandedWorkResourceIds, setExpandedWorkResourceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReport(targetMonth = month, targetYear = year) {
    setLoading(true);
    setError("");

    try {
      const data = await safeJsonFetch(
        `/api/stampa-risorse-mese?month=${targetMonth}&year=${targetYear}`
      );
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore imprevisto");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, []);

  const visibleResources = useMemo(
    () => {
      const printableResources = (report?.resources ?? []).filter(
        (resource) => resource.hasHours || resource.isAlwaysSelectable
      );

      if (selectedResourceIds === null) {
        return printableResources;
      }

      const selectedIds = new Set(selectedResourceIds);
      return printableResources.filter((resource) => selectedIds.has(resource.id));
    },
    [report, selectedResourceIds]
  );

  const filterableResources = useMemo(
    () =>
      (report?.resources ?? []).filter(
        (resource) => resource.hasHours || resource.isAlwaysSelectable
      ),
    [report]
  );

  const selectedResourceSummary = useMemo(() => {
    if (selectedResourceIds === null) {
      return "Tutte le risorse";
    }

    if (selectedResourceIds.length === 0) {
      return "Nessuna risorsa selezionata";
    }

    if (selectedResourceIds.length === 1) {
      const selected = filterableResources.find((resource) => resource.id === selectedResourceIds[0]);
      return selected?.fullName ?? "1 risorsa selezionata";
    }

    return `${selectedResourceIds.length} risorse selezionate`;
  }, [filterableResources, selectedResourceIds]);

  function toggleResource(resourceId: string) {
    setSelectedResourceIds((current) =>
      (current ?? filterableResources.map((resource) => resource.id)).includes(resourceId)
        ? (current ?? filterableResources.map((resource) => resource.id)).filter(
            (selectedId) => selectedId !== resourceId
          )
        : [...(current ?? []), resourceId]
    );
  }

  function selectAllResources() {
    setSelectedResourceIds(null);
    setIsResourceFilterOpen(false);
  }

  function clearSelectedResources() {
    setSelectedResourceIds([]);
    setIsResourceFilterOpen(false);
  }

  function isResourceSelected(resourceId: string) {
    return selectedResourceIds === null || selectedResourceIds.includes(resourceId);
  }

  function toggleWorkDetails(resourceId: string) {
    setExpandedWorkResourceIds((current) =>
      current.includes(resourceId)
        ? current.filter((id) => id !== resourceId)
        : [...current, resourceId]
    );
  }

  function printReport() {
    setExpandedWorkResourceIds(
      visibleResources
        .filter((resource) => resource.isWorker && resource.workDetails.length > 0)
        .map((resource) => resource.id)
    );
    window.setTimeout(() => window.print(), 0);
  }

  const selectedResourceCount =
    selectedResourceIds === null ? filterableResources.length : visibleResources.length;

  return (
    <div className="report-page">
      <div className="card report-toolbar">
        <div>
          <h1 style={{ margin: 0 }}>Stampa risorse mese</h1>
          <p className="muted" style={{ marginBottom: 0 }}>
            Report mensile ore personale raggruppate in Ore lavorate, Pioggia, Ferie,
            Festività e Malattia.
          </p>
        </div>

        <div className="report-toolbar-actions">
          <label className="report-control">
            <span>Mese</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, index) => index + 1).map((item) => (
                <option key={item} value={item}>
                  {formatMonthInput(item)}
                </option>
              ))}
            </select>
          </label>

          <label className="report-control">
            <span>Anno</span>
            <input
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>

          <button type="button" className="button" onClick={() => loadReport()}>
            Visualizza
          </button>
          <button type="button" className="report-print-btn" onClick={printReport}>
            Stampa / PDF
          </button>
        </div>
      </div>

      {error ? <div className="scad-error">{error}</div> : null}

      {filterableResources.length > 0 ? (
        <div
          className={`card report-filter-card ${
            isResourceFilterOpen ? "report-filter-card-open" : ""
          }`}
        >
          <div className="stats-multi report-resource-filter">
            <span>Risorse da inserire nella stampa</span>
            <button
              type="button"
              className="stats-multi-trigger"
              onClick={() => setIsResourceFilterOpen((current) => !current)}
              aria-expanded={isResourceFilterOpen}
            >
              <span className="stats-multi-summary">{selectedResourceSummary}</span>
              <span className="stats-multi-caret">v</span>
            </button>

            {isResourceFilterOpen ? (
              <div className="stats-multi-menu">
                <button
                  type="button"
                  className="report-resource-filter-action"
                  onClick={selectAllResources}
                >
                  Seleziona tutte
                </button>
                <button
                  type="button"
                  className="report-resource-filter-action"
                  onClick={clearSelectedResources}
                >
                  Deseleziona tutte
                </button>

                {filterableResources.map((resource) => (
                  <label key={resource.id} className="stats-multi-option">
                    <input
                      type="checkbox"
                      checked={isResourceSelected(resource.id)}
                      onChange={() => toggleResource(resource.id)}
                    />
                    <span>{resource.fullName}</span>
                  </label>
                ))}
              </div>
            ) : null}
          </div>
          <span className="muted">
            {selectedResourceCount} su {filterableResources.length} risorse incluse
          </span>
        </div>
      ) : null}

      <div className="card report-sheet">
        <div className="report-sheet-header">
          <div className="report-title-block">
            <strong className="report-main-title">Stampa risorse mese</strong>
            <div className="muted">Report mensile personale per tipologia ore</div>
          </div>
          <div className="report-period-card">
            <span className="report-period-label">Periodo di riferimento</span>
            <div className="report-period">{formatMonthLabel(month, year)}</div>
          </div>
        </div>

        {loading ? (
          <div className="muted">Caricamento report...</div>
        ) : !report || visibleResources.length === 0 ? (
          <div className="muted">
            {filterableResources.length > 0
              ? "Nessuna risorsa selezionata per la stampa."
              : "Nessuna attività personale trovata per il periodo selezionato."}
          </div>
        ) : (
          <div className="report-table-wrap">
            <table className="report-table">
              <thead>
                <tr>
                  <th rowSpan={2} className="report-fixed-col report-group-col">
                    Tipo
                  </th>
                  {report.days.map((day) => (
                    <th
                      key={`${day.iso}-name`}
                      className={day.isWeekend ? "report-weekend" : ""}
                    >
                      {day.weekdayShort}
                    </th>
                  ))}
                  <th rowSpan={2} className="report-total-col">
                    Totale
                  </th>
                </tr>
                <tr>
                  {report.days.map((day) => (
                    <th
                      key={`${day.iso}-number`}
                      className={day.isWeekend ? "report-weekend" : ""}
                    >
                      <span className="report-day-number">{day.dayNumber}/{report.month}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleResources.map((resource) => {
                  const isWorkExpanded = expandedWorkResourceIds.includes(resource.id);
                  const hasWorkDetails = resource.isWorker && resource.workDetails.length > 0;
                  const resourceHeader = (
                    <tr key={`${resource.id}-header`} className="report-resource-header-row">
                      <td colSpan={report.days.length + 2}>
                        <strong>{resource.fullName}</strong>
                        <span>(Totale mese: {formatHours(resource.total) || "0"})</span>
                      </td>
                    </tr>
                  );

                  const resourceRows = resource.groups.flatMap((group, groupIndex) => {
                    const isWorkTotalRow = group.key === "WORK" && hasWorkDetails;
                    const groupRow = (
                    <tr
                      key={`${resource.id}-${group.key}`}
                      className={isWorkTotalRow ? "report-work-total-row" : ""}
                    >
                      <td
                        className={[
                          "report-group-name",
                          groupIndex === 0 ? "report-resource-start" : "",
                          groupIndex === resource.groups.length - 1 ? "report-resource-end" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {group.key === "WORK" && hasWorkDetails ? (
                          <button
                            type="button"
                            className="report-work-accordion-trigger"
                            onClick={() => toggleWorkDetails(resource.id)}
                            aria-expanded={isWorkExpanded}
                          >
                            <span>{group.label}</span>
                            <span>{isWorkExpanded ? "-" : "+"}</span>
                          </button>
                        ) : (
                          group.label
                        )}
                      </td>
                      {group.values.map((value, valueIndex) => (
                        <td
                          key={`${resource.id}-${group.key}-${valueIndex}`}
                          className={[
                            report.days[valueIndex]?.isWeekend ? "report-weekend" : "",
                            value > resource.expectedDailyHours ? "report-overtime-cell" : "",
                            groupIndex === 0 ? "report-resource-start" : "",
                            groupIndex === resource.groups.length - 1 ? "report-resource-end" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <span className="report-hour-value">{formatHours(value)}</span>
                        </td>
                      ))}
                      <td
                        className={[
                          "report-total-value",
                          groupIndex === 0 ? "report-resource-start" : "",
                          groupIndex === resource.groups.length - 1 ? "report-resource-end" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span className="report-hour-value">{formatHours(group.total)}</span>
                      </td>
                    </tr>
                    );

                    if (group.key !== "WORK" || !hasWorkDetails) {
                      return [groupRow];
                    }

                    const detailRows = resource.workDetails.map((detail) => (
                      <tr
                        key={`${resource.id}-work-detail-${detail.jobOrderId}`}
                        className={[
                          "report-work-detail-row",
                          isWorkExpanded ? "report-work-detail-row-open" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <td className="report-work-detail-name">{detail.jobOrderName}</td>
                        {detail.values.map((value, valueIndex) => (
                          <td
                            key={`${resource.id}-${detail.jobOrderId}-${valueIndex}`}
                            className={report.days[valueIndex]?.isWeekend ? "report-weekend" : ""}
                          >
                            <span className="report-hour-value">{formatHours(value)}</span>
                          </td>
                        ))}
                        <td className="report-total-value">
                          <span className="report-hour-value">{formatHours(detail.total)}</span>
                        </td>
                      </tr>
                    ));

                    return [groupRow, ...detailRows];
                  });

                  return [resourceHeader, ...resourceRows];
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
