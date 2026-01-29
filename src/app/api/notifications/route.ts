import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";

type NotificationItem = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
  actorName: string | null;
  actorEmail: string | null;
  isUnread: boolean;
};

const EXCLUDED_ACTIONS = ["LOGIN", "LOGOUT"];

export async function GET() {
  const authUser = await requireUser();
  requireRole(authUser, [Role.SUPER_ADMIN]);

  const user = await prisma.user.findUnique({
    where: { id: authUser.id },
    select: { notificationsLastSeenAt: true },
  });

  const lastSeen = user?.notificationsLastSeenAt ?? new Date(0);

  const [unreadCount, rows] = await Promise.all([
    prisma.auditLog.count({
      where: {
        action: { notIn: EXCLUDED_ACTIONS },
        actorUser: { role: Role.ENCODER },
        // unread = after lastSeen AND not explicitly read
        createdAt: { gt: lastSeen },
        notificationReads: { none: { userId: authUser.id } },
      },
    }),
    prisma.auditLog.findMany({
      where: {
        action: { notIn: EXCLUDED_ACTIONS },
        actorUser: { role: Role.ENCODER },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
      include: {
        actorUser: { select: { name: true, email: true } },
      },
    }),
  ]);

  const readRows = await prisma.notificationRead.findMany({
    where: {
      userId: authUser.id,
      auditLogId: { in: rows.map((r) => r.id) },
    },
    select: { auditLogId: true },
  });
  const readSet = new Set(readRows.map((r) => r.auditLogId));

  const items: NotificationItem[] = rows.map((r) => ({
    id: r.id,
    action: r.action,
    entityType: r.entityType ?? null,
    entityId: r.entityId ?? null,
    createdAt: r.createdAt.toISOString(),
    actorName: r.actorUser?.name ?? null,
    actorEmail: r.actorUser?.email ?? null,
    isUnread: r.createdAt.getTime() > lastSeen.getTime() && !readSet.has(r.id),
  }));

  return NextResponse.json({
    unreadCount,
    lastSeen: lastSeen.toISOString(),
    items,
  });
}

export async function POST(req: Request) {
  const authUser = await requireUser();
  requireRole(authUser, [Role.SUPER_ADMIN]);

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // no body
  }

  const id =
    body && typeof body === "object" && "id" in body && typeof (body as any).id === "string"
      ? ((body as any).id as string)
      : null;

  // Mark a single notification read
  if (id) {
    await prisma.notificationRead.upsert({
      where: { userId_auditLogId: { userId: authUser.id, auditLogId: id } },
      create: { userId: authUser.id, auditLogId: id },
      update: { readAt: new Date() },
    });

    return NextResponse.json({ ok: true, mode: "one", id });
  }

  // Default: mark all read (keep existing behavior)
  const now = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: authUser.id },
      data: { notificationsLastSeenAt: now },
    }),
    prisma.notificationRead.deleteMany({ where: { userId: authUser.id } }),
  ]);

  return NextResponse.json({ ok: true, mode: "all", notificationsLastSeenAt: now.toISOString() });
}

