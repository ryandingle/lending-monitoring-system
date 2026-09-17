import { prisma } from "@/lib/db";

export const APP_CONTROL_KEYS = {
  REPORT_VIEW_DOWNLOAD_ENABLED: "REPORT_VIEW_DOWNLOAD_ENABLED",
} as const;

export type AppControlKey = (typeof APP_CONTROL_KEYS)[keyof typeof APP_CONTROL_KEYS];

export interface ResolvedAppControl {
  key: string;
  enabled: boolean;
  value: string | null;
  expiresAt: Date | null;
  isExpired: boolean;
}

export async function resolveAppControl(key: AppControlKey): Promise<ResolvedAppControl> {
  const row = await prisma.appControl.findUnique({ where: { key } });
  if (!row) {
    return { key, enabled: false, value: null, expiresAt: null, isExpired: false };
  }
  const isExpired = row.expiresAt ? row.expiresAt.getTime() <= Date.now() : false;
  return {
    key: row.key,
    enabled: isExpired ? false : row.enabled,
    value: row.value ?? null,
    expiresAt: row.expiresAt ?? null,
    isExpired,
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function getManilaEndOfToday(): Date {
  const utcNow = new Date(Date.now());
  const manilaTime = new Date(utcNow.getTime() + 8 * 60 * 60 * 1000);
  const ymd = `${manilaTime.getUTCFullYear()}-${pad(manilaTime.getUTCMonth() + 1)}-${pad(manilaTime.getUTCDate())}`;
  return new Date(`${ymd}T23:59:59.999+08:00`);
}

export async function setAppControl(
  key: AppControlKey,
  payload: {
    enabled: boolean;
    expiresAt?: Date | null;
    value?: string | null;
    updatedById: string;
  },
): Promise<ResolvedAppControl> {
  const row = await prisma.appControl.upsert({
    where: { key },
    create: {
      key,
      enabled: payload.enabled,
      expiresAt: payload.expiresAt ?? null,
      value: payload.value ?? null,
      updatedById: payload.updatedById,
    },
    update: {
      enabled: payload.enabled,
      expiresAt: payload.expiresAt ?? null,
      value: payload.value ?? null,
      updatedById: payload.updatedById,
    },
  });
  const isExpired = row.expiresAt ? row.expiresAt.getTime() <= Date.now() : false;
  return {
    key: row.key,
    enabled: isExpired ? false : row.enabled,
    value: row.value ?? null,
    expiresAt: row.expiresAt ?? null,
    isExpired,
  };
}

