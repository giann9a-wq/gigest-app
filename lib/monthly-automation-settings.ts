import { prisma } from "@/lib/prisma";
import { parseEmailList, validateEmailList } from "@/lib/email-utils";

const MONTHLY_RESOURCE_REPORT_RECIPIENTS_KEY = "monthlyResourceReportRecipients";

type RecipientsSetting = {
  recipients?: unknown;
  includedResourceIds?: unknown;
};

export type MonthlyResourceReportSettings = {
  recipients: string[];
  includedResourceIds: string[];
};

export async function getMonthlyResourceReportSettings(): Promise<MonthlyResourceReportSettings> {
  const setting = await prisma.appSetting.findUnique({
    where: { key: MONTHLY_RESOURCE_REPORT_RECIPIENTS_KEY },
    select: { value: true },
  });

  const value = setting?.value as RecipientsSetting | null | undefined;
  if (!value || !Array.isArray(value.recipients)) {
    return {
      recipients: [],
      includedResourceIds: Array.isArray(value?.includedResourceIds)
        ? value.includedResourceIds.filter((item): item is string => typeof item === "string")
        : [],
    };
  }

  return {
    recipients: value.recipients.filter((item): item is string => typeof item === "string"),
    includedResourceIds: Array.isArray(value.includedResourceIds)
      ? value.includedResourceIds.filter((item): item is string => typeof item === "string")
      : [],
  };
}

export async function getMonthlyResourceReportRecipients() {
  const settings = await getMonthlyResourceReportSettings();
  return settings.recipients;
}

export async function saveMonthlyResourceReportSettings(input: {
  rawRecipients: string;
  includedResourceIds: string[];
}) {
  const recipients = parseEmailList(input.rawRecipients);
  validateEmailList(recipients);
  const includedResourceIds = Array.from(new Set(input.includedResourceIds.filter(Boolean)));

  await prisma.appSetting.upsert({
    where: { key: MONTHLY_RESOURCE_REPORT_RECIPIENTS_KEY },
    create: {
      key: MONTHLY_RESOURCE_REPORT_RECIPIENTS_KEY,
      value: { recipients, includedResourceIds },
    },
    update: {
      value: { recipients, includedResourceIds },
    },
  });

  return { recipients, includedResourceIds };
}
