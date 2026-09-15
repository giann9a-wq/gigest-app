import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

type PdfLine = {
  code: string | null;
  description: string;
  unit: string;
  quantity: unknown;
  unitPrice: unknown;
  discountPercent: unknown;
};

type PdfChapter = {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  lines: PdfLine[];
};

type PdfTextSection = { title: string; content: string };

export type QuotePdfInput = {
  number: string;
  title: string;
  customerName: string;
  customerContact: string | null;
  siteAddress: string | null;
  description: string | null;
  plannedStartDate: Date | null;
  plannedEndDate: Date | null;
  generalDiscountPercent: unknown;
  savedAt: Date | null;
  updatedAt: Date;
  chapters: PdfChapter[];
  textSections: PdfTextSection[];
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const LEFT = 76;
const RIGHT = 58;
const TOP = 142;
const BOTTOM = 765;
const CONTENT_WIDTH = PAGE_WIDTH - LEFT - RIGHT;
const RED = "#9f1118";
const DARK = "#252525";
const MID = "#5f6368";
const LIGHT = "#e9e9e9";

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function money(value: number) {
  return `${new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} €`;
}

function quantity(value: unknown) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 3 }).format(numberValue(value));
}

function date(value: Date) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(value);
}

function alphabeticId(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

export async function createQuotePdf(quote: QuotePdfInput) {
  const letterhead = `data:image/jpeg;base64,${fs.readFileSync(path.join(process.cwd(), "assets", "branding", "giani-letterhead-header.jpg")).toString("base64")}`;
  const doc = new PDFDocument({ size: "A4", margin: 0, bufferPages: true, autoFirstPage: false, info: { Title: `Preventivo ${quote.number}`, Author: "Impresa Giani Giovanni S.r.l." } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const completed = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  function addPage() {
    doc.addPage();
    doc.image(letterhead, 28, 12, { width: 396.72, height: 87.12 });
    doc.x = LEFT;
    doc.y = TOP;
  }

  function ensureSpace(height: number) {
    if (doc.y + height > BOTTOM) addPage();
  }

  function sectionTitle(title: string) {
    ensureSpace(30);
    doc.y += 4;
    const y = doc.y;
    const titleHeight = doc.font("Helvetica-Bold").fontSize(11).heightOfString(title, { width: CONTENT_WIDTH });
    doc.fillColor(DARK).text(title, LEFT, y, { width: CONTENT_WIDTH });
    const lineY = y + titleHeight + 3;
    doc.moveTo(LEFT, lineY).lineTo(LEFT + CONTENT_WIDTH, lineY).lineWidth(0.8).strokeColor(RED).stroke();
    doc.y = lineY + 8;
  }

  function paragraph(text: string) {
    if (!text.trim()) return;
    doc.font("Helvetica").fontSize(9.2).fillColor(DARK);
    const wrappedLines: string[] = [];
    for (const rawLine of text.replace(/\r/g, "").split("\n")) {
      if (!rawLine.trim()) {
        wrappedLines.push("");
        continue;
      }
      let current = "";
      for (const word of rawLine.split(/\s+/)) {
        const candidate = current ? `${current} ${word}` : word;
        if (current && doc.widthOfString(candidate) > CONTENT_WIDTH) {
          wrappedLines.push(current);
          current = word;
        } else current = candidate;
      }
      if (current) wrappedLines.push(current);
    }
    for (const line of wrappedLines) {
      ensureSpace(13);
      const y = doc.y;
      if (line) doc.text(line, LEFT, y, { width: CONTENT_WIDTH, lineBreak: false });
      doc.y = y + 12.5;
    }
    doc.y += 5;
  }

  const columns = [
    { key: "id", label: "ID", width: 34, align: "center" as const },
    { key: "description", label: "Descrizione", width: 196, align: "left" as const },
    { key: "unit", label: "U.M.", width: 32, align: "center" as const },
    { key: "quantity", label: "Quantità", width: 42, align: "right" as const },
    { key: "unitPrice", label: "Prezzo", width: 58, align: "right" as const },
    { key: "discount", label: "Sc.", width: 38, align: "right" as const },
    { key: "total", label: "Totale", width: 61, align: "right" as const },
  ];

  function tableHeader() {
    const height = 22;
    const y = doc.y;
    doc.save().rect(LEFT, y, CONTENT_WIDTH, height).fill("#55585c").restore();
    let x = LEFT;
    for (const column of columns) {
      doc.font("Helvetica-Bold").fontSize(7.2).fillColor("#ffffff").text(column.label, x + 3, y + 7, { width: column.width - 6, align: column.align, lineBreak: false });
      x += column.width;
    }
    doc.y = y + height;
  }

  function chapterHeader(chapter: PdfChapter) {
    ensureSpace(125);
    const fill = chapter.parentId ? "#ececec" : "#d2d2d2";
    const title = chapter.parentId ? chapter.title : chapter.title.toUpperCase();
    const titleHeight = doc.font("Helvetica-Bold").fontSize(chapter.parentId ? 9 : 9.5).heightOfString(title, { width: CONTENT_WIDTH - 14 });
    const height = Math.max(24, titleHeight + 12);
    const y = doc.y;
    doc.save().rect(LEFT, y, CONTENT_WIDTH, height).fill(fill).restore();
    doc.fillColor(DARK).text(title, LEFT + 7, y + 6, { width: CONTENT_WIDTH - 14 });
    doc.y = y + height;
    if (chapter.description?.trim()) {
      const descriptionHeight = doc.font("Helvetica-Oblique").fontSize(8).heightOfString(chapter.description, { width: CONTENT_WIDTH - 12 });
      ensureSpace(descriptionHeight + 10);
      const descriptionY = doc.y;
      doc.fillColor(MID).text(chapter.description, LEFT + 6, descriptionY + 4, { width: CONTENT_WIDTH - 12, lineGap: 1 });
      doc.y = descriptionY + descriptionHeight + 10;
    }
  }

  function lineRow(line: PdfLine, chapter: PdfChapter, rowIndex: number, identifier: string) {
    const gross = numberValue(line.quantity) * numberValue(line.unitPrice);
    const total = gross * (1 - numberValue(line.discountPercent) / 100);
    const values: Record<string, string> = {
      id: identifier,
      description: line.description,
      unit: line.unit,
      quantity: quantity(line.quantity),
      unitPrice: money(numberValue(line.unitPrice)),
      discount: numberValue(line.discountPercent) ? `${quantity(line.discountPercent)}%` : "-",
      total: money(total),
    };
    doc.font("Helvetica").fontSize(7.4);
    const heights = columns.map((column) => doc.heightOfString(values[column.key], { width: column.width - 7, lineGap: 1 }));
    const height = Math.max(23, Math.max(...heights) + 9);
    if (doc.y + height > BOTTOM) {
      addPage();
      chapterHeader(chapter);
      tableHeader();
    }
    const y = doc.y;
    if (rowIndex % 2 === 1) doc.save().rect(LEFT, y, CONTENT_WIDTH, height).fill("#f7f7f7").restore();
    let x = LEFT;
    for (const column of columns) {
      doc.save().rect(x, y, column.width, height).lineWidth(0.35).strokeColor("#c7c7c7").stroke().restore();
      doc.font(column.key === "total" ? "Helvetica-Bold" : "Helvetica").fontSize(7.4).fillColor(DARK).text(values[column.key], x + 3.5, y + 4.5, { width: column.width - 7, align: column.align, lineGap: 1 });
      x += column.width;
    }
    doc.y = y + height;
  }

  addPage();
  const issueDate = quote.savedAt ?? quote.updatedAt;
  const customerX = LEFT + 230;
  const customerWidth = CONTENT_WIDTH - 248;
  const customerLines: Array<{ text: string; bold?: boolean }> = [
    { text: "Spett.le" },
    { text: quote.customerName, bold: true },
    ...(quote.customerContact ? [{ text: quote.customerContact }] : []),
    ...(quote.siteAddress ? [{ text: quote.siteAddress }] : []),
  ];
  let customerY = TOP;
  for (const line of customerLines) {
    doc.font(line.bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor(DARK);
    const height = doc.heightOfString(line.text, { width: customerWidth });
    doc.text(line.text, customerX, customerY, { width: customerWidth, align: "right" });
    customerY += height + 1;
  }
  doc.y = Math.max(customerY + 16, 198);
  doc.font("Helvetica").fontSize(8.5).text(`${date(issueDate)}  |  ${quote.number}`, LEFT, doc.y, { width: CONTENT_WIDTH });
  doc.y += 17;
  doc.font("Helvetica-Bold").fontSize(10.5).fillColor(DARK).text(`OGGETTO: ${quote.title}`, LEFT, doc.y, { width: CONTENT_WIDTH, align: "center", lineGap: 1.5 });
  doc.y += 14;
  paragraph(quote.description ?? "");

  sectionTitle("Dettaglio economico");
  const macroChapters = quote.chapters.filter((chapter) => !chapter.parentId);
  const macroLetters = new Map(macroChapters.map((chapter, index) => [chapter.id, alphabeticId(index)]));
  const subchapterIndexes = new Map<string, number>();
  const orderedChapters: PdfChapter[] = [];
  for (const macro of macroChapters) {
    const children = quote.chapters.filter((chapter) => chapter.parentId === macro.id);
    const firstChildNumber = macro.lines.length ? 2 : 1;
    children.forEach((chapter, index) => subchapterIndexes.set(chapter.id, index + firstChildNumber));
    orderedChapters.push(macro, ...children);
  }
  orderedChapters.push(...quote.chapters.filter((chapter) => chapter.parentId && !macroLetters.has(chapter.parentId)));
  for (const chapter of orderedChapters) {
    chapterHeader(chapter);
    if (chapter.lines.length) {
      tableHeader();
      const macroId = chapter.parentId ?? chapter.id;
      const prefix = `${macroLetters.get(macroId) ?? "A"}.${chapter.parentId ? subchapterIndexes.get(chapter.id) ?? 1 : 1}`;
      chapter.lines.forEach((line, index) => lineRow(line, chapter, index, `${prefix}.${index + 1}`));
      doc.y += 7;
    }
  }

  let gross = 0;
  let afterLineDiscounts = 0;
  for (const chapter of quote.chapters) for (const line of chapter.lines) {
    const lineGross = numberValue(line.quantity) * numberValue(line.unitPrice);
    gross += lineGross;
    afterLineDiscounts += lineGross * (1 - numberValue(line.discountPercent) / 100);
  }
  const generalDiscount = afterLineDiscounts * numberValue(quote.generalDiscountPercent) / 100;
  const total = afterLineDiscounts - generalDiscount;
  ensureSpace(94);
  const totalsX = LEFT + CONTENT_WIDTH - 235;
  const totalsY = doc.y;
  doc.save().rect(totalsX, totalsY, 235, 78).lineWidth(0.7).strokeColor("#9f9f9f").stroke().restore();
  const totalsRows: Array<[string, string, boolean]> = [
    ["Importo lordo", money(gross), false],
    ["Sconti sulle voci", `- ${money(gross - afterLineDiscounts)}`, false],
    [`Sconto generale ${quantity(quote.generalDiscountPercent)}%`, `- ${money(generalDiscount)}`, false],
    ["TOTALE OFFERTA", money(total), true],
  ];
  totalsRows.forEach(([label, value, emphasis], index) => {
    const y = totalsY + index * 19.5;
    if (emphasis) doc.save().rect(totalsX, y, 235, 19.5).fill(RED).restore();
    doc.font(emphasis ? "Helvetica-Bold" : "Helvetica").fontSize(emphasis ? 9 : 8).fillColor(emphasis ? "#ffffff" : DARK).text(label, totalsX + 7, y + 5, { width: 122 });
    doc.text(value, totalsX + 129, y + 5, { width: 99, align: "right" });
  });
  doc.y = totalsY + 88;

  if (quote.plannedStartDate || quote.plannedEndDate) {
    const dates = [quote.plannedStartDate ? `Inizio previsto: ${date(quote.plannedStartDate)}` : "", quote.plannedEndDate ? `Fine prevista: ${date(quote.plannedEndDate)}` : ""].filter(Boolean).join("   ");
    paragraph(dates);
  }

  for (const section of quote.textSections) {
    if (!section.content.trim()) continue;
    sectionTitle(section.title);
    paragraph(section.content);
  }

  ensureSpace(100);
  doc.moveDown(1).font("Helvetica").fontSize(9).fillColor(DARK).text("Cornate d'Adda, " + date(issueDate), LEFT, doc.y, { width: 220 });
  const signatureY = doc.y + 15;
  doc.font("Helvetica").text("Per accettazione", LEFT, signatureY, { width: 190 });
  doc.moveTo(LEFT, signatureY + 55).lineTo(LEFT + 150, signatureY + 55).lineWidth(0.5).strokeColor(DARK).stroke();
  doc.font("Helvetica-Bold").text("Impresa Giani Giovanni S.r.l.", LEFT + 245, signatureY, { width: 230, align: "right" });

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    doc.font("Helvetica").fontSize(6.8).fillColor(MID).text(`Pag. ${index + 1} di ${range.count}`, LEFT, 782, { width: CONTENT_WIDTH, align: "right", lineBreak: false });
  }
  doc.end();
  return completed;
}
