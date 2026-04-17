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

type ReportResource = {
  id: string;
  fullName: string;
  groups: ReportGroup[];
  total: number;
  hasHours: boolean;
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
      const resourcesWithHours = (report?.resources ?? []).filter((resource) => resource.hasHours);

      if (selectedResourceIds === null) {
        return resourcesWithHours;
      }

      const selectedIds = new Set(selectedResourceIds);
      return resourcesWithHours.filter((resource) => selectedIds.has(resource.id));
    },
    [report, selectedResourceIds]
  );

  const filterableResources = useMemo(
    () => (report?.resources ?? []).filter((resource) => resource.hasHours),
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
          <button type="button" className="report-print-btn" onClick={() => window.print()}>
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
            <div className="report-kicker">GiGEST</div>
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
                  <th rowSpan={2} className="report-fixed-col report-resource-col">
                    Risorsa
                  </th>
                  <th rowSpan={2} className="report-fixed-col report-group-col">
                    Raggruppamento
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
                      {day.dayNumber}/{report.month}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleResources.map((resource) =>
                  resource.groups.map((group, groupIndex) => (
                    <tr key={`${resource.id}-${group.key}`}>
                      {groupIndex === 0 ? (
                        <>
                          <td rowSpan={resource.groups.length} className="report-resource-name">
                            <div className="report-resource-block">
                              <strong>{resource.fullName}</strong>
                              <span className="report-resource-total">
                                Totale mese: {formatHours(resource.total)}
                              </span>
                            </div>
                          </td>
                        </>
                      ) : null}
                      <td
                        className={[
                          "report-group-name",
                          groupIndex === 0 ? "report-resource-start" : "",
                          groupIndex === resource.groups.length - 1 ? "report-resource-end" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {group.label}
                      </td>
                      {group.values.map((value, valueIndex) => (
                        <td
                          key={`${resource.id}-${group.key}-${valueIndex}`}
                          className={[
                            report.days[valueIndex]?.isWeekend ? "report-weekend" : "",
                            groupIndex === 0 ? "report-resource-start" : "",
                            groupIndex === resource.groups.length - 1 ? "report-resource-end" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          {formatHours(value)}
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
                        {formatHours(group.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
