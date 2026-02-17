import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { getManilaBusinessDate } from "@/lib/date";

export async function POST(req: NextRequest) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const body = await req.json();
  const memberId = String(body.memberId || "").trim();
  const amount = parseFloat(String(body.amount || "").trim());

  if (!memberId || !amount || isNaN(amount) || amount <= 0) {
    return NextResponse.json({ error: "Invalid memberId or amount" }, { status: 400 });
  }

  const request = await tryGetAuditRequestContext();
  const releaseDate = getManilaBusinessDate();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { id: true },
      });
      if (!member) {
        throw new Error("Member not found");
      }

      const activeRelease = await (tx as any).activeRelease.create({
        data: {
          memberId: member.id,
          amount,
          releaseDate,
        },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "ACTIVE_RELEASE_CREATE",
        entityType: "Member",
        entityId: member.id,
        metadata: {
          amount,
          releaseDate: releaseDate.toISOString(),
          source: "member_detail",
        },
        request,
      });

      return activeRelease;
    });

    return NextResponse.json(
      {
        id: created.id,
        memberId: created.memberId,
        amount: Number(created.amount),
        releaseDate: created.releaseDate.toISOString(),
        createdAt: created.createdAt.toISOString(),
      },
      { status: 201 },
    );
  } catch (error: any) {
    if (error.message === "Member not found") {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    console.error("Error creating active release:", error);
    return NextResponse.json({ error: "Failed to create active release" }, { status: 500 });
  }
}
