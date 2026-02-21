import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const CreateUserSchema = z.object({
  username: z.string().min(3).max(50),
  email: z.string().email().optional().or(z.literal("")),
  name: z.string().min(1).max(100),
  role: z.enum(["SUPER_ADMIN", "ENCODER", "VIEWER"]),
  password: z.string().min(6).max(200),
});

export async function GET(req: NextRequest) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  const searchParams = req.nextUrl.searchParams;
  const q = (searchParams.get("q") ?? "").trim();

  const where: any = {
    username: { not: "administrator" },
  };

  if (q.length > 0) {
    where.OR = [
      { username: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return NextResponse.json(users);
}

export async function POST(req: NextRequest) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const body = await req.json();
  const parsed = CreateUserSchema.safeParse({
    username: String(body.username || "").trim().toLowerCase(),
    email: String(body.email || "").trim().toLowerCase() || undefined,
    name: String(body.name || "").trim(),
    role: String(body.role || ""),
    password: String(body.password || ""),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const request = await tryGetAuditRequestContext();

  try {
    let createdUser;
    await prisma.$transaction(async (tx) => {
      createdUser = await tx.user.create({
        data: {
          username: parsed.data.username,
          email: parsed.data.email || null,
          name: parsed.data.name,
          role: parsed.data.role,
          passwordHash: await hashPassword(parsed.data.password),
          isActive: true,
        },
        select: { id: true, username: true, name: true, role: true, isActive: true, createdAt: true },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "USER_CREATE",
        entityType: "User",
        entityId: createdUser.id,
        metadata: { username: createdUser.username, name: createdUser.name, role: createdUser.role },
        request,
      });
    });

    return NextResponse.json(createdUser, { status: 201 });
  } catch (error: any) {
    console.error("Error creating user:", error);
    // Handle unique constraint violation specifically if possible
    if (error.code === 'P2002') {
         return NextResponse.json({ error: "Username or email already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create user" }, { status: 500 });
  }
}
