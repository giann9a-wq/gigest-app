import { Prisma } from "@prisma/client";
import { z } from "zod";

export const money = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const raw = String(value).trim();
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    ctx.addIssue({ code: "custom", message: "Importo non valido (massimo due decimali)" });
    return z.NEVER;
  }
  const result = new Prisma.Decimal(normalized);
  if (result.lte(0) || result.gte("10000000000")) {
    ctx.addIssue({ code: "custom", message: "L'importo deve essere positivo e inferiore a 10 miliardi" });
    return z.NEVER;
  }
  return result;
});
export const date = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Data non valida").transform(value => new Date(`${value}T00:00:00.000Z`));
export const unitSchema = z.object({
  id: z.string().optional(), code: z.string().trim().min(1, "Identificativo obbligatorio").max(100),
  description: z.string().trim().max(1000).default(""), listPrice: money,
});
export const saleSchema = z.object({
  id: z.string().optional(), unitId: z.string().min(1),
  updatedAt: z.string().optional(),
  customerName: z.string().trim().min(1, "Cliente obbligatorio").max(200),
  agreedPrice: money, saleDate: date,
  installments: z.array(z.object({
    id: z.string().optional(), description: z.string().trim().min(1, "Descrizione acconto obbligatoria").max(200),
    dueDate: date, amount: money,
  })).max(100).default([]),
}).superRefine((sale, ctx) => {
  const sum = sale.installments.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  if (sum.gt(sale.agreedPrice)) ctx.addIssue({ code: "custom", message: "La somma degli acconti supera il prezzo di vendita" });
  const ids = sale.installments.flatMap(row => row.id ? [row.id] : []);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Acconti duplicati" });
});
