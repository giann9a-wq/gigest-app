import { randomBytes, scryptSync, timingSafeEqual } from "crypto";

function derivePasswordHash(password: string, salt: string) {
  return scryptSync(password, salt, 64).toString("hex");
}

export function createAdminPasswordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = derivePasswordHash(password, salt);

  return {
    passwordHash,
    passwordSalt: salt,
  };
}

export function verifyAdminPassword(
  password: string,
  passwordHash: string,
  passwordSalt: string
) {
  const expectedHashBuffer = Buffer.from(passwordHash, "hex");
  const derivedHashBuffer = Buffer.from(derivePasswordHash(password, passwordSalt), "hex");

  if (expectedHashBuffer.length !== derivedHashBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedHashBuffer, derivedHashBuffer);
}
