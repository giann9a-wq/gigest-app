import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DownloadedWhatsAppMedia } from "@/lib/whatsapp/provider";

const mockRoot = path.resolve(process.cwd(), "tmp", "whatsapp-mock-media");

function assertMockMediaId(mediaId: string) {
  if (!/^mock-[a-f0-9-]{36}$/i.test(mediaId)) throw new Error("Identificativo media mock non valido");
  return mediaId;
}

export async function saveMockMedia(file: File) {
  await mkdir(mockRoot, { recursive: true });
  const mediaId = `mock-${crypto.randomUUID()}`;
  const basePath = path.join(mockRoot, assertMockMediaId(mediaId));
  await Promise.all([
    writeFile(`${basePath}.bin`, Buffer.from(await file.arrayBuffer())),
    writeFile(
      `${basePath}.json`,
      JSON.stringify({ filename: file.name || "foto-mock.jpg", mimeType: file.type || "image/jpeg" }),
      "utf8"
    ),
  ]);
  return mediaId;
}

export async function loadMockMedia(mediaId: string): Promise<DownloadedWhatsAppMedia> {
  const basePath = path.join(mockRoot, assertMockMediaId(mediaId));
  const [buffer, rawMetadata] = await Promise.all([readFile(`${basePath}.bin`), readFile(`${basePath}.json`, "utf8")]);
  const metadata = JSON.parse(rawMetadata) as { filename: string; mimeType: string };
  return { buffer, filename: metadata.filename, mimeType: metadata.mimeType };
}

export async function removeMockMedia(mediaId: string) {
  const basePath = path.join(mockRoot, assertMockMediaId(mediaId));
  await Promise.allSettled([
    rm(`${basePath}.bin`, { force: true }),
    rm(`${basePath}.json`, { force: true }),
  ]);
}
