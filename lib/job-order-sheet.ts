import { Prisma } from "@prisma/client";
import { z } from "zod";
import { date } from "@/lib/property-sales-validation";
import { salesTransaction, SalesError } from "@/lib/property-sales";

const optionalDate = z.union([z.literal("").transform(() => null), date]);
const amount = z.union([z.string(), z.number()]).transform((value, ctx) => {
  if (value === "") return null;
  const raw = String(value).trim();
  const n = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(n) || Number(n) >= 1e10) {
    ctx.addIssue({ code: "custom", message: "Importo non valido: usa valori positivi con massimo due decimali" });
    return z.NEVER;
  }
  return new Prisma.Decimal(n);
});
const version = z.string().datetime();
export const sheetChangeSchema = z.discriminatedUnion("section", [
  z.object({ section: z.literal("DATA"), updatedAt: version,
    name: z.string().trim().min(1, "Il nome è obbligatorio").max(300),
    type: z.enum(["SITE", "TRAINING", "LEAVE", "SICKNESS", "RAIN", "NATIONAL_HOLIDAY", "OTHER"]),
    status: z.enum(["ACTIVE", "SUSPENDED", "ENDED", "COMPLETED"]),
    startDate: optionalDate, endDate: optionalDate, description: z.string().trim().max(10000),
    customerName: z.string().trim().max(300), customerContact: z.string().trim().max(1000),
    siteAddress: z.string().trim().max(1000), isOwnAccountSite: z.boolean(),
  }),
  z.object({ section: z.literal("BUDGET"), updatedAt: version, budget: z.object({
    personnel: amount, equipment: amount, materials: amount, professionalServices: amount,
    thirdPartyServices: amount, misc: amount, revenue: amount,
  }), budgetRevenueSource: z.enum(["MANUAL", "LIST"]), }),
  z.object({ section: z.literal("MODULES"), updatedAt: version, clientDossierEnabled: z.boolean(), technicalBookEnabled: z.boolean() }),
]);

export async function saveJobOrderSection(id: string, input: unknown) {
  const data = sheetChangeSchema.parse(input);
  return salesTransaction(async tx => {
    const job = await tx.jobOrder.findUnique({ where: { id } });
    if (!job) throw new SalesError("Commessa non trovata");
    if (job.updatedAt.toISOString() !== data.updatedAt) throw new SalesError("La commessa è stata modificata: ricarica prima di salvare");
    let update: Prisma.JobOrderUpdateManyMutationInput;
    if (data.section === "DATA") {
      const { section: _section, updatedAt: _version, ...fields } = data;
      if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) throw new SalesError("La data fine precede la data inizio");
      update = fields;
    } else if (data.section === "MODULES") {
      update = { clientDossierEnabled: data.clientDossierEnabled, technicalBookEnabled: data.technicalBookEnabled };
    } else {
      if (data.budgetRevenueSource === "LIST" && !job.salesPriceListEnabled) throw new SalesError("Abilita il listino prima di usarlo per la previsione");
      const b = data.budget;
      update = { budgetRevenueSource: data.budgetRevenueSource, budgetPersonnelCost: b.personnel,
        budgetEquipmentCost: b.equipment, budgetMaterialsCost: b.materials,
        budgetProfessionalServicesCost: b.professionalServices, budgetThirdPartyServicesCost: b.thirdPartyServices,
        budgetMiscCost: b.misc,
        // Preserve the independent manual value when the displayed revenue follows the list.
        ...(data.budgetRevenueSource === "MANUAL" ? { budgetExpectedRevenue: b.revenue } : {}),
      };
    }
    const result = await tx.jobOrder.updateMany({ where: { id, updatedAt: job.updatedAt }, data: update });
    if (result.count !== 1) throw new SalesError("La commessa è stata modificata: ricarica prima di salvare");
    return tx.jobOrder.findUniqueOrThrow({ where: { id } });
  });
}

export function effectiveExpectedRevenue(job: { salesPriceListEnabled: boolean; budgetRevenueSource: string; budgetExpectedRevenue: unknown }, listTotal: unknown) {
  return Number(job.salesPriceListEnabled && job.budgetRevenueSource === "LIST" ? listTotal ?? 0 : job.budgetExpectedRevenue ?? 0);
}
