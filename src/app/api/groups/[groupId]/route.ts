import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  collectionOfficerId: z.string().uuid().optional().nullable(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const { groupId } = await params;

  try {
    const body = await req.json();
    const parsed = UpdateGroupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const request = await tryGetAuditRequestContext();
    let group;

    await prisma.$transaction(async (tx) => {
      const existingGroup = await tx.group.findUnique({
        where: { id: groupId },
      });

      if (!existingGroup) {
        throw new Error("Group not found");
      }

      group = await tx.group.update({
        where: { id: groupId },
        data: {
          name: parsed.data.name,
          description: parsed.data.description,
          collectionOfficerId: parsed.data.collectionOfficerId ?? null,
        },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "GROUP_UPDATE", // Assuming this action type exists or matches convention
        entityType: "Group",
        entityId: group.id,
        metadata: {
          old: {
            name: existingGroup.name,
            description: existingGroup.description,
            collectionOfficerId: existingGroup.collectionOfficerId,
          },
          new: {
            name: group.name,
            description: group.description,
            collectionOfficerId: group.collectionOfficerId,
          },
        },
        request,
      });
    });

    return NextResponse.json(group);
  } catch (error: any) {
    if (error.message === "Group not found") {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }
    console.error("Error updating group:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]); // Only SUPER_ADMIN can delete
  const { groupId } = await params;

  try {
    const request = await tryGetAuditRequestContext();

    await prisma.$transaction(async (tx) => {
      const group = await tx.group.findUnique({
        where: { id: groupId },
        include: { _count: { select: { members: true } } },
      });
      if (!group) return;

      await tx.group.delete({ where: { id: groupId } });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "GROUP_DELETE",
        entityType: "Group",
        entityId: groupId,
        metadata: {
          name: group.name,
          description: group.description ?? null,
          membersCount: group._count.members,
          membersBehavior: "SET_NULL",
        },
        request,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting group:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
