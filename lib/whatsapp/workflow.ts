import { Prisma, UserStatus, WhatsAppSessionStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createPhotoUpload, ensurePhotoPhase, normalizePhaseName, normalizeWhatsappPhone } from "@/lib/photo-repository";
import type { WhatsAppListRow, WhatsAppProvider } from "@/lib/whatsapp/provider";
import { activePhotoJobOrderById, activePhotoJobOrderWhere } from "@/lib/job-order-access";

type SessionMedia = {
  id: string;
  providerMessageId: string;
  mimeType?: string;
  filename?: string;
  receivedAt: string;
  processingMode?: "SEPARATE";
  batchIndex?: number;
  batchTotal?: number;
};

export type IncomingWhatsAppMessage = {
  providerMessageId: string;
  from: string;
  type: "image" | "text" | "interactive";
  text?: string;
  interactiveId?: string;
  media?: { id: string; mimeType?: string; filename?: string };
};

const terminalStatuses: WhatsAppSessionStatus[] = ["COMPLETED", "CANCELLED", "EXPIRED"];

function sessionTimeoutMs() {
  const configured = Number(process.env.WHATSAPP_SESSION_TIMEOUT_MINUTES || 30);
  return Math.max(5, Number.isFinite(configured) ? configured : 30) * 60_000;
}

function nextExpiry() {
  return new Date(Date.now() + sessionTimeoutMs());
}

function asSessionMedia(value: Prisma.JsonValue): SessionMedia[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is SessionMedia => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    return typeof item.id === "string" && typeof item.providerMessageId === "string";
  });
}

function compact(value: string | undefined) {
  return (value || "").trim().replace(/\s+/g, " ");
}

function isCancel(value: string | undefined) {
  return compact(value).toLocaleUpperCase("it-IT") === "ANNULLA";
}

async function discardSessionMedia(provider: WhatsAppProvider, media: SessionMedia[]) {
  if (!provider.discardMedia) return;
  await Promise.allSettled(media.map((item) => provider.discardMedia?.(item.id)));
}

async function expireSession(
  provider: WhatsAppProvider,
  session: { id: string; media: Prisma.JsonValue; userId: string; whatsappPhone: string; jobOrderId?: string | null }
) {
  await prisma.$transaction([
    prisma.whatsAppUploadSession.update({
      where: { id: session.id },
      data: { status: "EXPIRED", activeKey: null, lastInteractionAt: new Date() },
    }),
    prisma.photoAuditEvent.create({
      data: {
        action: "SESSION_EXPIRED",
        actorUserId: session.userId,
        whatsappPhone: session.whatsappPhone,
        jobOrderId: session.jobOrderId ?? null,
        details: { sessionId: session.id },
      },
    }),
  ]);
  await discardSessionMedia(provider, asSessionMedia(session.media));
}

async function cancelSession(
  provider: WhatsAppProvider,
  session: { id: string; media: Prisma.JsonValue; userId: string; whatsappPhone: string; jobOrderId?: string | null }
) {
  await prisma.$transaction([
    prisma.whatsAppUploadSession.update({
      where: { id: session.id },
      data: { status: "CANCELLED", activeKey: null, lastInteractionAt: new Date() },
    }),
    prisma.photoAuditEvent.create({
      data: {
        action: "SESSION_CANCELLED",
        actorUserId: session.userId,
        whatsappPhone: session.whatsappPhone,
        jobOrderId: session.jobOrderId ?? null,
        details: { sessionId: session.id },
      },
    }),
  ]);
  await discardSessionMedia(provider, asSessionMedia(session.media));
}

async function sendJobOrderSelection(provider: WhatsAppProvider, to: string, search = "") {
  const jobOrders = await prisma.jobOrder.findMany({
    where: {
      ...activePhotoJobOrderWhere,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: 10,
    select: { id: true, name: true },
  });

  if (jobOrders.length === 0) {
    await provider.sendText(to, search ? "Nessuna commessa corrisponde alla ricerca. Scrivi un altro nome." : "Non ci sono commesse attive disponibili.");
    return;
  }

  await provider.sendList(
    to,
    search ? "Seleziona la commessa tra i risultati:" : "Seleziona la commessa a cui associare le fotografie. Se non la trovi, scrivi parte del nome.",
    "Scegli commessa",
    jobOrders.map((jobOrder): WhatsAppListRow => ({ id: `job:${jobOrder.id}`, title: jobOrder.name }))
  );
}

async function sendPhaseSelection(provider: WhatsAppProvider, to: string, jobOrderId: string, search = "") {
  const phases = await prisma.photoPhase.findMany({
    where: {
      jobOrderId,
      ...(search ? { name: { contains: search, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    take: 9,
    select: { id: true, name: true },
  });
  await provider.sendList(
    to,
    phases.length ? "A quale fase appartengono queste fotografie?" : "Non ci sono ancora fasi. Creane una per continuare.",
    "Scegli fase",
    [
      ...phases.map((phase): WhatsAppListRow => ({ id: `phase:${phase.id}`, title: phase.name })),
      { id: "phase:new", title: "+ Nuova fase" },
    ]
  );
}

async function askNoteChoice(provider: WhatsAppProvider, to: string) {
  await provider.sendButtons(to, "Vuoi aggiungere una nota alle fotografie?", [
    { id: "note:add", title: "Aggiungi nota" },
    { id: "note:none", title: "Nessuna nota" },
  ]);
}

async function askBatchChoice(provider: WhatsAppProvider, to: string, count: number) {
  await provider.sendButtons(
    to,
    `📸 Ho ricevuto ${count} fotografie. Appartengono tutte alla stessa commessa?`,
    [
      { id: "batch:same", title: "Sì, stessa" },
      { id: "batch:separate", title: "No, diverse" },
    ]
  );
}

function mediaForCurrentAssignment(media: SessionMedia[]) {
  return media[0]?.processingMode === "SEPARATE" ? media.slice(0, 1) : media;
}

async function sendConfirmation(provider: WhatsAppProvider, to: string, sessionId: string) {
  const session = await prisma.whatsAppUploadSession.findUnique({
    where: { id: sessionId },
    include: {
      jobOrder: { select: { name: true } },
      phase: { select: { name: true } },
    },
  });
  if (!session?.jobOrder || !session.phase) throw new Error("Sessione incompleta");
  const media = mediaForCurrentAssignment(asSessionMedia(session.media));
  const note = session.note ? `\nNota: ${session.note}` : "\nNota: nessuna";
  const progress = media[0]?.processingMode === "SEPARATE"
    ? `Foto ${media[0].batchIndex ?? 1} di ${media[0].batchTotal ?? 1}\n`
    : "";
  await provider.sendButtons(
    to,
    `📸 ${progress}${media.length} ${media.length === 1 ? "fotografia" : "fotografie"}\nCommessa: ${session.jobOrder.name}\nFase: ${session.phase.name}${note}\n\nConfermi il caricamento?`,
    [
      { id: "confirm:yes", title: "Conferma" },
      { id: "confirm:no", title: "Annulla" },
    ]
  );
}

async function appendMediaToSession(input: {
  userId: string;
  phone: string;
  message: IncomingWhatsAppMessage;
}) {
  if (!input.message.media) throw new Error("Media mancante");
  const incoming: SessionMedia = {
    id: input.message.media.id,
    providerMessageId: input.message.providerMessageId,
    ...(input.message.media.mimeType ? { mimeType: input.message.media.mimeType } : {}),
    ...(input.message.media.filename ? { filename: input.message.media.filename } : {}),
    receivedAt: new Date().toISOString(),
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const current = await tx.whatsAppUploadSession.findUnique({ where: { activeKey: input.phone } });
          if (current && current.status !== "WAITING_FOR_MEDIA" && current.status !== "WAITING_FOR_COMMESSA") {
            return { outcome: "BUSY" as const, session: current };
          }

          if (current) {
            const media = asSessionMedia(current.media);
            if (media.some((item) => item.providerMessageId === incoming.providerMessageId || item.id === incoming.id)) {
              return { outcome: "DUPLICATE" as const, session: current };
            }
            media.push(incoming);
            const updated = await tx.whatsAppUploadSession.update({
              where: { id: current.id },
              data: { media, lastInteractionAt: new Date(), expiresAt: nextExpiry() },
            });
            return { outcome: "APPENDED" as const, session: updated };
          }

          // Un retry tardivo non deve riaprire una conversazione già conclusa o scaduta.
          const previousSessions = await tx.whatsAppUploadSession.findMany({
            where: { whatsappPhone: input.phone },
            orderBy: { createdAt: "desc" },
            take: 25,
            select: { media: true },
          });
          const alreadyReceived = previousSessions.some((previous) =>
            asSessionMedia(previous.media).some(
              (item) => item.providerMessageId === incoming.providerMessageId || item.id === incoming.id
            )
          );
          if (alreadyReceived) return { outcome: "DUPLICATE" as const, session: null };

          const created = await tx.whatsAppUploadSession.create({
            data: {
              activeKey: input.phone,
              userId: input.userId,
              whatsappPhone: input.phone,
              status: "WAITING_FOR_MEDIA",
              media: [incoming],
              expiresAt: nextExpiry(),
            },
          });
          return { outcome: "APPENDED" as const, session: created };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (attempt === 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2002", "P2034"].includes(error.code)) {
        throw error;
      }
    }
  }
  throw new Error("Impossibile creare la sessione WhatsApp");
}

async function finalizeSession(provider: WhatsAppProvider, to: string, sessionId: string) {
  const claimed = await prisma.whatsAppUploadSession.updateMany({
    where: { id: sessionId, status: "WAITING_FOR_CONFIRMATION", activeKey: to },
    data: { status: "COMPLETED", activeKey: null, lastInteractionAt: new Date() },
  });
  if (claimed.count === 0) {
    await provider.sendText(to, "Questa operazione è già stata conclusa.");
    return;
  }

  const session = await prisma.whatsAppUploadSession.findUnique({ where: { id: sessionId } });
  if (!session?.jobOrderId || !session.phaseId) throw new Error("Sessione incompleta");
  const allMedia = asSessionMedia(session.media);
  const media = mediaForCurrentAssignment(allMedia);
  const remainingMedia = allMedia.slice(media.length);

  try {
    const downloaded = await Promise.all(
      media.map(async (item) => {
        const file = await provider.downloadMedia(item.id);
        return {
          ...file,
          filename: item.filename || file.filename,
          whatsappMediaId: item.id,
          metadata: { providerMessageId: item.providerMessageId, receivedAt: item.receivedAt },
        };
      })
    );
    await createPhotoUpload({
      jobOrderId: session.jobOrderId,
      phaseId: session.phaseId,
      userId: session.userId,
      note: session.note,
      source: "WHATSAPP",
      whatsappSessionId: session.id,
      whatsappPhone: session.whatsappPhone,
      media: downloaded,
    });
    await discardSessionMedia(provider, media);
    if (remainingMedia.length > 0 && media[0]?.processingMode === "SEPARATE") {
      await prisma.whatsAppUploadSession.create({
        data: {
          activeKey: to,
          userId: session.userId,
          whatsappPhone: session.whatsappPhone,
          status: "WAITING_FOR_COMMESSA",
          media: remainingMedia,
          expiresAt: nextExpiry(),
        },
      });
      const next = remainingMedia[0];
      await provider.sendText(
        to,
        `✅ Foto archiviata. Ora assegniamo la foto ${next.batchIndex ?? 2} di ${next.batchTotal ?? allMedia.length}.`
      );
      await sendJobOrderSelection(provider, to);
      return;
    }
    await provider.sendText(
      to,
      `✅ Caricamento completato. ${media.length} ${media.length === 1 ? "fotografia archiviata" : "fotografie archiviate"} in GiGest.`
    );
  } catch (error) {
    await prisma.whatsAppUploadSession.update({
      where: { id: session.id },
      data: { status: "WAITING_FOR_CONFIRMATION", activeKey: to, expiresAt: nextExpiry() },
    });
    console.error("WhatsApp photo finalization failed", error);
    await provider.sendText(to, "Il caricamento non è riuscito. Le fotografie non sono state archiviate. Riprova con Conferma o scrivi ANNULLA.");
  }
}

async function transitionToPhase(provider: WhatsAppProvider, to: string, sessionId: string, jobOrderId: string) {
  const jobOrder = await prisma.jobOrder.findFirst({
    where: activePhotoJobOrderById(jobOrderId),
    select: { id: true },
  });
  if (!jobOrder) {
    await provider.sendText(to, "Commessa non valida o non più attiva.");
    await sendJobOrderSelection(provider, to);
    return;
  }
  await prisma.whatsAppUploadSession.update({
    where: { id: sessionId },
    data: { jobOrderId, phaseId: null, status: "WAITING_FOR_PHASE", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
  });
  await sendPhaseSelection(provider, to, jobOrderId);
}

async function transitionToNote(provider: WhatsAppProvider, to: string, sessionId: string, phaseId: string) {
  const session = await prisma.whatsAppUploadSession.findUnique({ where: { id: sessionId }, select: { jobOrderId: true } });
  if (!session?.jobOrderId) throw new Error("Commessa non selezionata");
  const phase = await prisma.photoPhase.findFirst({ where: { id: phaseId, jobOrderId: session.jobOrderId }, select: { id: true } });
  if (!phase) {
    await provider.sendText(to, "Fase non valida.");
    await sendPhaseSelection(provider, to, session.jobOrderId);
    return;
  }
  await prisma.whatsAppUploadSession.update({
    where: { id: sessionId },
    data: { phaseId, status: "WAITING_FOR_NOTE_CHOICE", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
  });
  await askNoteChoice(provider, to);
}

export async function processWhatsAppMessage(
  provider: WhatsAppProvider,
  message: IncomingWhatsAppMessage,
  options?: { authenticatedUserId?: string; deferMediaPrompt?: boolean }
) {
  const phone = normalizeWhatsappPhone(message.from);
  const user = options?.authenticatedUserId
    ? await prisma.user.findFirst({ where: { id: options.authenticatedUserId, status: UserStatus.ACTIVE } })
    : await prisma.user.findFirst({
        where: { whatsappPhone: phone, whatsappEnabled: true, status: UserStatus.ACTIVE },
      });
  if (!user) {
    if (message.media && provider.discardMedia) await provider.discardMedia(message.media.id);
    await provider.sendText(phone, "Numero non autorizzato all’utilizzo di GiGest.");
    return;
  }

  let session = await prisma.whatsAppUploadSession.findUnique({ where: { activeKey: phone } });
  if (session && session.expiresAt.getTime() <= Date.now()) {
    await expireSession(provider, session);
    await provider.sendText(phone, "La sessione precedente è scaduta. Invia nuovamente le fotografie per iniziare.");
    session = null;
  }

  const command = message.type === "interactive" ? message.interactiveId : message.text;
  if (session && isCancel(command)) {
    await cancelSession(provider, session);
    await provider.sendText(phone, "Operazione annullata.");
    return;
  }

  if (message.type === "image" && message.media) {
    const appendResult = await appendMediaToSession({ userId: user.id, phone, message });
    if (appendResult.outcome === "DUPLICATE") return;
    if (appendResult.outcome === "BUSY") {
      if (provider.discardMedia) await provider.discardMedia(message.media.id);
      await provider.sendText(phone, "Completa l’operazione corrente oppure scrivi ANNULLA prima di inviare altre fotografie.");
      return;
    }
    const updated = appendResult.session;
    const count = asSessionMedia(updated.media).length;
    if (options?.deferMediaPrompt) return;

    if (updated.status === "WAITING_FOR_COMMESSA") {
      if (count > 1) {
        await prisma.whatsAppUploadSession.update({
          where: { id: updated.id },
          data: {
            status: "WAITING_FOR_MEDIA",
            jobOrderId: null,
            phaseId: null,
            note: null,
            lastInteractionAt: new Date(),
            expiresAt: nextExpiry(),
          },
        });
        await askBatchChoice(provider, phone, count);
        return;
      }
      await provider.sendText(phone, `📸 Ricevute ${count} ${count === 1 ? "fotografia" : "fotografie"}.`);
      await sendJobOrderSelection(provider, phone);
      return;
    }

    if (count === 1) {
      await prisma.whatsAppUploadSession.update({
        where: { id: updated.id },
        data: { status: "WAITING_FOR_COMMESSA", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
      });
      await provider.sendText(phone, "📸 Fotografia ricevuta.");
      await sendJobOrderSelection(provider, phone);
      return;
    }

    await askBatchChoice(provider, phone, count);
    return;
  }

  if (!session || terminalStatuses.includes(session.status)) {
    await provider.sendText(phone, "Invia una o più fotografie per iniziare un nuovo caricamento.");
    return;
  }

  const value = compact(command);
  const existingMedia = asSessionMedia(session.media);
  if (
    session.status === "WAITING_FOR_COMMESSA" &&
    existingMedia.length > 1 &&
    existingMedia[0]?.processingMode !== "SEPARATE"
  ) {
    await prisma.whatsAppUploadSession.update({
      where: { id: session.id },
      data: {
        status: "WAITING_FOR_MEDIA",
        jobOrderId: null,
        phaseId: null,
        note: null,
        lastInteractionAt: new Date(),
        expiresAt: nextExpiry(),
      },
    });
    await askBatchChoice(provider, phone, existingMedia.length);
    return;
  }

  if (session.status === "WAITING_FOR_MEDIA") {
    const normalized = normalizePhaseName(value);
    const media = asSessionMedia(session.media);
    if (value === "batch:same" || normalized === "si stessa" || normalized === "si") {
      await prisma.whatsAppUploadSession.update({
        where: { id: session.id },
        data: { status: "WAITING_FOR_COMMESSA", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
      });
      await sendJobOrderSelection(provider, phone);
      return;
    }
    if (value === "batch:separate" || normalized === "no diverse" || normalized === "no") {
      const separateMedia = media.map((item, index) => ({
        ...item,
        processingMode: "SEPARATE" as const,
        batchIndex: index + 1,
        batchTotal: media.length,
      }));
      await prisma.whatsAppUploadSession.update({
        where: { id: session.id },
        data: {
          media: separateMedia,
          status: "WAITING_FOR_COMMESSA",
          lastInteractionAt: new Date(),
          expiresAt: nextExpiry(),
        },
      });
      await provider.sendText(phone, `Va bene, assegniamo le ${media.length} fotografie una alla volta. Iniziamo dalla foto 1 di ${media.length}.`);
      await sendJobOrderSelection(provider, phone);
      return;
    }
    await askBatchChoice(provider, phone, media.length);
    return;
  }

  if (session.status === "WAITING_FOR_COMMESSA") {
    if (value.startsWith("job:")) {
      await transitionToPhase(provider, phone, session.id, value.slice(4));
      return;
    }
    if (value) {
      const matches = await prisma.jobOrder.findMany({
        where: { ...activePhotoJobOrderWhere, name: { contains: value, mode: "insensitive" } },
        take: 2,
        select: { id: true },
      });
      if (matches.length === 1) await transitionToPhase(provider, phone, session.id, matches[0].id);
      else await sendJobOrderSelection(provider, phone, value);
      return;
    }
    await sendJobOrderSelection(provider, phone);
    return;
  }

  if (session.status === "WAITING_FOR_PHASE") {
    if (value === "phase:new") {
      await prisma.whatsAppUploadSession.update({
        where: { id: session.id },
        data: { status: "WAITING_FOR_NEW_PHASE_NAME", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
      });
      await provider.sendText(phone, "Scrivi il nome della nuova fase.");
      return;
    }
    if (value.startsWith("phase:")) {
      await transitionToNote(provider, phone, session.id, value.slice(6));
      return;
    }
    if (value && session.jobOrderId) {
      const matches = await prisma.photoPhase.findMany({
        where: { jobOrderId: session.jobOrderId, name: { contains: value, mode: "insensitive" } },
        take: 2,
        select: { id: true },
      });
      if (matches.length === 1) await transitionToNote(provider, phone, session.id, matches[0].id);
      else await sendPhaseSelection(provider, phone, session.jobOrderId, value);
      return;
    }
  }

  if (session.status === "WAITING_FOR_NEW_PHASE_NAME") {
    if (!value || !session.jobOrderId) {
      await provider.sendText(phone, "Scrivi un nome valido per la nuova fase.");
      return;
    }
    const phase = await ensurePhotoPhase({ jobOrderId: session.jobOrderId, phaseName: value, createdByUserId: user.id });
    await transitionToNote(provider, phone, session.id, phase.id);
    return;
  }

  if (session.status === "WAITING_FOR_NOTE_CHOICE") {
    const normalized = normalizePhaseName(value);
    if (value === "note:add" || normalized === "aggiungi nota") {
      await prisma.whatsAppUploadSession.update({
        where: { id: session.id },
        data: { status: "WAITING_FOR_NOTE", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
      });
      await provider.sendText(phone, "Scrivi la nota da associare alle fotografie.");
      return;
    }
    if (value === "note:none" || normalized === "nessuna nota") {
      await prisma.whatsAppUploadSession.update({
        where: { id: session.id },
        data: { note: null, status: "WAITING_FOR_CONFIRMATION", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
      });
      await sendConfirmation(provider, phone, session.id);
      return;
    }
    await askNoteChoice(provider, phone);
    return;
  }

  if (session.status === "WAITING_FOR_NOTE") {
    if (!value) {
      await provider.sendText(phone, "Scrivi la nota oppure ANNULLA per interrompere.");
      return;
    }
    await prisma.whatsAppUploadSession.update({
      where: { id: session.id },
      data: { note: value, status: "WAITING_FOR_CONFIRMATION", lastInteractionAt: new Date(), expiresAt: nextExpiry() },
    });
    await sendConfirmation(provider, phone, session.id);
    return;
  }

  if (session.status === "WAITING_FOR_CONFIRMATION") {
    const normalized = normalizePhaseName(value);
    if (value === "confirm:yes" || normalized === "conferma") {
      await finalizeSession(provider, phone, session.id);
      return;
    }
    if (value === "confirm:no" || normalized === "annulla") {
      await cancelSession(provider, session);
      await provider.sendText(phone, "Operazione annullata.");
      return;
    }
    await sendConfirmation(provider, phone, session.id);
    return;
  }

  await provider.sendText(phone, "Messaggio non previsto. Usa le opzioni mostrate oppure scrivi ANNULLA.");
}
