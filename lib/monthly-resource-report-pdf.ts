import { createTextPdf } from "@/lib/simple-pdf";
import type { MonthlyResourceReport } from "@/lib/monthly-resource-report";

function formatHours(value: number) {
  if (!value) return "";
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("it-IT", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatMonthLabel(month: number, year: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function chunkLines(lines: string[], maxLinesPerPage: number) {
  const pages: string[][] = [];
  for (let index = 0; index < lines.length; index += maxLinesPerPage) {
    pages.push(lines.slice(index, index + maxLinesPerPage));
  }
  return pages;
}

export function buildMonthlyResourceReportPdf(report: MonthlyResourceReport) {
  const printableResources = report.resources.filter(
    (resource) => resource.hasHours || resource.isAlwaysSelectable
  );
  const dayHeader = report.days.map((day) => String(day.dayNumber).padStart(2, "0")).join(" ");
  const lines: string[] = [
    "GiGEST - Stampa risorse mese",
    `Periodo: ${formatMonthLabel(report.month, report.year)}`,
    "",
    `Risorse incluse: ${printableResources.length}`,
    "",
  ];

  for (const resource of printableResources) {
    lines.push(`${resource.fullName} - Totale mese: ${formatHours(resource.total) || "0"}`);
    lines.push(`Tipo                     ${dayHeader} | Totale`);

    for (const group of resource.groups) {
      const values = group.values.map((value) => (formatHours(value) || "-").padStart(2, " ")).join(" ");
      lines.push(`${group.label.padEnd(24, " ")} ${values} | ${formatHours(group.total) || "0"}`);

      if (group.key === "WORK" && resource.isWorker && resource.workDetails.length > 0) {
        for (const detail of resource.workDetails) {
          const detailValues = detail.values.map((value) => (formatHours(value) || "-").padStart(2, " ")).join(" ");
          lines.push(`  ${detail.jobOrderName.slice(0, 22).padEnd(22, " ")} ${detailValues} | ${formatHours(detail.total) || "0"}`);
        }
      }
    }

    lines.push("");
  }

  return createTextPdf({
    title: `Stampa risorse ${formatMonthLabel(report.month, report.year)}`,
    pages: chunkLines(lines, 48),
    landscape: true,
  });
}

export function buildMonthlyResourceReportFileName(month: number, year: number) {
  return `stampa-risorse-${year}-${String(month).padStart(2, "0")}.pdf`;
}
