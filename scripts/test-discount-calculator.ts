import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import { advanceDays, calculateSimulation, dateDays, defaultSimulation, simulationSchema, type SimulationInput } from "../lib/discount-calculator";
import { discountExcelBuffer, discountWorkbook } from "../lib/discount-excel";

const example = (patch: Partial<SimulationInput> = {}): SimulationInput => ({ ...defaultSimulation(), advances: [{ date: "2026-10-01", amount: 50000 }, { date: "2027-11-01", amount: 50000 }], ...patch });
test("UTC days: leap years, daylight saving and same-day closing", () => {
  assert.equal(advanceDays("2026-10-01", "2027-12-31"), 456);
  assert.equal(advanceDays("2024-02-28", "2024-03-01"), 2);
  assert.equal(advanceDays("2026-03-28", "2026-03-30"), 2);
  assert.equal(advanceDays("2027-12-31", "2027-12-31"), 0);
  assert.throws(() => dateDays("2027-02-29"));
  assert.throws(() => advanceDays("2028-01-01", "2027-12-31"));
});
test("single advance ACT/365", () => {
  const result = calculateSimulation(example({ advances: [{ date: "2026-12-31", amount: 100000 }] }));
  assert.equal(result.interest, 4582); assert.equal(result.guarantee, 1000); assert.equal(result.benefit, 3582);
  assert.equal(result.balance, 196418);
});
test("guarantee covers all 100000 euros for 456 days from October 2026", () => {
  const result = calculateSimulation(example());
  assert.equal(result.guarantee, 1249.32);
  // 456 days for October, 60 for November: 50000 × 4.582% × 516 / 365.
  assert.equal(result.interest, 3238.78);
  const laterChanged = calculateSimulation(example({ advances: [{ date: "2026-10-01", amount: 50000 }, { date: "2027-06-01", amount: 50000 }] }));
  assert.equal(laterChanged.guarantee, result.guarantee); assert.notEqual(laterChanged.interest, result.interest);
});
test("first date and future amount update the whole guarantee", () => {
  const original = calculateSimulation(example());
  const earlier = calculateSimulation(example({ advances: [{ date: "2026-09-01", amount: 50000 }, { date: "2027-11-01", amount: 50000 }] }));
  assert.ok(earlier.guarantee > original.guarantee);
  const larger = calculateSimulation(example({ advances: [{ date: "2026-10-01", amount: 50000 }, { date: "2027-11-01", amount: 100000 }] }));
  assert.equal(larger.guarantee, 1873.97);
});
test("same-day advances and sorting independent of input order", () => {
  const same = calculateSimulation(example({ advances: [{ date: "2026-12-31", amount: 50000 }, { date: "2026-12-31", amount: 50000 }] }));
  assert.equal(same.interest, 4582); assert.equal(same.guarantee, 1000);
  assert.deepEqual(calculateSimulation(example({ advances: [...example().advances].reverse() })), calculateSimulation(example()));
});
test("no advances, last-day advance and closing-day advance", () => {
  const empty = calculateSimulation(defaultSimulation());
  assert.equal(empty.guarantee, 0); assert.equal(empty.discount, 0); assert.equal(empty.balance, 300000);
  const near = calculateSimulation(example({ advances: [{ date: "2027-12-30", amount: 100000 }] }));
  assert.equal(near.interest, 12.55); assert.equal(near.guarantee, 2.74);
  const closing = calculateSimulation(example({ advances: [{ date: "2027-12-31", amount: 100000 }] }));
  assert.equal(closing.interest, 0); assert.equal(closing.guarantee, 0);
});
test("negative benefit gives zero discount, retained loss is visible", () => {
  const result = calculateSimulation(example({ guaranteeRate: 10 }));
  assert.ok(result.benefit < 0); assert.equal(result.discount, 0); assert.equal(result.retained, result.benefit);
});
test("customer allocation 0, 50 and 100 percent", () => {
  const full = calculateSimulation(example());
  assert.equal(full.discount, full.benefit);
  assert.equal(calculateSimulation(example({ customerShare: 0 })).discount, 0);
  assert.equal(calculateSimulation(example({ customerShare: 50 })).discount, 994.73);
});
test("fully paid price caps discount to prevent a negative balance", () => {
  const result = calculateSimulation(example({ advances: [{ date: "2026-12-31", amount: 300000 }] }));
  assert.ok(result.proposed > 0); assert.equal(result.discount, 0); assert.equal(result.balance, 0); assert.equal(result.capped, true);
  const partial = calculateSimulation(example({ advances: [{ date: "2026-12-31", amount: 299999 }] }));
  assert.equal(partial.discount, 1); assert.equal(partial.balance, 0);
});
test("changing closing date updates days and all costs", () => {
  const result = calculateSimulation(example({ closingDate: "2028-12-31" }));
  assert.equal(result.guaranteeDays, 822); assert.ok(result.interest > calculateSimulation(example()).interest);
});
test("invalid numbers, amounts, dates and allocation never yield results", () => {
  for (const patch of [{ price: "" }, { price: 0 }, { price: "NaN" }, { price: Infinity }, { euribor: "" }, { spread: -1 }, { guaranteeRate: -1 }, { customerShare: -1 }, { customerShare: 101 }, { closingDate: "2027-02-29" }, { advances: [{ date: "2028-01-01", amount: 1 }] }, { advances: [{ date: "2027-11-01", amount: -1 }] }, { advances: [{ date: "", amount: "" }] }, { advances: [{ date: "2027-11-01", amount: 300001 }] }, { advances: [{ date: "2027-11-01", amount: 1.001 }] }]) {
    assert.equal(simulationSchema.safeParse(example(patch)).success, false, JSON.stringify(patch));
    assert.throws(() => calculateSimulation(example(patch)));
  }
});
test("decimal amounts and rates preserve cents", () => {
  const result = calculateSimulation(example({ price: "0,30", advances: [{ date: "2027-12-31", amount: "0,10" }, { date: "2027-12-31", amount: "0,20" }] }));
  assert.equal(result.total, 0.3); assert.equal(result.balance, 0);
});
test("Excel uses editable numbers, numeric dates and live formulas matching the application", async () => {
  const input = example(), result = calculateSimulation(input), book = discountWorkbook(input), sheet = book.Sheets.Calcolatore;
  assert.equal(sheet.B10.v, 365); assert.equal(sheet.B11.v, 365);
  assert.equal(sheet.B22.f, 'IF($B$16="OK",ROUND(B18*B9*B21/B11,2),"Dati non validi")');
  assert.equal(sheet.B22.v, result.guarantee); assert.equal(sheet.B27.v, result.discount); assert.equal(sheet.B30.v, result.balance);
  assert.equal(sheet.B37.t, "n"); assert.equal(sheet.B37.z, "dd/mm/yyyy");
  const buffer = await discountExcelBuffer(input), reopened = XLSX.read(buffer, { type: "buffer", cellNF: true });
  assert.equal(reopened.Sheets.Calcolatore.B30.f, sheet.B30.f);
  const zip = await JSZip.loadAsync(buffer), xml = await zip.file("xl/workbook.xml")!.async("string");
  assert.match(xml, /fullCalcOnLoad="1"/);
  assert.match(await zip.file("xl/worksheets/sheet1.xml")!.async("string"), /showGridLines="0"/);
});
test("Excel exports all advances beyond the reference model's 15 rows", () => {
  const input = example({ advances: Array.from({ length: 25 }, () => ({ date: "2027-11-01", amount: 1000 })) });
  const sheet = discountWorkbook(input).Sheets.Calcolatore;
  assert.equal(sheet.C61.v, 1000); assert.match(sheet.B18.f!, /C37:C66/);
});
