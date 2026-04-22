import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { hashToken, randomToken } from "./crypto";
import type { Role, User } from "@prisma/client";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const COOKIE_NAME = process.env.AUTH_COOKIE_NAME || "lms_session";
const SESSION_HOURS = 8;

export type AuthUser = {
  id: string;
  username: string;
  email: User["email"];
  name: string;
  role: Role | "COLLECTOR";
  employeeId: string | null;
};

function cookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true as const,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
  };
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const tokenHash = hashToken(token);

  // Set session expiration to 8 hours
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  const request = await tryGetAuditRequestContext();

  await prisma.$transaction(async (tx) => {
    await tx.authSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });
    await createAuditLog(tx, {
      actorType: "USER",
      actorUserId: userId,
      action: "LOGIN",
      entityType: "AuthSession",
      entityId: tokenHash.slice(0, 16),
      metadata: { expiresAt: expiresAt.toISOString() },
      request,
    });
  });

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    ...cookieOptions(),
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) {
    const tokenHash = hashToken(token);
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findUnique({ where: { tokenHash } });
      await tx.authSession.deleteMany({ where: { tokenHash } });
      if (session) {
        await createAuditLog(tx, {
          actorType: "USER",
          actorUserId: session.userId,
          action: "LOGOUT",
          entityType: "AuthSession",
          entityId: tokenHash.slice(0, 16),
          request,
        });
      }
    });
  }
  jar.set(COOKIE_NAME, "", { ...cookieOptions(), expires: new Date(0) });
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await prisma.authSession.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.delete({ where: { id: session.id } });
    return null;
  }
  if (!session.user.isActive) {
    await prisma.authSession.delete({ where: { id: session.id } });
    return null;
  }

  return {
    id: session.user.id,
    username: session.user.username,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as AuthUser["role"],
    employeeId: (session.user as any).employeeId ?? null,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export function requireRole(user: AuthUser, roles: readonly (Role | "COLLECTOR")[]) {
  if (!roles.includes(user.role as Role | "COLLECTOR")) {
    notFound();
  }
}
