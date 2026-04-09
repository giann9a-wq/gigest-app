import { createHash, randomBytes } from "crypto";
import { UserRole } from "@prisma/client";
import { cookies } from "next/headers";
import { createAdminPasswordHash, verifyAdminPassword } from "@/lib/admin-password";
import { prisma } from "@/lib/prisma";
import { getActiveAppUser } from "@/lib/app-user";

const ADMIN_PANEL_COOKIE = "gigest-admin-panel";
const ADMIN_PANEL_CREDENTIAL_KEY = "default";
const ADMIN_PANEL_SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function requireAdminUser() {
  const appUser = await getActiveAppUser();

  if (!appUser || appUser.role !== UserRole.ADMIN) {
    return null;
  }

  return appUser;
}

export async function requireElevatedAdminUser() {
  const appUser = await requireAdminUser();

  if (!appUser) {
    return null;
  }

  const hasElevatedAccess = await hasElevatedAdminPanelAccess(appUser.id);

  if (!hasElevatedAccess) {
    return null;
  }

  return appUser;
}

export async function ensureAdminPanelCredential() {
  const existingCredential = await prisma.adminPanelCredential.findUnique({
    where: { key: ADMIN_PANEL_CREDENTIAL_KEY },
  });

  if (existingCredential) {
    return existingCredential;
  }

  const seededPassword = process.env.SEED_ADMIN_PANEL_PASSWORD?.trim();

  if (!seededPassword) {
    return null;
  }

  const { passwordHash, passwordSalt } = createAdminPasswordHash(seededPassword);

  return prisma.adminPanelCredential.create({
    data: {
      key: ADMIN_PANEL_CREDENTIAL_KEY,
      passwordHash,
      passwordSalt,
    },
  });
}

export async function clearAdminPanelSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_PANEL_COOKIE)?.value;

  if (token) {
    await prisma.adminPanelSession.deleteMany({
      where: { tokenHash: sha256(token) },
    });
  }

  cookieStore.delete(ADMIN_PANEL_COOKIE);
}

export async function hasElevatedAdminPanelAccess(userId: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_PANEL_COOKIE)?.value;

  if (!token) {
    return false;
  }

  const session = await prisma.adminPanelSession.findUnique({
    where: { tokenHash: sha256(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
    },
  });

  if (!session || session.userId !== userId || session.expiresAt <= new Date()) {
    await clearAdminPanelSession();
    return false;
  }

  await prisma.adminPanelSession.update({
    where: { id: session.id },
    data: {
      lastUsedAt: new Date(),
    },
  });

  return true;
}

export async function unlockAdminPanel(userId: string, password: string) {
  const credential = await ensureAdminPanelCredential();

  if (!credential) {
    return {
      ok: false as const,
      reason: "missing-credential" as const,
    };
  }

  if (!verifyAdminPassword(password, credential.passwordHash, credential.passwordSalt)) {
    return {
      ok: false as const,
      reason: "invalid-password" as const,
    };
  }

  const sessionToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + ADMIN_PANEL_SESSION_DURATION_MS);

  await prisma.adminPanelSession.create({
    data: {
      tokenHash: sha256(sessionToken),
      userId,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_PANEL_COOKIE, sessionToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });

  return {
    ok: true as const,
  };
}
