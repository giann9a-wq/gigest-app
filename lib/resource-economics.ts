import type { JobType, ResourceType } from "@prisma/client";

export type CostHistoryRow = {
  hourlyCost: unknown;
  validFrom: Date;
  validTo: Date | null;
};

const ZERO_COST_PERSONNEL_JOB_TYPES = new Set<JobType>(["LEAVE", "SICKNESS", "RAIN", "NATIONAL_HOLIDAY"]);

export function isZeroCostPersonnelJobType(jobType: JobType) {
  return ZERO_COST_PERSONNEL_JOB_TYPES.has(jobType);
}

export function getApplicableCost(history: CostHistoryRow[], referenceDate: Date) {
  const matching = history.find((item) => {
    const start = item.validFrom.getTime();
    const end = item.validTo ? item.validTo.getTime() : Number.POSITIVE_INFINITY;
    const current = referenceDate.getTime();
    return current >= start && current <= end;
  });

  if (!matching) return 0;
  return Number(matching.hourlyCost);
}

export function getEffectiveResourceHourlyCost({
  resourceType,
  jobType,
  costHistory,
  referenceDate,
}: {
  resourceType: ResourceType;
  jobType: JobType;
  costHistory: CostHistoryRow[];
  referenceDate: Date;
}) {
  if (resourceType === "PERSON" && isZeroCostPersonnelJobType(jobType)) {
    return 0;
  }

  return getApplicableCost(costHistory, referenceDate);
}
