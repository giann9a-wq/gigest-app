import { prisma } from "@/lib/prisma";

const HEADER_NEWS_SETTING_KEY = "headerNews";

type HeaderNewsValue = {
  title?: unknown;
  description?: unknown;
};

export type HeaderNews = {
  title: string;
  description: string;
};

export const DEFAULT_HEADER_NEWS: HeaderNews = {
  title: "News",
  description: "Nessuna comunicazione al momento.",
};

function normalizeHeaderNews(value: HeaderNewsValue | null | undefined): HeaderNews {
  const title = typeof value?.title === "string" ? value.title.trim() : "";
  const description = typeof value?.description === "string" ? value.description.trim() : "";

  return {
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

export async function saveHeaderNews(input: { title: string; description: string }) {
  const title = input.title.trim();
  const description = input.description.trim();

  if (title.length > 48) {
    throw new Error("Il titolo News puo contenere al massimo 48 caratteri.");
  }

  if (description.length > 160) {
    throw new Error("La descrizione News puo contenere al massimo 160 caratteri.");
  }

  const news = normalizeHeaderNews({ title, description });

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
