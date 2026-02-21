import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "@/lib/auth/password";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const UpdateUserSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "ENCODER", "VIEWER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(6).max(200).optional(),
  username: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional().or(z.literal("")),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);
  const { id } = await params;

  const body = await req.json();
  const parsed = UpdateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { role, isActive, password, username, name, email } = parsed.data;

  // Prevent self-lockout
  if (isActive === false && id === actor.id) {
    return NextResponse.json(
      { error: "You cannot deactivate your own account" },
      { status: 403 }
    );
  }

  const request = await tryGetAuditRequestContext();

  try {
    const updatedUser = await prisma.$transaction(async (tx) => {
      const dataToUpdate: any = {};
      if (role) dataToUpdate.role = role;
      if (isActive !== undefined) dataToUpdate.isActive = isActive;
      if (password) dataToUpdate.passwordHash = await hashPassword(password);
      if (username) dataToUpdate.username = username.trim().toLowerCase();
      if (name) dataToUpdate.name = name.trim();
      if (email !== undefined) dataToUpdate.email = email.trim().toLowerCase() || null;

      const user = await tx.user.update({
        where: { id },
        data: dataToUpdate,
        select: { id: true, username: true, name: true, role: true, isActive: true, email: true, createdAt: true },
      });

      // Handle side effects
      if (isActive === false || password) {
        await tx.authSession.deleteMany({ where: { userId: id } });
      }

      // Audit logs
      if (role || isActive !== undefined || password || username || name || email !== undefined) {
         const changes: any = {};
         if (role) changes.role = role;
         if (isActive !== undefined) changes.isActive = isActive;
         if (username) changes.username = username;
         if (name) changes.name = name;
         if (email !== undefined) changes.email = email;
         
         await createAuditLog(tx, {
          actorUserId: actor.id,
          action: "USER_UPDATE",
          entityType: "User",
          entityId: user.id,
          metadata: changes,
          request,
        });
      }

      return user;
    });

    const serializedUser = {
        ...updatedUser,
        createdAt: updatedUser.createdAt.toISOString(),
    };

    return NextResponse.json(serializedUser);
  } catch (error: any) {
    console.error("Error updating user:", error);
    return NextResponse.json({ error: "Failed to update user" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
    const actor = await requireUser();
    requireRole(actor, [Role.SUPER_ADMIN]);
    const { id } = await params;

    if (id === actor.id) {
        return NextResponse.json(
            { error: "You cannot delete your own account" },
            { status: 403 }
        );
    }

    const request = await tryGetAuditRequestContext();

    try {
        await prisma.$transaction(async (tx) => {
            const user = await tx.user.findUnique({ where: { id } });
            if (!user) return; // Already deleted or doesn't exist

            await tx.authSession.deleteMany({ where: { userId: id } });
            // Note: If there are other foreign key constraints (like groups created by user), 
            // those might need handling or cascade delete. 
            // Assuming soft delete via deactivation is preferred usually, but if hard delete is requested:
            
            await tx.user.delete({ where: { id } });

            await createAuditLog(tx, {
                actorUserId: actor.id,
                action: "USER_DELETE", // Ensure this action type exists or use a generic one
                entityType: "User",
                entityId: id,
                metadata: { username: user.username },
                request,
            });
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting user:", error);
        if (error.code === 'P2003') { // Foreign key constraint violation
             return NextResponse.json({ error: "Cannot delete user because they have associated records (e.g. created groups)" }, { status: 409 });
        }
        return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
    }
}
