export function parseEmailList(value: string) {
  return Array.from(
    new Set(
      value
        .split(/[\s,;]+/)
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

export function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function validateEmailList(emails: string[]) {
  const invalid = emails.find((email) => !isValidEmail(email));
  if (invalid) {
    throw new Error(`Email non valida: ${invalid}`);
  }
}
