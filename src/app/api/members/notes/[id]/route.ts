import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, requireRole } from "@/lib/auth/session";
import { Role } from "@prisma/client";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const { id } = await params;

  try {
    await (prisma as any).memberNote.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting member note:", error);
    return NextResponse.json(
      { error: "Failed to delete note" },
      { status: 500 }
    );
  }
}
