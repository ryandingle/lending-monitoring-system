import { prisma } from "@/lib/db";
import type { AuditActorType, Prisma } from "@prisma/client";
import { headers } from "next/headers";

export type AuditRequestContext = {
  ip?: string;
  userAgent?: string;
  referer?: string;
};

type Db = Prisma.TransactionClient;

export async function tryGetAuditRequestContext(): Promise<AuditRequestContext> {
  try {
    const h = await headers();
    const xfwd = h.get("x-forwarded-for") ?? "";
    const ip = xfwd.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
    const userAgent = h.get("user-agent") || undefined;
    const referer = h.get("referer") || undefined;
    return { ip, userAgent, referer };
  } catch {
    return {};
  }
}

export async function createAuditLog(
  db: Db,
  input: {
    actorType?: AuditActorType;
    actorUserId?: string | null;
    action: string;
    entityType?: string | null;
    entityId?: string | null;
    metadata?: Prisma.InputJsonValue;
    request?: AuditRequestContext;
  },
) {
  const { request, ...rest } = input;
  return db.auditLog.create({
    data: {
      actorType: rest.actorType ?? "USER",
      actorUserId: rest.actorUserId ?? null,
      action: rest.action,
      entityType: rest.entityType ?? null,
      entityId: rest.entityId ?? null,
      ip: request?.ip ?? null,
      userAgent: request?.userAgent ?? null,
      referer: request?.referer ?? null,
      metadata: rest.metadata ?? undefined,
    },
  });
}

// Convenience helper when you don't already have a transaction.
export async function createAuditLogStandalone(
  input: Parameters<typeof createAuditLog>[1],
) {
  return prisma.$transaction((tx) => createAuditLog(tx, input));
}

