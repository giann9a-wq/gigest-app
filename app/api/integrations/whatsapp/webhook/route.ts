import crypto from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import type { IncomingWhatsAppMessage } from "@/lib/whatsapp/workflow";
import { enqueueWhatsAppMessages, processWhatsAppInboxBatch } from "@/lib/whatsapp/inbox";

export const runtime = "nodejs";

type MetaWebhookPayload = {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
          image?: { id?: string; mime_type?: string; caption?: string; filename?: string };
          interactive?: {
            type?: string;
            button_reply?: { id?: string; title?: string };
            list_reply?: { id?: string; title?: string };
          };
        }>;
      };
    }>;
  }>;
};

function verifySignature(rawBody: string, signature: string | null) {
  const appSecret = process.env.META_APP_SECRET || "";
  if (!appSecret) return process.env.NODE_ENV !== "production";
  if (!signature?.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`;
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function extractMessages(payload: MetaWebhookPayload) {
  const normalized: IncomingWhatsAppMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        if (!message.id || !message.from) continue;
        if (message.type === "image" && message.image?.id) {
          normalized.push({
            providerMessageId: message.id,
            from: message.from,
            type: "image",
            text: message.image.caption,
            media: {
              id: message.image.id,
              mimeType: message.image.mime_type,
              filename: message.image.filename,
            },
          });
        } else if (message.type === "text") {
          normalized.push({ providerMessageId: message.id, from: message.from, type: "text", text: message.text?.body });
        } else if (message.type === "interactive") {
          normalized.push({
            providerMessageId: message.id,
            from: message.from,
            type: "interactive",
            interactiveId: message.interactive?.button_reply?.id || message.interactive?.list_reply?.id,
          });
        }
      }
    }
  }
  return normalized;
}

export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get("hub.mode");
  const token = request.nextUrl.searchParams.get("hub.verify_token");
  const challenge = request.nextUrl.searchParams.get("hub.challenge");
  const expectedToken = process.env.META_WHATSAPP_VERIFY_TOKEN || "";

  if (mode === "subscribe" && expectedToken && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verifica webhook non valida" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Firma webhook non valida" }, { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Payload non valido" }, { status: 400 });
  }
  if (payload.object !== "whatsapp_business_account") return NextResponse.json({ received: true });

  const messages = extractMessages(payload);
  if (messages.length === 0) return NextResponse.json({ received: true });

  try {
    const queued = await enqueueWhatsAppMessages(messages);
    after(async () => {
      try {
        // Meta può consegnare le foto dello stesso invio in webhook ravvicinati.
        // Questa breve finestra permette all'inbox di accorparle prima di rispondere.
        await new Promise((resolve) => setTimeout(resolve, 3_000));
        await processWhatsAppInboxBatch(20, { whatsappPhones: messages.map((message) => message.from) });
      } catch (error) {
        console.error("WhatsApp background inbox processing failed", error);
      }
    });
    return NextResponse.json({ received: true, queued });
  } catch (error) {
    console.error("WhatsApp webhook processing failed", error);
    return NextResponse.json({ error: "Elaborazione webhook fallita" }, { status: 500 });
  }
}
