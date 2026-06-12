import { prisma } from "@/lib/prisma";

const HEADER_NEWS_SETTING_KEY = "headerNews";

type HeaderNewsValue = {
  enabled?: unknown;
  title?: unknown;
  description?: unknown;
};

export type HeaderNews = {
  enabled: boolean;
  title: string;
  description: string;
};

export const DEFAULT_HEADER_NEWS: HeaderNews = {
  enabled: true,
  title: "News",
  description: "Nessuna comunicazione al momento.",
};

function normalizeHeaderNews(value: HeaderNewsValue | null | undefined): HeaderNews {
  const enabled = typeof value?.enabled === "boolean" ? value.enabled : DEFAULT_HEADER_NEWS.enabled;
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  const description = typeof value?.description === "string" ? value.description.trim() : "";

  return {
    enabled,
    title: title || DEFAULT_HEADER_NEWS.title,
    description: description || DEFAULT_HEADER_NEWS.description,
  };
}

export async function getHeaderNews(): Promise<HeaderNews> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: HEADER_NEWS_SETTING_KEY },
    select: { value: true },
  });

  return normalizeHeaderNews(setting?.value as HeaderNewsValue | null | undefined);
}

export async function saveHeaderNews(input: { enabled: boolean; title: string; description: string }) {
  const title = input.title.trim();
  const description = input.description.trim();

  if (title.length > 64) {
    throw new Error("Il titolo News puo contenere al massimo 64 caratteri.");
  }

  if (description.length > 240) {
    throw new Error("La descrizione News puo contenere al massimo 240 caratteri.");
  }

  const news = normalizeHeaderNews({ enabled: input.enabled, title, description });

  await prisma.appSetting.upsert({
    where: { key: HEADER_NEWS_SETTING_KEY },
    create: {
      key: HEADER_NEWS_SETTING_KEY,
      value: news,
    },
    update: {
      value: news,
    },
  });

  return news;
}
