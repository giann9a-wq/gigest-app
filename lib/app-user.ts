import { UserRole, UserStatus } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type ActiveAppUser = {
  id: string;
  email: string;
  role: UserRole;
};

export async function getActiveAppUser(): Promise<ActiveAppUser | null> {
  const session = await auth();

  if (!session?.user?.email) {
    return null;
  }

  const appUser = await prisma.user.findUnique({
    where: { email: session.user.email.toLowerCase() },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
    },
  });

  if (!appUser || appUser.status !== UserStatus.ACTIVE) {
    return null;
  }

  return {
    id: appUser.id,
    email: appUser.email,
    role: appUser.role,
  };
}
