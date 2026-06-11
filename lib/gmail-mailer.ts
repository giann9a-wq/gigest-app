import { getGoogleDriveAccessToken } from "@/lib/google-drive-document-storage";

const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1";
const DEFAULT_FROM_EMAIL = "gigest.documentale.01@gmail.com";

async function assertGmailAccountEmail(accessToken: string, expectedEmail: string) {
  const response = await fetch(`${GMAIL_API_URL}/users/me/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Verifica account Gmail fallita: ${errorText}`);
  }

  const data = (await response.json()) as { emailAddress?: string };
  const actual = String(data.emailAddress ?? "").trim().toLowerCase();
  if (!actual || actual !== expectedEmail.toLowerCase()) {
    throw new Error(
      `Refresh token configurato per "${actual || "sconosciuto"}" ma e' richiesto "${expectedEmail}".`
    );
  }
}

function base64UrlEncode(buffer: Buffer) {
  return buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/g, "");
}

function buildRawTextMessage(input: {
  from: string;
  to: string[];
  subject: string;
  body: string;
  attachments?: Array<{
    fileName: string;
    contentType: string;
    content: Buffer;
  }>;
}) {
  const toHeader = input.to.join(", ");
  const attachments = input.attachments ?? [];

  if (attachments.length > 0) {
    const boundary = `gigest-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const headers = [
      `From: ${input.from}`,
      `To: ${toHeader}`,
      `Subject: ${input.subject}`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ];
    const parts = [
      `--${boundary}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      `Content-Transfer-Encoding: 7bit`,
      "",
      input.body,
      "",
      ...attachments.flatMap((attachment) => [
        `--${boundary}`,
        `Content-Type: ${attachment.contentType}; name="${attachment.fileName}"`,
        `Content-Disposition: attachment; filename="${attachment.fileName}"`,
        `Content-Transfer-Encoding: base64`,
        "",
        attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
        "",
      ]),
      `--${boundary}--`,
      "",
    ];

    return `${headers.join("\r\n")}\r\n\r\n${parts.join("\r\n")}`;
  }

  const headers = [
    `From: ${input.from}`,
    `To: ${toHeader}`,
    `Subject: ${input.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    `Content-Transfer-Encoding: 7bit`,
  ];

  return `${headers.join("\r\n")}\r\n\r\n${input.body}\r\n`;
}

export async function sendGmailTextEmail(input: {
  to: string[];
  subject: string;
  body: string;
  from?: string;
  attachments?: Array<{
    fileName: string;
    contentType: string;
    content: Buffer;
  }>;
}) {
  if (!input.to || input.to.length === 0) {
    throw new Error("Nessun destinatario email configurato");
  }

  const accessToken = await getGoogleDriveAccessToken();
  await assertGmailAccountEmail(accessToken, input.from ?? DEFAULT_FROM_EMAIL);
  const rawMessage = buildRawTextMessage({
    from: input.from ?? DEFAULT_FROM_EMAIL,
    to: input.to,
    subject: input.subject,
    body: input.body,
    attachments: input.attachments,
  });

  const response = await fetch(`${GMAIL_API_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: base64UrlEncode(Buffer.from(rawMessage, "utf8")),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Invio email Gmail fallito: ${errorText}`);
  }
}
