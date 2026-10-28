import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { saleSchema, unitSchema } from "@/lib/property-sales-validation";

export class SalesError extends Error {}
function fail(message: string): never { throw new SalesError(message); }

// Serializable transactions protect sale edits and approval from concurrent requests.
export async function salesTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: "Serializable", timeout: 15000 }); }
    catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
}

export async function getSalesView(jobOrderId: string) {
  const job = await prisma.jobOrder.findUnique({ where: { id: jobOrderId }, select: { salesPriceListEnabled: true } });
  if (!job) return null;
  const units = await prisma.salesUnit.findMany({ where: { jobOrderId }, orderBy: { code: "asc" },
    include: { sale: { include: { customerRecord: { select: { title: true } }, installments: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], include: { advance: { select: { isActive: true } } } } } } } });
  const customers = await prisma.jobOrderRecord.findMany({ where: { jobOrderId, kind: "CLIENT" }, orderBy: { title: "asc" },
    select: { id: true, title: true, contact: true, status: true, units: { select: { unit: { select: { code: true } } } } } });
  units.sort((a, b) => a.code.localeCompare(b.code, "it", { numeric: true }));
  const listTotal = units.reduce((sum, unit) => sum.plus(unit.listPrice), new Prisma.Decimal(0));
  const soldTotal = units.reduce((sum, unit) => sum.plus(unit.sale?.agreedPrice ?? 0), new Prisma.Decimal(0));
  const remainingListTotal = units.filter(unit => !unit.sale).reduce((sum, unit) => sum.plus(unit.listPrice), new Prisma.Decimal(0));
  return { enabled: job.salesPriceListEnabled, listTotal: Number(listTotal), soldTotal: Number(soldTotal),
    customers: customers.map(row => ({ id: row.id, name: row.title, contact: row.contact, status: row.status, unitCodes: row.units.map(link => link.unit.code) })),
    remainingListTotal: Number(remainingListTotal),
    units: units.map(unit => ({ id: unit.id, code: unit.code, description: unit.description ?? "", listPrice: Number(unit.listPrice),
      sale: unit.sale ? { id: unit.sale.id, customerRecordId: unit.sale.customerRecordId, customerName: unit.sale.customerRecord?.title ?? unit.sale.customerName, agreedPrice: Number(unit.sale.agreedPrice),
        saleDate: unit.sale.saleDate.toISOString().slice(0, 10), updatedAt: unit.sale.updatedAt.toISOString(),
        installments: unit.sale.installments.map(row => ({ id: row.id, description: row.description,
          dueDate: row.dueDate.toISOString().slice(0, 10), amount: Number(row.amount), advanceId: row.advanceId,
          approvedAt: row.approvedAt?.toISOString() ?? null, isActive: row.advance?.isActive ?? null })) } : null,
    })) };
}
export type SalesView = NonNullable<Awaited<ReturnType<typeof getSalesView>>>;

async function resolveSaleCustomer(tx: Prisma.TransactionClient, input: {
  jobOrderId: string; unitId: string; name: string; contact: string; recordId?: string | null;
  existingRecordId?: string | null; create: boolean; actor: string;
}) {
  let record = input.recordId ? await tx.jobOrderRecord.findFirst({ where: { id: input.recordId, jobOrderId: input.jobOrderId, kind: "CLIENT" } }) : null;
  if (input.recordId && !record) fail("Il cliente selezionato non appartiene a questa commessa");
  if (!record && !input.create && input.existingRecordId) {
    const previous = await tx.jobOrderRecord.findFirst({ where: { id: input.existingRecordId, jobOrderId: input.jobOrderId, kind: "CLIENT" } });
    if (previous?.title.trim().toLocaleLowerCase("it") === input.name.trim().toLocaleLowerCase("it")) record = previous;
  }
  if (!record && !input.create) {
    // Recover a manually opened dossier only when both buyer name and unit match.
    // A name alone cannot identify a person, especially when backfilling old sales.
    const candidates = await tx.jobOrderRecord.findMany({ where: { jobOrderId: input.jobOrderId, kind: "CLIENT", status: "OPEN",
      title: { equals: input.name, mode: "insensitive" }, units: { some: { unitId: input.unitId } } } });
    if (candidates.length === 1) record = candidates[0];
  }
  if (record?.status === "CLOSED" && record.id !== input.existingRecordId) fail("La pratica cliente selezionata è chiusa: riaprila prima di collegare una vendita");
  let changed = false;
  if (!record) {
    if (!input.name) fail("Inserisci il nome del nuovo cliente");
    record = await tx.jobOrderRecord.create({ data: { jobOrderId: input.jobOrderId, kind: "CLIENT", title: input.name, contact: input.contact } });
    changed = true;
  }
  const recordId = record.id;
  const link = await tx.jobOrderRecordUnit.findUnique({ where: { recordId_unitId: { recordId, unitId: input.unitId } } });
  if (!link) { await tx.jobOrderRecordUnit.create({ data: { recordId, unitId: input.unitId } }); changed = true; }
  if (changed) {
    record = await tx.jobOrderRecord.update({ where: { id: recordId }, data: { updatedAt: new Date() } });
    const units = await tx.jobOrderRecordUnit.findMany({ where: { recordId }, select: { unitId: true } });
    await tx.jobOrderRecordRevision.create({ data: { recordId, actor: input.actor, snapshot: {
      kind: record.kind, parentId: record.parentId, title: record.title, description: record.description, contact: record.contact,
      category: record.category, scope: record.scope, status: record.status, responsible: record.responsible,
      dueDate: record.dueDate?.toISOString() ?? null, unitIds: units.map(u => u.unitId),
    } } });
  }
  await tx.jobOrder.updateMany({ where: { id: input.jobOrderId, clientDossierEnabled: false }, data: { clientDossierEnabled: true } });
  return record;
}

export async function linkExistingSaleCustomers() {
  const sales = await prisma.propertySale.findMany({ select: { id: true, unitId: true, customerRecordId: true, customerName: true, unit: { select: { jobOrderId: true } } } });
  const groups = new Map<string, typeof sales>();
  for (const sale of sales) {
    const key = `${sale.unit.jobOrderId}:${sale.customerName.trim().toLocaleLowerCase("it")}`;
    const group = groups.get(key) ?? []; group.push(sale); groups.set(key, group);
  }
  let linked = 0;
  for (const group of groups.values()) {
    if (group.every(s => s.customerRecordId)) continue;
    const preexisting = await prisma.jobOrderRecord.findMany({ where: { jobOrderId: group[0].unit.jobOrderId, kind: "CLIENT",
      title: { equals: group[0].customerName, mode: "insensitive" }, units: { some: { unitId: { in: group.map(s => s.unitId) } } } }, select: { id: true } });
    const knownIds = [...new Set([...group.flatMap(s => s.customerRecordId ? [s.customerRecordId] : []), ...preexisting.map(r => r.id)])];
    // Reconstruct the old apartment/box group from its recorded buyer and job order.
    // Never merge client records which are already explicitly distinct.
    let groupRecordId = knownIds.length === 1 ? knownIds[0] : null;
    for (const row of group.filter(s => !s.customerRecordId)) {
      const result = await salesTransaction(async tx => {
      const sale = await tx.propertySale.findUnique({ where: { id: row.id }, include: { unit: true } });
      if (!sale || sale.customerRecordId) return { linked: 0, recordId: sale?.customerRecordId ?? null };
      const customer = await resolveSaleCustomer(tx, { jobOrderId: sale.unit.jobOrderId, unitId: sale.unitId,
        name: sale.customerName, contact: "", create: false, recordId: groupRecordId, existingRecordId: groupRecordId,
        actor: "Collegamento vendite esistenti" });
      await tx.propertySale.update({ where: { id: sale.id }, data: { customerRecordId: customer.id } });
      return { linked: 1, recordId: customer.id };
      });
      linked += result.linked;
      if (knownIds.length <= 1) groupRecordId = result.recordId;
    }
  }
  return linked;
}

export async function setSalesPriceListEnabled(jobOrderId: string, enabled: boolean) {
  return salesTransaction(async tx => {
    if (!await tx.jobOrder.findUnique({ where: { id: jobOrderId }, select: { id: true } })) fail("Commessa non trovata");
    if (!enabled && await tx.propertySale.count({ where: { unit: { jobOrderId } } }))
      fail("Il listino contiene vendite: non puoi disabilitarlo finché sono presenti");
    await tx.jobOrder.update({ where: { id: jobOrderId }, data: { salesPriceListEnabled: enabled, ...(!enabled ? { budgetRevenueSource: "MANUAL" } : {}) } });
  });
}

export async function saveUnit(jobOrderId: string, input: unknown) {
  const data = unitSchema.parse(input);
  return salesTransaction(async tx => {
    const job = await tx.jobOrder.findUnique({ where: { id: jobOrderId } });
    if (!job?.salesPriceListEnabled) fail("Abilita il listino nella scheda commessa");
    if (data.id) {
      const unit = await tx.salesUnit.findUnique({ where: { id: data.id } });
      if (!unit || unit.jobOrderId !== jobOrderId) fail("Appartamento non trovato");
      return tx.salesUnit.update({ where: { id: data.id }, data: { code: data.code, description: data.description, listPrice: data.listPrice } });
    }
    return tx.salesUnit.create({ data: { jobOrderId, code: data.code, description: data.description, listPrice: data.listPrice } });
  });
}

export async function deleteUnit(jobOrderId: string, id: string) {
  return salesTransaction(async tx => {
    const unit = await tx.salesUnit.findUnique({ where: { id }, include: { sale: true } });
    if (!unit || unit.jobOrderId !== jobOrderId) fail("Appartamento non trovato");
    if (unit.sale) fail("Non puoi eliminare un appartamento venduto");
    if (await tx.jobOrderRecordUnit.count({ where: { unitId: id } })) fail("L'unità è collegata a un fascicolo cliente o al libretto: non puoi eliminarla");
    await tx.salesUnit.delete({ where: { id } });
  });
}

export async function saveSale(input: unknown, userId: string) {
  const data = saleSchema.parse(input);
  return salesTransaction(async tx => {
    const unit = await tx.salesUnit.findUnique({ where: { id: data.unitId }, include: { jobOrder: true, sale: { include: { installments: true } } } });
    if (!unit?.jobOrder.salesPriceListEnabled) fail("Appartamento non disponibile nel listino");
    const existing = unit.sale;
    if (existing && existing.id !== data.id) fail("Appartamento già venduto");
    if (data.id && existing?.id !== data.id) fail("Vendita non trovata");
    if (existing && data.updatedAt !== existing.updatedAt.toISOString()) fail("La vendita è stata modificata: ricarica prima di salvare");
    for (const row of data.installments) {
      if (row.id && !existing?.installments.some(item => item.id === row.id)) fail("Acconto non appartenente alla vendita");
    }
    for (const approved of existing?.installments.filter(row => row.advanceId) ?? []) {
      const row = data.installments.find(row => row.id === approved.id);
      if (!row || !row.amount.equals(approved.amount) || row.description !== approved.description)
        fail("Per gli acconti approvati puoi modificare la data; importo, descrizione ed eliminazione restano bloccati");
    }
    const user = await tx.user.findUnique({ where: { id: userId }, select: { email: true } });
    const customer = await resolveSaleCustomer(tx, { jobOrderId: unit.jobOrderId, unitId: unit.id, name: data.customerName,
      contact: data.customerContact, recordId: data.customerRecordId, existingRecordId: existing?.customerRecordId,
      create: data.createCustomer, actor: user?.email ?? userId });
    const customerName = customer.title;
    const sale = existing
      ? await tx.propertySale.update({ where: { id: existing.id }, data: { customerName, customerRecordId: customer.id, agreedPrice: data.agreedPrice, saleDate: data.saleDate, updatedByUserId: userId } })
      : await tx.propertySale.create({ data: { unitId: unit.id, customerName, customerRecordId: customer.id, agreedPrice: data.agreedPrice, saleDate: data.saleDate, createdByUserId: userId, updatedByUserId: userId } });
    for (const old of existing?.installments ?? []) {
      if (!data.installments.some(row => row.id === old.id)) {
        if (await tx.calendarEventMapping.count({ where: { deadlineId: old.deadlineId } })) fail("Scadenza sincronizzata: modifica data/importo invece di eliminare l'acconto");
        await tx.salesInstallment.delete({ where: { id: old.id } });
        await tx.deadline.delete({ where: { id: old.deadlineId } });
      }
    }
    for (const row of data.installments) {
      const old = existing?.installments.find(item => item.id === row.id);
      if (old?.advanceId) {
        if (old.dueDate.getTime() !== row.dueDate.getTime()) {
          await tx.salesInstallment.update({ where: { id: old.id }, data: { dueDate: row.dueDate } });
          await tx.jobOrderAdvance.update({ where: { id: old.advanceId }, data: { advanceDate: row.dueDate, updatedByUserId: userId } });
          await tx.deadline.update({ where: { id: old.deadlineId }, data: { eventDate: row.dueDate, updatedByUserId: userId, lastModifiedAt: new Date(), lastSource: "GIGEST" } });
        }
        continue;
      }
      const deadlineData = { title: `Acconto ${unit.code} · ${customerName}`, description: `${unit.jobOrder.name} · ${row.description} · € ${row.amount.toFixed(2)}`, eventDate: row.dueDate, updatedByUserId: userId, lastModifiedAt: new Date(), lastSource: "GIGEST" as const };
      if (old) {
        await tx.salesInstallment.update({ where: { id: old.id }, data: { description: row.description, amount: row.amount, dueDate: row.dueDate } });
        await tx.deadline.update({ where: { id: old.deadlineId }, data: deadlineData });
      } else {
        const deadline = await tx.deadline.create({ data: { ...deadlineData, origin: "SALE_INSTALLMENT", createdByUserId: userId } });
        await tx.salesInstallment.create({ data: { saleId: sale.id, description: row.description, amount: row.amount, dueDate: row.dueDate, deadlineId: deadline.id } });
      }
    }
    return sale;
  });
}

export async function deleteSale(id: string) {
  await salesTransaction(async tx => {
    const sale = await tx.propertySale.findUnique({ where: { id }, include: { installments: true } });
    if (!sale) fail("Vendita non trovata");
    if (sale.installments.some(row => row.advanceId)) fail("La vendita ha acconti approvati: gestiscili da Gestione Acconti");
    const deadlineIds = sale.installments.map(row => row.deadlineId);
    if (await tx.calendarEventMapping.count({ where: { deadlineId: { in: deadlineIds } } })) fail("La vendita contiene scadenze sincronizzate con Google Calendar");
    await tx.salesInstallment.deleteMany({ where: { saleId: id } });
    await tx.deadline.deleteMany({ where: { id: { in: deadlineIds } } });
    await tx.propertySale.delete({ where: { id } });
  });
}

export async function approveInstallment(id: string, userId: string) {
  return salesTransaction(async tx => {
    const row = await tx.salesInstallment.findUnique({ where: { id }, include: { sale: { include: { unit: true } } } });
    if (!row) fail("Acconto pianificato non trovato");
    if (row.advanceId) return row.advanceId;
    const jobOrderId = row.sale.unit.jobOrderId;
    const advance = await tx.jobOrderAdvance.create({ data: { jobOrderId, advanceDate: row.dueDate,
      description: `${row.description} · ${row.sale.customerName} · ${row.sale.unit.code}`, amount: row.amount,
      createdByUserId: userId, updatedByUserId: userId } });
    await tx.salesInstallment.update({ where: { id }, data: { advanceId: advance.id, approvedAt: new Date(), approvedByUserId: userId } });
    await tx.propertySale.update({ where: { id: row.saleId }, data: { updatedByUserId: userId, updatedAt: new Date() } });
    const [invoices, advances] = await Promise.all([
      tx.issuedInvoiceActual.aggregate({ where: { jobOrderId }, _sum: { netAmount: true } }),
      tx.jobOrderAdvance.aggregate({ where: { jobOrderId, isActive: true }, _sum: { amount: true } }),
    ]);
    await tx.jobOrder.update({ where: { id: jobOrderId }, data: { actualRevenue: new Prisma.Decimal(invoices._sum.netAmount ?? 0).plus(advances._sum.amount ?? 0) } });
    return advance.id;
  });
}
