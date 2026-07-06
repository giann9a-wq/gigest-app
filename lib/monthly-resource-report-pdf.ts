import type {
  MonthlyReportGroup,
  MonthlyReportResource,
  MonthlyReportWorkDetail,
  MonthlyResourceReport,
} from "@/lib/monthly-resource-report";

type PdfPage = {
  commands: string[];
};

type PdfRow =
  | { type: "resource"; resource: MonthlyReportResource }
  | { type: "group"; resource: MonthlyReportResource; group: MonthlyReportGroup; groupIndex: number }
  | { type: "detail"; resource: MonthlyReportResource; detail: MonthlyReportWorkDetail };

const PAGE_WIDTH = 842;
const PAGE_HEIGHT = 595;
const MARGIN = 24;
const TABLE_WIDTH = PAGE_WIDTH - MARGIN * 2;
const GROUP_COL_WIDTH = 112;
const TOTAL_COL_WIDTH = 38;
const TITLE_HEIGHT = 42;
const TABLE_HEAD_ROW_HEIGHT = 15;
const RESOURCE_ROW_HEIGHT = 14;
const GROUP_ROW_HEIGHT = 16;
const DETAIL_ROW_HEIGHT = 14;
const BOTTOM_MARGIN = 24;

function escapePdfText(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function padOffset(value: number) {
  return String(value).padStart(10, "0");
}

function formatNumber(value: number, maxFractionDigits = 3) {
  const rounded = Number(value.toFixed(maxFractionDigits));
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

function color(value: string) {
  const normalized = value.replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return `${formatNumber(red)} ${formatNumber(green)} ${formatNumber(blue)}`;
}

function fillRect(commands: string[], x: number, y: number, width: number, height: number, fill: string) {
  commands.push(`q ${color(fill)} rg ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re f Q`);
}

function strokeRect(commands: string[], x: number, y: number, width: number, height: number, stroke = "#2f2f2f") {
  commands.push(
    `q 0.35 w ${color(stroke)} RG ${formatNumber(x)} ${formatNumber(y)} ${formatNumber(width)} ${formatNumber(height)} re S Q`
  );
}

function truncateText(value: string, maxChars: number) {
  if (value.length <= maxChars) return value;
  if (maxChars <= 1) return value.slice(0, maxChars);
  return `${value.slice(0, maxChars - 1)}.`;
}

function drawText(commands: string[], input: {
  text: string;
  x: number;
  y: number;
  size: number;
  bold?: boolean;
  fill?: string;
  maxChars?: number;
}) {
  const text = truncateText(input.text, input.maxChars ?? 120);
  const font = input.bold ? "F2" : "F1";
  commands.push(
    `BT /${font} ${formatNumber(input.size)} Tf ${color(input.fill ?? "#111827")} rg ${formatNumber(input.x)} ${formatNumber(input.y)} Td (${escapePdfText(text)}) Tj ET`
  );
}

function drawCenteredText(commands: string[], text: string, x: number, y: number, width: number, size: number, bold = false) {
  const maxChars = Math.max(1, Math.floor(width / (size * 0.48)));
  const clipped = truncateText(text, maxChars);
  const approxWidth = clipped.length * size * 0.48;
  drawText(commands, {
    text: clipped,
    x: x + Math.max(1, (width - approxWidth) / 2),
    y,
    size,
    bold,
  });
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
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function getDayWidth(report: MonthlyResourceReport) {
  return (TABLE_WIDTH - GROUP_COL_WIDTH - TOTAL_COL_WIDTH) / report.days.length;
}

function drawTableHeader(page: PdfPage, report: MonthlyResourceReport, y: number) {
  const dayWidth = getDayWidth(report);
  const topY = y - TABLE_HEAD_ROW_HEIGHT;
  const secondY = topY - TABLE_HEAD_ROW_HEIGHT;

  fillRect(page.commands, MARGIN, secondY, TABLE_WIDTH, TABLE_HEAD_ROW_HEIGHT * 2, "#f6f7f9");
  strokeRect(page.commands, MARGIN, secondY, GROUP_COL_WIDTH, TABLE_HEAD_ROW_HEIGHT * 2);
  drawCenteredText(page.commands, "Tipo", MARGIN, secondY + 10, GROUP_COL_WIDTH, 8.2, true);

  report.days.forEach((day, index) => {
    const x = MARGIN + GROUP_COL_WIDTH + index * dayWidth;
    const fill = day.isWeekend ? "#ececec" : "#f6f7f9";
    fillRect(page.commands, x, topY, dayWidth, TABLE_HEAD_ROW_HEIGHT, fill);
    fillRect(page.commands, x, secondY, dayWidth, TABLE_HEAD_ROW_HEIGHT, fill);
    strokeRect(page.commands, x, topY, dayWidth, TABLE_HEAD_ROW_HEIGHT);
    strokeRect(page.commands, x, secondY, dayWidth, TABLE_HEAD_ROW_HEIGHT);
    drawCenteredText(page.commands, day.weekdayShort, x, topY + 5, dayWidth, 5.2, true);
    drawCenteredText(page.commands, `${day.dayNumber}/${report.month}`, x, secondY + 5, dayWidth, 5.8, true);
  });

  const totalX = MARGIN + GROUP_COL_WIDTH + report.days.length * dayWidth;
  strokeRect(page.commands, totalX, secondY, TOTAL_COL_WIDTH, TABLE_HEAD_ROW_HEIGHT * 2);
  drawCenteredText(page.commands, "Totale", totalX, secondY + 10, TOTAL_COL_WIDTH, 8.2, true);

  return secondY;
}

function drawPageTitle(page: PdfPage, report: MonthlyResourceReport, pageNumber: number, pageCount: number) {
  drawText(page.commands, {
    text: "Stampa risorse mese",
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 4,
    size: 14,
    bold: true,
  });
  drawText(page.commands, {
    text: `Periodo: ${formatMonthLabel(report.month, report.year)}`,
    x: MARGIN,
    y: PAGE_HEIGHT - MARGIN - 20,
    size: 8,
    fill: "#374151",
  });
  drawText(page.commands, {
    text: `Pagina ${pageNumber} di ${pageCount}`,
    x: PAGE_WIDTH - MARGIN - 68,
    y: PAGE_HEIGHT - MARGIN - 20,
    size: 8,
    fill: "#374151",
  });
}

function getRowHeight(row: PdfRow) {
  if (row.type === "resource") return RESOURCE_ROW_HEIGHT;
  if (row.type === "detail") return DETAIL_ROW_HEIGHT;
  return GROUP_ROW_HEIGHT;
}

function isWorkedNonWorkingDay(resource: MonthlyReportResource, value: number, valueIndex: number) {
  const holidayGroup = resource.groups.find((group) => group.key === "NATIONAL_HOLIDAY");
  return value > 0 && ((holidayGroup?.values[valueIndex] ?? 0) > 0);
}

function drawBodyRow(page: PdfPage, report: MonthlyResourceReport, row: PdfRow, y: number) {
  const dayWidth = getDayWidth(report);
  const height = getRowHeight(row);
  const rowY = y - height;

  if (row.type === "resource") {
    fillRect(page.commands, MARGIN, rowY, TABLE_WIDTH, height, "#fde7dc");
    strokeRect(page.commands, MARGIN, rowY, TABLE_WIDTH, height);
    drawText(page.commands, {
      text: `${row.resource.fullName} (Totale mese: ${formatHours(row.resource.total) || "0"})`,
      x: MARGIN + 4,
      y: rowY + 4,
      size: 8.3,
      bold: true,
    });
    return rowY;
  }

  const values = row.type === "group" ? row.group.values : row.detail.values;
  const total = row.type === "group" ? row.group.total : row.detail.total;
  const label = row.type === "group" ? row.group.label : row.detail.jobOrderName;
  const labelFill = row.type === "detail" ? "#f9fafb" : "#ffffff";

  fillRect(page.commands, MARGIN, rowY, GROUP_COL_WIDTH, height, labelFill);
  strokeRect(page.commands, MARGIN, rowY, GROUP_COL_WIDTH, height);
  drawText(page.commands, {
    text: label,
    x: row.type === "detail" ? MARGIN + 8 : MARGIN + 5,
    y: rowY + 4,
    size: row.type === "detail" ? 6.7 : 8,
    bold: row.type === "group" && row.group.key === "WORK" && row.resource.workDetails.length > 0,
    fill: row.type === "detail" ? "#374151" : "#111827",
    maxChars: row.type === "detail" ? 24 : 22,
  });

  values.forEach((value, index) => {
    const day = report.days[index];
    const x = MARGIN + GROUP_COL_WIDTH + index * dayWidth;
    const hasWorkedHolidayHours =
      row.type === "group"
        ? row.group.key === "WORK" && isWorkedNonWorkingDay(row.resource, value, index)
        : isWorkedNonWorkingDay(row.resource, value, index);
    const hasWorkedWeekendHours = value > 0 && Boolean(day?.isWeekend) && (row.type === "detail" || row.group.key === "WORK");
    const isOvertime = row.type === "group" && value > row.resource.expectedDailyHours;
    const fill = hasWorkedWeekendHours || hasWorkedHolidayHours || isOvertime ? "#dff3ff" : day?.isWeekend ? "#ececec" : "#ffffff";

    fillRect(page.commands, x, rowY, dayWidth, height, fill);
    strokeRect(page.commands, x, rowY, dayWidth, height);
    drawCenteredText(page.commands, formatHours(value), x, rowY + 4, dayWidth, row.type === "detail" ? 7.2 : 8.5, value > 0);
  });

  const totalX = MARGIN + GROUP_COL_WIDTH + report.days.length * dayWidth;
  fillRect(page.commands, totalX, rowY, TOTAL_COL_WIDTH, height, "#ffffff");
  strokeRect(page.commands, totalX, rowY, TOTAL_COL_WIDTH, height);
  drawCenteredText(page.commands, formatHours(total) || "0", totalX, rowY + 4, TOTAL_COL_WIDTH, row.type === "detail" ? 7.2 : 8.5, true);

  return rowY;
}

function buildRows(resources: MonthlyReportResource[]) {
  const rows: PdfRow[] = [];

  for (const resource of resources) {
    rows.push({ type: "resource", resource });

    resource.groups.forEach((group, groupIndex) => {
      rows.push({ type: "group", resource, group, groupIndex });

      if (group.key === "WORK" && resource.isWorker && resource.workDetails.length > 0) {
        for (const detail of resource.workDetails) {
          rows.push({ type: "detail", resource, detail });
        }
      }
    });
  }

  return rows;
}

function createStyledPdf(report: MonthlyResourceReport, resources: MonthlyReportResource[]) {
  const rows = buildRows(resources);
  const pages: PdfPage[] = [];
  let currentPage: PdfPage | null = null;
  let y = 0;

  function startPage() {
    currentPage = { commands: [] };
    pages.push(currentPage);
    y = PAGE_HEIGHT - MARGIN - TITLE_HEIGHT;
    y = drawTableHeader(currentPage, report, y);
  }

  startPage();

  for (const row of rows) {
    const rowHeight = getRowHeight(row);
    if (y - rowHeight < BOTTOM_MARGIN) {
      startPage();
    }

    y = drawBodyRow(currentPage!, report, row, y);
  }

  pages.forEach((page, index) => drawPageTitle(page, report, index + 1, pages.length));

  const fontObjectNumber = 3 + pages.length * 2;
  const pageObjectNumbers = Array.from({ length: pages.length }, (_, index) => 3 + index * 2);
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((objectNumber) => `${objectNumber} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];

  pages.forEach((page, index) => {
    const pageObjectNumber = 3 + index * 2;
    const contentObjectNumber = pageObjectNumber + 1;
    const content = page.commands.join("\n");

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R /F2 ${fontObjectNumber + 1} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(content, "utf8")} >>\nstream\n${content}\nendstream`);
  });

  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");

  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${object}\nendobj\n`);
  });

  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");
  for (let index = 1; index < offsets.length; index += 1) {
    chunks.push(`${padOffset(offsets[index])} 00000 n \n`);
  }
  chunks.push(
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info << /Title (${escapePdfText(`Stampa risorse ${formatMonthLabel(report.month, report.year)}`)}) >> >>\nstartxref\n${xrefOffset}\n%%EOF`
  );

  return Buffer.from(chunks.join(""), "utf8");
}

export function buildMonthlyResourceReportPdf(report: MonthlyResourceReport) {
  const printableResources = report.resources.filter(
    (resource) => resource.hasHours || resource.isAlwaysSelectable
  );

  return createStyledPdf(report, printableResources);
}

export function buildMonthlyResourceReportFileName(month: number, year: number) {
  return `stampa-risorse-${year}-${String(month).padStart(2, "0")}.pdf`;
}
