import { Prisma, WhatsAppInboundEventStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsappPhone } from "@/lib/photo-repository";
import { MetaWhatsAppProvider } from "@/lib/whatsapp/provider";
import { processWhatsAppMessage, type IncomingWhatsAppMessage } from "@/lib/whatsapp/workflow";

const PROCESSING_LEASE_MS = 10 * 60_000;
const RETRY_DELAYS_MS = [30_000, 2 * 60_000, 10 * 60_000, 30 * 60_000, 60 * 60_000];

function jsonPayload(message: IncomingWhatsAppMessage): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(message)) as Prisma.InputJsonValue;
}

function parsePayload(payload: Prisma.JsonValue): IncomingWhatsAppMessage {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("Payload inbox non valido");
  const providerMessageId = typeof payload.providerMessageId === "string" ? payload.providerMessageId : "";
  const from = typeof payload.from === "string" ? payload.from : "";
  const type = payload.type;
  if (!providerMessageId || !from || (type !== "image" && type !== "text" && type !== "interactive")) {
    throw new Error("Evento WhatsApp incompleto");
  }
  return payload as unknown as IncomingWhatsAppMessage;
}

export async function enqueueWhatsAppMessages(messages: IncomingWhatsAppMessage[]) {
  if (messages.length === 0) return 0;
  const receivedAt = Date.now();
  const result = await prisma.whatsAppInboundEvent.createMany({
    data: messages.map((message, index) => ({
      providerMessageId: message.providerMessageId,
      whatsappPhone: normalizeWhatsappPhone(message.from),
      payload: jsonPayload(message),
      createdAt: new Date(receivedAt + index),
      nextAttemptAt: new Date(receivedAt),
    })),
    skipDuplicates: true,
  });
  return result.count;
}

async function claimNextEvent(whatsappPhones?: string[]) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - PROCESSING_LEASE_MS);

  for (let transactionAttempt = 0; transactionAttempt < 3; transactionAttempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const candidates = await tx.whatsAppInboundEvent.findMany({
            where: {
              ...(whatsappPhones?.length ? { whatsappPhone: { in: whatsappPhones } } : {}),
              OR: [
                { status: "PENDING", nextAttemptAt: { lte: now } },
                { status: "FAILED", nextAttemptAt: { lte: now } },
                { status: "PROCESSING", processingStartedAt: { lte: staleBefore } },
              ],
            },
            orderBy: { createdAt: "asc" },
            take: 25,
          });

          for (const candidate of candidates) {
            const earlierIncomplete = await tx.whatsAppInboundEvent.count({
              where: {
                whatsappPhone: candidate.whatsappPhone,
                createdAt: { lt: candidate.createdAt },
                status: { not: "COMPLETED" },
              },
            });
            if (earlierIncomplete > 0) continue;

            const expectedStatus = candidate.status;
            const claimed = await tx.whatsAppInboundEvent.updateMany({
              where: {
                id: candidate.id,
                status: expectedStatus,
                ...(expectedStatus === "PROCESSING" ? { processingStartedAt: { lte: staleBefore } } : {}),
              },
              data: {
                status: "PROCESSING",
                processingStartedAt: now,
                attemptCount: { increment: 1 },
                lastError: null,
              },
            });
            if (claimed.count === 1) {
              return tx.whatsAppInboundEvent.findUnique({ where: { id: candidate.id } });
            }
          }
          return null;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (
        transactionAttempt === 2 ||
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034"
      ) {
        throw error;
      }
    }
  }
  return null;
}

function nextRetryDate(attemptCount: number) {
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attemptCount - 1, 0), RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delay);
}

async function hasQueuedImage(event: { id: string; whatsappPhone: string }) {
  const queuedEvents = await prisma.whatsAppInboundEvent.findMany({
    where: {
      id: { not: event.id },
      whatsappPhone: event.whatsappPhone,
      status: "PENDING",
    },
    orderBy: { createdAt: "asc" },
    take: 5,
    select: { payload: true },
  });
  return queuedEvents.some((queued) => {
    try {
      return parsePayload(queued.payload).type === "image";
    } catch {
      return false;
    }
  });
}

export async function processWhatsAppInboxBatch(limit = 20, options?: { whatsappPhones?: string[] }) {
  const provider = new MetaWhatsAppProvider();
  const whatsappPhones = options?.whatsappPhones
    ? [...new Set(options.whatsappPhones.map(normalizeWhatsappPhone).filter(Boolean))]
    : undefined;
  let completed = 0;
  let failed = 0;

  for (let index = 0; index < Math.max(1, Math.min(limit, 100)); index += 1) {
    const event = await claimNextEvent(whatsappPhones);
    if (!event) break;

    try {
      const message = parsePayload(event.payload);
      await processWhatsAppMessage(provider, message, {
        deferMediaPrompt: message.type === "image" && await hasQueuedImage(event),
      });
      await prisma.whatsAppInboundEvent.update({
        where: { id: event.id },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          processingStartedAt: null,
          lastError: null,
        },
      });
      completed += 1;
    } catch (error) {
      const lastError = error instanceof Error ? error.message : "Errore non identificato";
      await prisma.whatsAppInboundEvent.update({
        where: { id: event.id },
        data: {
          status: WhatsAppInboundEventStatus.FAILED,
          processingStartedAt: null,
          nextAttemptAt: nextRetryDate(event.attemptCount),
          lastError: lastError.slice(0, 4000),
        },
      });
      console.error("WhatsApp inbox event failed", { eventId: event.id, attempt: event.attemptCount, error });
      failed += 1;
    }
  }

  return { completed, failed };
}
