import { ScannedDeliveryNoteStatus } from "@prisma/client";
import {
  ensureScannedDeliveryNotesFolder,
  getGoogleDriveAccessToken,
  uploadDocumentBufferToDrive,
} from "@/lib/google-drive-document-storage";
import { prisma } from "@/lib/prisma";

const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1";
const ALLOWED_SCAN_SENDERS = new Set([
  "stampante@impresagianigiovanni.it",
  "lorenzo.giani@outlook.it",
]);

type GmailListResponse = {
  messages?: Array<{ id: string; threadId: string }>;
};

type GmailMessage = {
  id: string;
  internalDate?: string;
  payload?: GmailPart;
};

type GmailPart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name: string; value: string }>;
  body?: {
    attachmentId?: string;
    size?: number;
    data?: string;
  };
  parts?: GmailPart[];
};

type GmailAttachmentResponse = {
  data?: string;
  size?: number;
};

function base64UrlDecode(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function headerValue(message: GmailMessage, name: string) {
  const header = message.payload?.headers?.find(
    (item) => item.name.toLowerCase() === name.toLowerCase()
  );
  return header?.value ?? "";
}

function extractEmailAddress(value: string) {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function collectPdfAttachments(part: GmailPart | undefined, results: GmailPart[] = []) {
  if (!part) return results;

  const fileName = part.filename?.trim() ?? "";
  const isPdf =
    Boolean(part.body?.attachmentId) &&
    (part.mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf"));

  if (isPdf) {
    results.push(part);
  }

  for (const child of part.parts ?? []) {
    collectPdfAttachments(child, results);
  }

  return results;
}

async function gmailFetch(accessToken: string, url: string) {
  return fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

async function fetchMessage(accessToken: string, messageId: string) {
  const response = await gmailFetch(
    accessToken,
    `${GMAIL_API_URL}/users/me/messages/${encodeURIComponent(messageId)}?format=full`
  );

  if (!response.ok) {
    throw new Error(`Lettura mail Gmail fallita: ${await response.text()}`);
  }

  return (await response.json()) as GmailMessage;
}

async function fetchAttachment(accessToken: string, messageId: string, attachmentId: string) {
  const response = await gmailFetch(
    accessToken,
    `${GMAIL_API_URL}/users/me/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`
  );

  if (!response.ok) {
    throw new Error(`Download allegato Gmail fallito: ${await response.text()}`);
  }

  const data = (await response.json()) as GmailAttachmentResponse;
  if (!data.data) {
    throw new Error("Allegato Gmail vuoto");
  }

  return base64UrlDecode(data.data);
}

export async function getNewScannedDeliveryNoteCount() {
  return prisma.scannedDeliveryNote.count({
    where: { status: ScannedDeliveryNoteStatus.NEW },
  });
}

export async function syncGmailScannedDeliveryNotes() {
  const accessToken = await getGoogleDriveAccessToken();
  const folderId = await ensureScannedDeliveryNotesFolder();
  const senderQuery = [...ALLOWED_SCAN_SENDERS].map((sender) => `from:${sender}`).join(" OR ");
  const query = `has:attachment filename:pdf (${senderQuery})`;
  const listUrl = new URL(`${GMAIL_API_URL}/users/me/messages`);
  listUrl.searchParams.set("q", query);
  listUrl.searchParams.set("maxResults", "25");

  const listResponse = await gmailFetch(accessToken, listUrl.toString());
  if (!listResponse.ok) {
    throw new Error(`Ricerca Gmail fallita: ${await listResponse.text()}`);
  }

  const listed = (await listResponse.json()) as GmailListResponse;
  const messages = listed.messages ?? [];
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  for (const listedMessage of messages) {
    try {
      const message = await fetchMessage(accessToken, listedMessage.id);
      const fromEmail = extractEmailAddress(headerValue(message, "From"));

      if (!ALLOWED_SCAN_SENDERS.has(fromEmail)) {
        skipped += 1;
        continue;
      }

      const subject = headerValue(message, "Subject") || null;
      const receivedAt = message.internalDate
        ? new Date(Number(message.internalDate))
        : new Date();
      const attachments = collectPdfAttachments(message.payload);

      if (attachments.length === 0) {
        skipped += 1;
        continue;
      }

      for (const attachment of attachments) {
        const attachmentId = attachment.body?.attachmentId;
        if (!attachmentId) {
          skipped += 1;
          continue;
        }

        const existing = await prisma.scannedDeliveryNote.findUnique({
          where: {
            gmailMessageId_gmailAttachmentId: {
              gmailMessageId: message.id,
              gmailAttachmentId: attachmentId,
            },
          },
          select: { id: true },
        });

        if (existing) {
          skipped += 1;
          continue;
        }

        const fileName = attachment.filename?.trim() || `scansione-${message.id}.pdf`;
        const buffer = await fetchAttachment(accessToken, message.id, attachmentId);
        const uploaded = await uploadDocumentBufferToDrive({
          fileName,
          mimeType: "application/pdf",
          buffer,
          folderId,
        });

        await prisma.scannedDeliveryNote.create({
          data: {
            gmailMessageId: message.id,
            gmailAttachmentId: attachmentId,
            gmailInternalDate: receivedAt,
            fromEmail,
            subject,
            fileName: uploaded.fileName,
            driveFileId: uploaded.driveFileId,
            mimeType: uploaded.mimeType,
            sizeBytes: uploaded.sizeBytes,
            status: ScannedDeliveryNoteStatus.NEW,
            receivedAt,
          },
        });
        imported += 1;
      }
    } catch (error) {
      errors += 1;
      console.error("Errore import scansione Gmail", {
        messageId: listedMessage.id,
        error: error instanceof Error ? error.message : error,
      });
    }
  }

  return {
    scannedMessages: messages.length,
    imported,
    skipped,
    errors,
  };
}
