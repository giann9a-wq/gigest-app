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
    include: { sale: { include: { installments: { orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }], include: { advance: { select: { isActive: true } } } } } } } });
  units.sort((a, b) => a.code.localeCompare(b.code, "it", { numeric: true }));
  const listTotal = units.reduce((sum, unit) => sum.plus(unit.listPrice), new Prisma.Decimal(0));
  const soldTotal = units.reduce((sum, unit) => sum.plus(unit.sale?.agreedPrice ?? 0), new Prisma.Decimal(0));
  const remainingListTotal = units.filter(unit => !unit.sale).reduce((sum, unit) => sum.plus(unit.listPrice), new Prisma.Decimal(0));
  return { enabled: job.salesPriceListEnabled, listTotal: Number(listTotal), soldTotal: Number(soldTotal),
    remainingListTotal: Number(remainingListTotal),
    units: units.map(unit => ({ id: unit.id, code: unit.code, description: unit.description ?? "", listPrice: Number(unit.listPrice),
      sale: unit.sale ? { id: unit.sale.id, customerName: unit.sale.customerName, agreedPrice: Number(unit.sale.agreedPrice),
        saleDate: unit.sale.saleDate.toISOString().slice(0, 10), updatedAt: unit.sale.updatedAt.toISOString(),
        installments: unit.sale.installments.map(row => ({ id: row.id, description: row.description,
          dueDate: row.dueDate.toISOString().slice(0, 10), amount: Number(row.amount), advanceId: row.advanceId,
          approvedAt: row.approvedAt?.toISOString() ?? null, isActive: row.advance?.isActive ?? null })) } : null,
    })) };
}
export type SalesView = NonNullable<Awaited<ReturnType<typeof getSalesView>>>;

export async function setSalesPriceListEnabled(jobOrderId: string, enabled: boolean) {
  return salesTransaction(async tx => {
    if (!await tx.jobOrder.findUnique({ where: { id: jobOrderId }, select: { id: true } })) fail("Commessa non trovata");
    if (!enabled && await tx.propertySale.count({ where: { unit: { jobOrderId } } }))
      fail("Il listino contiene vendite: non puoi disabilitarlo finché sono presenti");
    await tx.jobOrder.update({ where: { id: jobOrderId }, data: { salesPriceListEnabled: enabled } });
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
      if (!row || !row.amount.equals(approved.amount) || row.dueDate.getTime() !== approved.dueDate.getTime() || row.description !== approved.description)
        fail("Gli acconti approvati non possono essere modificati o eliminati");
    }
    const sale = existing
      ? await tx.propertySale.update({ where: { id: existing.id }, data: { customerName: data.customerName, agreedPrice: data.agreedPrice, saleDate: data.saleDate, updatedByUserId: userId } })
      : await tx.propertySale.create({ data: { unitId: unit.id, customerName: data.customerName, agreedPrice: data.agreedPrice, saleDate: data.saleDate, createdByUserId: userId, updatedByUserId: userId } });
    for (const old of existing?.installments ?? []) {
      if (!data.installments.some(row => row.id === old.id)) {
        if (await tx.calendarEventMapping.count({ where: { deadlineId: old.deadlineId } })) fail("Scadenza sincronizzata: modifica data/importo invece di eliminare l'acconto");
        await tx.salesInstallment.delete({ where: { id: old.id } });
        await tx.deadline.delete({ where: { id: old.deadlineId } });
      }
    }
    for (const row of data.installments) {
      const old = existing?.installments.find(item => item.id === row.id);
      if (old?.advanceId) continue;
      const deadlineData = { title: `Acconto ${unit.code} · ${data.customerName}`, description: `${unit.jobOrder.name} · ${row.description} · € ${row.amount.toFixed(2)}`, eventDate: row.dueDate, updatedByUserId: userId, lastModifiedAt: new Date(), lastSource: "GIGEST" as const };
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
