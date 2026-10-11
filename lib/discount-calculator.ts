import { Decimal } from "@prisma/client/runtime/index-browser";
import { z } from "zod";

export function dateDays(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") throw new Error("Data non valida (GG/MM/AAAA, dal 1900).");
  const timestamp = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error("Data non valida.");
  return timestamp / 86400000;
}
export function advanceDays(date: string, closingDate: string) {
  const days = dateDays(closingDate) - dateDays(date);
  if (days < 0) throw new Error("L'acconto deve precedere o coincidere con il rogito.");
  return days;
}
const dateSchema = z.string().refine(value => { try { dateDays(value); return true; } catch { return false; } }, "Inserisci una data valida.");
const numeric = (min: number, max: number, scale: number) => z.union([z.number(), z.string()])
  .refine(value => String(value).trim() !== "" && /^-?\d+(?:[.,]\d+)?$/.test(String(value)), "Inserisci un numero valido.")
  .transform(value => Number(String(value).replace(",", ".")))
  .pipe(z.number().finite().min(min, `Il valore minimo è ${min}.`).max(max, `Il valore massimo è ${max}.`))
  .refine(value => new Decimal(value).decimalPlaces() <= scale, `Sono consentiti al massimo ${scale} decimali.`);

export const simulationSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome della simulazione.").max(160),
  reference: z.string().trim().max(200).default(""),
  price: numeric(0.01, 9999999999.99, 2),
  closingDate: dateSchema,
  euribor: numeric(-100, 100, 6),
  spread: numeric(0, 100, 6),
  guaranteeRate: numeric(0, 100, 6),
  customerShare: numeric(0, 100, 6),
  advances: z.array(z.object({ date: dateSchema, amount: numeric(0.01, 9999999999.99, 2) })).max(500),
}).superRefine((value, ctx) => {
  value.advances.forEach((row, index) => {
    if (row.date > value.closingDate) ctx.addIssue({ code: "custom", path: ["advances", index, "date"], message: "L'acconto deve precedere o coincidere con il rogito." });
  });
  const total = value.advances.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  if (total.gt(value.price)) ctx.addIssue({ code: "custom", path: ["advances"], message: "Il totale degli acconti supera il prezzo dell'appartamento." });
});
export type SimulationInput = z.input<typeof simulationSchema>;
export type Simulation = z.output<typeof simulationSchema>;
export function financialRate(euribor: number, spread: number) { return new Decimal(euribor).plus(spread).toNumber(); }
export const defaultSimulation = (): SimulationInput => ({ name: "Nuova simulazione", reference: "", price: 300000, closingDate: "2027-12-31", euribor: 2.632, spread: 1.95, guaranteeRate: 1, customerShare: 100, advances: [] });
const cents = (value: Decimal) => value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
export function interestSaved(amount: number, ratePercent: number, days: number) {
  return new Decimal(amount).times(ratePercent).div(100).times(days).div(365);
}
export function guaranteeCost(advances: Simulation["advances"], closingDate: string, ratePercent: number) {
  if (!advances.length) return new Decimal(0);
  const firstDate = advances.reduce((first, row) => row.date < first ? row.date : first, advances[0].date);
  const total = advances.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  return total.times(ratePercent).div(100).times(advanceDays(firstDate, closingDate)).div(365);
}
export function netBenefit(interest: Decimal, guarantee: Decimal) { return interest.minus(guarantee); }
export function commercialDiscount(price: number, total: Decimal, benefit: Decimal, share: number) {
  const theoretical = Decimal.max(0, benefit);
  const proposed = cents(theoretical.times(share).div(100));
  const discount = Decimal.min(proposed, new Decimal(price).minus(total));
  const finalPrice = new Decimal(price).minus(discount);
  return { theoretical: theoretical.toNumber(), proposed: proposed.toNumber(), discount: discount.toNumber(), capped: discount.lt(proposed), discountPercent: discount.div(price).times(100).toNumber(), finalPrice: finalPrice.toNumber(), balance: finalPrice.minus(total).toNumber(), retained: benefit.minus(discount).toNumber() };
}
export function calculateSimulation(input: SimulationInput) {
  const value = simulationSchema.parse(input);
  const bankRate = financialRate(value.euribor, value.spread);
  const rows = [...value.advances].sort((a, b) => a.date.localeCompare(b.date)).map(row => {
    const days = advanceDays(row.date, value.closingDate);
    return { ...row, days, interest: cents(interestSaved(row.amount, bankRate, days)).toNumber() };
  });
  const total = value.advances.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  // Round totals only after summing full precision ACT/365 interests.
  const interest = cents(value.advances.reduce((sum, row) => sum.plus(interestSaved(row.amount, bankRate, advanceDays(row.date, value.closingDate))), new Decimal(0)));
  const guarantee = cents(guaranteeCost(value.advances, value.closingDate, value.guaranteeRate));
  const benefit = netBenefit(interest, guarantee);
  return { bankRate, rows, total: total.toNumber(), initialBalance: new Decimal(value.price).minus(total).toNumber(), firstDate: rows[0]?.date ?? null, guaranteeDays: rows.length ? rows[0].days : 0, interest: interest.toNumber(), guarantee: guarantee.toNumber(), benefit: benefit.toNumber(), benefitPercent: benefit.div(value.price).times(100).toNumber(), ...commercialDiscount(value.price, total, benefit, value.customerShare) };
}
