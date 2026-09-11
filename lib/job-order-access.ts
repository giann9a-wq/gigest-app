import { Prisma, ResourceStatus } from "@prisma/client";

/**
 * GiGest currently grants every ACTIVE application user access to every ACTIVE
 * site job order. Authentication is enforced separately by getActiveAppUser().
 */
export const activePhotoJobOrderWhere = {
  status: ResourceStatus.ACTIVE,
  type: { in: ["SITE", "OTHER"] },
} satisfies Prisma.JobOrderWhereInput;

export function activePhotoJobOrderById(jobOrderId: string): Prisma.JobOrderWhereInput {
  return { ...activePhotoJobOrderWhere, id: jobOrderId };
}
