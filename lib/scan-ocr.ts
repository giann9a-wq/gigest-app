import { getGoogleDriveAccessToken } from "@/lib/google-drive-document-storage";

// OCR stays in the existing Google Drive integration. Only the temporary copy is deleted.
export async function readScanText(driveFileId: string): Promise<string> {
  const token = await getGoogleDriveAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  const response = await fetch(`https://www.googleapis.com/drive/v2/files/${encodeURIComponent(driveFileId)}/copy?convert=true&ocr=true&ocrLanguage=it&fields=id`, {
    method: "POST", headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ title: `GiGEST OCR temporaneo ${crypto.randomUUID()}`, mimeType: "application/vnd.google-apps.document" }),
    signal: AbortSignal.timeout(45000),
  });
  const copy = await response.json() as { id?: string };
  if (!response.ok || !copy.id) throw new Error("OCR Google Drive non disponibile");
  try {
    const text = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(copy.id)}/export?mimeType=text%2Fplain`, { headers, signal: AbortSignal.timeout(15000) });
    if (!text.ok) throw new Error("Lettura testo OCR non disponibile");
    return (await text.text()).slice(0, 100000);
  } finally {
    const cleanup = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(copy.id)}`, { method: "DELETE", headers, signal: AbortSignal.timeout(10000) });
    if (!cleanup.ok && cleanup.status !== 404) console.error("Pulizia copia OCR fallita", copy.id);
  }
}
