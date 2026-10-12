import * as XLSX from "xlsx";
import JSZip from "jszip";
import { calculateSimulation, dateDays, simulationSchema, type SimulationInput } from "./discount-calculator";

// Application export uses the same XLSX/JSZip dependencies as existing exports.
export function discountWorkbook(input: SimulationInput) {
  const value = simulationSchema.parse(input);
  const result = calculateSimulation(value);
  const sheet = XLSX.utils.aoa_to_sheet([
    ["CALCOLATORE SCONTI – GiGEST"], ["Simulazione", value.name], ["Riferimento", value.reference],
    ["Prezzo appartamento (€)", value.price], ["Data saldo / rogito", dateDays(value.closingDate) + 25569],
    ["Euribor 3 mesi", value.euribor / 100], ["Spread bancario", value.spread / 100], ["Tasso finanziario complessivo"],
    ["Costo annuo fideiussione", value.guaranteeRate / 100], ["Base interessi (ACT/365)", 365], ["Base fideiussione (ACT/365)", 365],
    ["Beneficio riconosciuto al cliente", value.customerShare / 100], ["Spesa fissa emissione fideiussione (€)", value.guaranteeFee],
    ["Input in blu. Formule in nero. Inserisci ulteriori acconti nelle righe libere."],
    ["Euribor di simulazione, tasso costante. Il modello usa ACT/365 anche per gli interessi."],
    ["Validità dei dati"], [], ["Totale acconti (€)"], ["Interessi risparmiati (€)"], ["Primo acconto"],
    ["Giorni fideiussione"], ["Costo totale fideiussione (€)"], ["Beneficio finanziario netto (€)"], ["Beneficio netto / prezzo"],
    ["Sconto massimo teorico (€)"], ["Sconto proposto dalla quota (€)"], ["Sconto concedibile (€), limitato al saldo"],
    ["Sconto concedibile / prezzo"], ["Prezzo finale scontato (€)"], ["Saldo al rogito (€)"], ["Beneficio trattenuto (€)"], ["Saldo prima dello sconto (€)"], [],
    ["Fideiussione: premio annuo sull’intero piano + emissione fissa + spesa variabile sul totale acconti."],
    ["Sconto limitato al saldo disponibile. Escluso il costo finanziario dell’anticipo del premio."],
    ["N.", "Data acconto", "Importo (€)", "Giorni al rogito", "Interessi risparmiati (€)"],
  ]);
  sheet.C4 = { t: "s", v: "Spesa variabile fideiussione" };
  sheet.E4 = { t: "n", v: value.guaranteeVariableRate / 100, z: "0.000%" };
  const count = Math.max(15, result.rows.length + 5);
  const first = 37, last = first + count - 1;
  const dates = `B${first}:B${last}`, amounts = `C${first}:C${last}`, interests = `E${first}:E${last}`;
  const put = (address: string, formula: string, cached: number | string, format = '#,##0.00 "€"') => { sheet[address] = { t: typeof cached === "number" ? "n" : "s", f: formula, v: cached, z: format }; };
  put("B8", "B6+B7", result.bankRate / 100, "0.000%");
  put("B16", `IF(AND(ISNUMBER(B4),B4>0,ISNUMBER(B5),B5=INT(B5),ISNUMBER(B6),B6>=-1,B6<=1,ISNUMBER(B7),B7>=0,B7<=1,ISNUMBER(B9),B9>=0,B9<=1,B10=365,B11=365,ISNUMBER(B12),B12>=0,B12<=1,ISNUMBER(B13),B13>=0,B13<=9999999999.99,ROUND(B13,2)=B13,ISNUMBER(E4),E4>=0,E4<=1,COUNTA(${dates})=COUNT(${dates}),COUNTA(${amounts})=COUNT(${amounts}),COUNT(${dates})=COUNT(${amounts}),COUNTIFS(${dates},">"&B5)=0,COUNTIFS(${dates},"<="&0,${amounts},">0")=0,COUNTIFS(${amounts},"<=0",${dates},">0")=0,SUM(${amounts})<=B4),"OK","Dati non validi")`, "OK", "General");
  const guarded = (formula: string) => `IF($B$16="OK",${formula},"Dati non validi")`;
  put("B18", guarded(`SUM(${amounts})`), result.total);
  put("B19", guarded(`ROUND(SUM(${interests}),2)`), result.interest);
  put("B20", `IF($B$16="OK",IF(COUNT(${dates})=0,"",MIN(${dates})),"Dati non validi")`, result.firstDate ? dateDays(result.firstDate) + 25569 : "", "dd/mm/yyyy");
  put("B21", guarded('IF(B20="",0,B5-B20)'), result.guaranteeDays, "0");
  put("B22", guarded(`ROUND(B18*B9*B21/B11,2)+IF(COUNT(${dates})>0,B13,0)+ROUND(B18*$E$4,2)`), result.guarantee);
  put("B23", guarded("ROUND(B19-B22,2)"), result.benefit);
  put("B24", guarded("B23/B4"), result.benefitPercent / 100, "0.00%");
  put("B25", guarded("MAX(0,B23)"), result.theoretical);
  put("B26", guarded("ROUND(B25*B12,2)"), result.proposed);
  put("B27", guarded("MIN(B26,B4-B18)"), result.discount);
  put("B28", guarded("B27/B4"), result.discountPercent / 100, "0.00%");
  put("B29", guarded("ROUND(B4-B27,2)"), result.finalPrice);
  put("B30", guarded("ROUND(B29-B18,2)"), result.balance);
  put("B31", guarded("ROUND(B23-B27,2)"), result.retained);
  put("B32", guarded("ROUND(B4-B18,2)"), result.initialBalance);
  for (let index = 0; index < count; index++) {
    const r = first + index, row = result.rows[index];
    sheet[`A${r}`] = { t: "n", v: index + 1, z: "0" };
    sheet[`B${r}`] = row ? { t: "n", v: dateDays(row.date) + 25569, z: "dd/mm/yyyy" } : { t: "z", z: "dd/mm/yyyy" };
    sheet[`C${r}`] = row ? { t: "n", v: row.amount, z: '#,##0.00 "€"' } : { t: "z", z: '#,##0.00 "€"' };
    put(`D${r}`, `IF(AND(B${r}="",C${r}=""),"",IF(AND(ISNUMBER(B${r}),B${r}>0,B${r}<=$B$5,ISNUMBER(C${r}),C${r}>0),$B$5-B${r},"Dati non validi"))`, row?.days ?? "", "0");
    put(`E${r}`, `IF(AND(B${r}="",C${r}=""),"",IF(ISNUMBER(D${r}),C${r}*$B$8*D${r}/$B$10,"Dati non validi"))`, row ? row.amount * result.bankRate / 100 * row.days / 365 : "");
  }
  sheet["B4"].z = '#,##0.00 "€"'; sheet["B5"].z = "dd/mm/yyyy"; sheet["B13"].z = '#,##0.00 "€"';
  for (const r of [6, 7, 9, 12]) sheet[`B${r}`].z = "0.000%";
  sheet["!ref"] = `A1:E${last}`;
  sheet["!cols"] = [{ wch: 49 }, { wch: 25 }, { wch: 20 }, { wch: 21 }, { wch: 29 }];
  sheet["!merges"] = [1, 14, 15, 34, 35].map(r => ({ s: { r: r - 1, c: 0 }, e: { r: r - 1, c: 4 } }));
  sheet["!merges"].push({ s: { r: 3, c: 2 }, e: { r: 3, c: 3 } });
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, "Calcolatore");
  return book;
}

export async function discountExcelBuffer(input: SimulationInput) {
  const book = discountWorkbook(input);
  const zip = await JSZip.loadAsync(XLSX.write(book, { type: "buffer", bookType: "xlsx", sheetStubs: true }));
  let styles = await zip.file("xl/styles.xml")!.async("string");
  // Add input, title and highlight styles while retaining generated number formats.
  const fonts = /<fonts count="(\d+)">/.exec(styles)!;
  const fontCount = Number(fonts[1]);
  styles = styles.replace(fonts[0], `<fonts count="${fontCount + 3}">`).replace("</fonts>", '<font><sz val="11"/><color rgb="FF2563EB"/><name val="Calibri"/></font><font><b/><sz val="12"/><color rgb="FF9A3412"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF111827"/><name val="Calibri"/></font></fonts>');
  const xfs = /<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/.exec(styles)!;
  const original = xfs[2].match(/<xf\b[^>]*(?:\/>|>[\s\S]*?<\/xf>)/g)!;
  const additions = [fontCount, fontCount + 1, fontCount + 2].flatMap(font => original.map(xf => xf.replace(/fontId="\d+"/, `fontId="${font}"`).replace("<xf ", '<xf applyFont="1" ')));
  styles = styles.replace(xfs[0], `<cellXfs count="${original.length + additions.length}">${xfs[2]}${additions.join("")}</cellXfs>`);
  zip.file("xl/styles.xml", styles);
  let xml = await zip.file("xl/worksheets/sheet1.xml")!.async("string");
  xml = xml.replace(/<c\b([^>]*\br="([A-E])(\d+)"[^>]*)>/g, (match, attrs: string, col: string, row: string) => {
    const r = Number(row); let variant = -1;
    if ((col === "B" && [2, 3, 4, 5, 6, 7, 9, 12, 13].includes(r)) || (r >= 37 && ["B", "C"].includes(col))) variant = 0;
    if (col === "E" && r === 4) variant = 0;
    if (r === 1 || r === 27 || r === 28) variant = 1;
    else if (r === 36 || (col === "A" && r >= 18 && r <= 32)) variant = 2;
    if (variant < 0) return match;
    const old = /\bs="(\d+)"/.exec(attrs); const style = Number(old?.[1] ?? 0) + original.length * (variant + 1);
    return `<c${old ? attrs.replace(old[0], `s="${style}"`) : `${attrs} s="${style}"`}>`;
  });
  xml = xml.replace(/<sheetView\b([^>]*?)(?:\/>|>([\s\S]*?)<\/sheetView>)/, '<sheetView$1 showGridLines="0">$2</sheetView>');
  zip.file("xl/worksheets/sheet1.xml", xml);
  const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
  zip.file("xl/workbook.xml", workbookXml.replace("</workbook>", '<calcPr calcId="191029" fullCalcOnLoad="1" forceFullCalc="1" calcMode="auto"/></workbook>'));
  return zip.generateAsync({ type: "nodebuffer" });
}
