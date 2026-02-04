import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const UpdateAccountSchema = z.object({
  name: z.string().min(1).max(100),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

export async function PUT(req: NextRequest) {
  const user = await requireUser();
  const body = await req.json();

  const parsed = UpdateAccountSchema.safeParse({
    name: String(body.name || "").trim(),
    currentPassword: String(body.currentPassword || "").trim() || undefined,
    newPassword: String(body.newPassword || "").trim() || undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { name, currentPassword, newPassword } = parsed.data;

  if ((currentPassword && !newPassword) || (!currentPassword && newPassword)) {
    return NextResponse.json(
      { error: "Both current and new password are required to change password" },
      { status: 400 }
    );
  }

  const request = await tryGetAuditRequestContext();

  try {
    if (currentPassword && newPassword) {
      const existing = await prisma.user.findUnique({ where: { id: user.id } });
      if (!existing) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      const ok = await verifyPassword(currentPassword, existing.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "Current password is incorrect" },
          { status: 400 }
        );
      }

      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: {
            name,
            passwordHash: await hashPassword(newPassword),
          },
        });
        await createAuditLog(tx, {
          actorUserId: user.id,
          action: "ACCOUNT_UPDATE",
          entityType: "User",
          entityId: user.id,
          metadata: { name, passwordChanged: true },
          request,
        });
      });
    } else {
      await prisma.$transaction(async (tx) => {
        await tx.user.update({
          where: { id: user.id },
          data: { name },
        });
        await createAuditLog(tx, {
          actorUserId: user.id,
          action: "ACCOUNT_UPDATE",
          entityType: "User",
          entityId: user.id,
          metadata: { name, passwordChanged: false },
          request,
        });
      });
    }

    return NextResponse.json({ success: true, name });
  } catch (error) {
    console.error("Error updating account:", error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}
