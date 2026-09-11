export type WhatsAppListRow = {
  id: string;
  title: string;
  description?: string;
};

export type DownloadedWhatsAppMedia = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
};

export interface WhatsAppProvider {
  sendText(to: string, text: string): Promise<void>;
  sendButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>): Promise<void>;
  sendList(to: string, body: string, buttonLabel: string, rows: WhatsAppListRow[]): Promise<void>;
  downloadMedia(mediaId: string): Promise<DownloadedWhatsAppMedia>;
  discardMedia?(mediaId: string): Promise<void>;
}

type MetaMediaInfo = { url?: string; mime_type?: string; file_size?: number };

export class MetaWhatsAppProvider implements WhatsAppProvider {
  private readonly accessToken: string;
  private readonly phoneNumberId: string;
  private readonly graphVersion: string;

  constructor() {
    this.accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN || "";
    this.phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID || "";
    this.graphVersion = process.env.META_WHATSAPP_GRAPH_API_VERSION || "v25.0";
    if (!this.accessToken || !this.phoneNumberId) {
      throw new Error("Configurazione WhatsApp Cloud API incompleta");
    }
  }

  private async graphFetch(path: string, init?: RequestInit) {
    return fetch(`https://graph.facebook.com/${this.graphVersion}/${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        ...(init?.headers ?? {}),
      },
    });
  }

  private async send(payload: Record<string, unknown>) {
    const normalizedPayload = typeof payload.to === "string" ? { ...payload, to: payload.to.replace(/\D/g, "") } : payload;
    const response = await this.graphFetch(`${this.phoneNumberId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...normalizedPayload }),
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Invio WhatsApp fallito (${response.status}): ${details.slice(0, 300)}`);
    }
  }

  async sendText(to: string, text: string) {
    await this.send({ to, type: "text", text: { preview_url: false, body: text } });
  }

  async sendButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>) {
    await this.send({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: { id: button.id, title: button.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  async sendList(to: string, body: string, buttonLabel: string, rows: WhatsAppListRow[]) {
    await this.send({
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: body },
        action: {
          button: buttonLabel.slice(0, 20),
          sections: [
            {
              title: "Selezione",
              rows: rows.slice(0, 10).map((row) => ({
                id: row.id,
                title: row.title.slice(0, 24),
                ...(row.description ? { description: row.description.slice(0, 72) } : {}),
              })),
            },
          ],
        },
      },
    });
  }

  async downloadMedia(mediaId: string): Promise<DownloadedWhatsAppMedia> {
    const infoResponse = await this.graphFetch(encodeURIComponent(mediaId));
    const info = (await infoResponse.json()) as MetaMediaInfo;
    if (!infoResponse.ok || !info.url) throw new Error("Impossibile recuperare il media WhatsApp");

    const mediaResponse = await fetch(info.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!mediaResponse.ok) throw new Error("Download media WhatsApp fallito");

    const mimeType = info.mime_type || mediaResponse.headers.get("content-type") || "image/jpeg";
    const extension = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    return {
      buffer: Buffer.from(await mediaResponse.arrayBuffer()),
      mimeType,
      filename: `whatsapp-${mediaId}.${extension}`,
    };
  }
}

export class RecordingWhatsAppProvider implements WhatsAppProvider {
  readonly messages: Array<{ type: "text" | "buttons" | "list"; to: string; body: string; options?: unknown }> = [];
  private readonly mediaLoader: (mediaId: string) => Promise<DownloadedWhatsAppMedia>;
  private readonly mediaDiscarder?: (mediaId: string) => Promise<void>;

  constructor(
    mediaLoader: (mediaId: string) => Promise<DownloadedWhatsAppMedia>,
    mediaDiscarder?: (mediaId: string) => Promise<void>
  ) {
    this.mediaLoader = mediaLoader;
    this.mediaDiscarder = mediaDiscarder;
  }

  async sendText(to: string, text: string) {
    this.messages.push({ type: "text", to, body: text });
  }

  async sendButtons(to: string, body: string, buttons: Array<{ id: string; title: string }>) {
    this.messages.push({ type: "buttons", to, body, options: buttons });
  }

  async sendList(to: string, body: string, buttonLabel: string, rows: WhatsAppListRow[]) {
    this.messages.push({ type: "list", to, body, options: { buttonLabel, rows } });
  }

  async downloadMedia(mediaId: string) {
    return this.mediaLoader(mediaId);
  }

  async discardMedia(mediaId: string) {
    await this.mediaDiscarder?.(mediaId);
  }
}
