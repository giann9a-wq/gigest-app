import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { date } from "@/lib/property-sales-validation";
import { salesTransaction, SalesError } from "@/lib/property-sales";

export const recordKinds = ["CLIENT", "REQUEST", "CHOICE", "TECHNICAL"] as const;
export const recordStatuses: Record<typeof recordKinds[number], readonly string[]> = {
  CLIENT: ["OPEN", "CLOSED"], REQUEST: ["OPEN", "REVIEW", "PENDING", "APPROVED", "DONE", "REJECTED", "CANCELLED"],
  CHOICE: ["OPEN", "PENDING", "APPROVED", "SUPERSEDED"], TECHNICAL: ["DRAFT", "VALIDATED", "SUPERSEDED"],
};
export const recordSchema = z.object({
  id: z.string().optional(), updatedAt: z.string().datetime().optional(),
  kind: z.enum(recordKinds), parentId: z.string().nullable().default(null),
  title: z.string().trim().min(1, "Il titolo è obbligatorio").max(300),
  description: z.string().trim().max(20000).default(""), contact: z.string().trim().max(2000).default(""),
  category: z.string().trim().max(200).default(""), scope: z.string().trim().max(300).default(""),
  responsible: z.string().trim().max(200).default(""), status: z.string(),
  dueDate: z.union([z.literal("").transform(() => null), date]).default(""),
  unitIds: z.array(z.string().min(1)).max(100).default([]),
}).superRefine((data, ctx) => {
  if (!recordStatuses[data.kind].includes(data.status)) ctx.addIssue({ code: "custom", message: "Stato non valido per questa scheda" });
  if (data.id && !data.updatedAt) ctx.addIssue({ code: "custom", message: "Versione scheda mancante: ricarica i dati" });
  if (["REQUEST", "CHOICE"].includes(data.kind) !== Boolean(data.parentId)) ctx.addIssue({ code: "custom", message: "Richieste e scelte devono appartenere a una pratica cliente" });
});

export async function getDossier(jobOrderId: string) {
  const [records, documents, units, job] = await Promise.all([
    prisma.jobOrderRecord.findMany({ where: { jobOrderId }, orderBy: { updatedAt: "desc" }, include: {
      units: { select: { unitId: true } },
      revisions: { orderBy: { createdAt: "desc" }, select: { id: true, snapshot: true, actor: true, createdAt: true } },
      documents: { select: { documentId: true } },
      sales: { select: { id: true, unitId: true, unit: { select: { code: true } } } },
    } }),
    prisma.jobOrderDocument.findMany({ where: { jobOrderId }, orderBy: { createdAt: "desc" }, include: {
      links: { select: { recordId: true } },
      revisions: { orderBy: { revision: "desc" }, select: { id: true, revision: true, fileName: true, mimeType: true, sizeBytes: true, actor: true, note: true, createdAt: true } },
    } }),
    prisma.salesUnit.findMany({ where: { jobOrderId }, select: { id: true, code: true, description: true, sale: { select: { customerName: true, customerRecordId: true } } }, orderBy: { code: "asc" } }),
    prisma.jobOrder.findUnique({ where: { id: jobOrderId }, select: { clientDossierEnabled: true, technicalBookEnabled: true } }),
  ]);
  if (!job) throw new SalesError("Commessa non trovata");
  return { records, documents, units, modules: job };
}

export async function saveDossierRecord(jobOrderId: string, input: unknown, actor: string) {
  const data = recordSchema.parse(input);
  return salesTransaction(async tx => {
    const job = await tx.jobOrder.findUnique({ where: { id: jobOrderId } });
    if (!job) throw new SalesError("Commessa non trovata");
    if (data.kind === "TECHNICAL" ? !job.technicalBookEnabled : !job.clientDossierEnabled) throw new SalesError("Abilita il modulo prima di modificare le schede");
    const old = data.id ? await tx.jobOrderRecord.findFirst({ where: { id: data.id, jobOrderId } }) : null;
    if (data.id && (!old || old.updatedAt.toISOString() !== data.updatedAt)) throw new SalesError("Scheda modificata o non disponibile: ricarica prima di salvare");
    if (old && (old.kind !== data.kind || old.parentId !== data.parentId)) throw new SalesError("Non puoi cambiare il tipo o la pratica di una scheda esistente");
    if (data.parentId) {
      const parent = await tx.jobOrderRecord.findFirst({ where: { id: data.parentId, jobOrderId, kind: "CLIENT" } });
      if (!parent) throw new SalesError("Pratica cliente non valida per questa commessa");
      if (parent.status === "CLOSED") throw new SalesError("La pratica cliente è chiusa: riaprila per aggiornare richieste o scelte");
    }
    const unitIds = [...new Set(data.unitIds)];
    if (old?.kind === "CLIENT") {
      const sales = await tx.propertySale.findMany({ where: { customerRecordId: old.id }, select: { unitId: true } });
      if (sales.some(sale => !unitIds.includes(sale.unitId))) throw new SalesError("Non puoi rimuovere un'unità collegata a una vendita: modifica prima il cliente nella vendita");
    }
    if (await tx.salesUnit.count({ where: { id: { in: unitIds }, jobOrderId } }) !== unitIds.length) throw new SalesError("Unità non appartenente alla commessa");
    const { id: _id, updatedAt: _version, unitIds: _units, ...fields } = data;
    const record = old
      ? await tx.jobOrderRecord.update({ where: { id: old.id }, data: fields })
      : await tx.jobOrderRecord.create({ data: { ...fields, jobOrderId } });
    if (old?.kind === "CLIENT" && old.title !== record.title) {
      await tx.propertySale.updateMany({ where: { customerRecordId: old.id }, data: { customerName: record.title } });
    }
    await tx.jobOrderRecordUnit.deleteMany({ where: { recordId: record.id } });
    if (unitIds.length) await tx.jobOrderRecordUnit.createMany({ data: unitIds.map(unitId => ({ unitId, recordId: record.id })) });
    const snapshot = JSON.parse(JSON.stringify({ ...fields, unitIds })) as Prisma.InputJsonValue;
    await tx.jobOrderRecordRevision.create({ data: { recordId: record.id, actor, snapshot } });
    return record;
  });
}

export async function linkDossierDocument(jobOrderId: string, recordId: string, documentId: string) {
  return salesTransaction(async tx => {
    const record = await tx.jobOrderRecord.findFirst({ where: { id: recordId, jobOrderId }, include: { jobOrder: true } });
    if (!record || !await tx.jobOrderDocument.findFirst({ where: { id: documentId, jobOrderId } })) throw new SalesError("Documento o scheda non appartenente alla commessa");
    if (record.kind === "TECHNICAL" ? !record.jobOrder.technicalBookEnabled : !record.jobOrder.clientDossierEnabled) throw new SalesError("Modulo disabilitato");
    // Customer files can be linked to technical records explicitly by an internal user, never automatically.
    return tx.jobOrderDocumentLink.upsert({ where: { documentId_recordId: { documentId, recordId } }, create: { documentId, recordId }, update: {} });
  });
}

export async function assertRecordWritable(jobOrderId: string, recordId: string) {
  const record = await prisma.jobOrderRecord.findFirst({ where: { id: recordId, jobOrderId }, include: { jobOrder: true } });
  if (!record) throw new SalesError("Scheda non trovata");
  if (record.kind === "TECHNICAL" ? !record.jobOrder.technicalBookEnabled : !record.jobOrder.clientDossierEnabled) throw new SalesError("Modulo disabilitato");
  return record;
}
