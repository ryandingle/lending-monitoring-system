import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const CreateMemberSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  age: z.coerce.number().int().min(0).max(150).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
  balance: z.coerce.number(),
  savings: z.coerce.number().default(0),
  daysCount: z.coerce.number().int().min(0).default(0),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const { groupId } = await params;

  try {
    const body = await req.json();
    const parsed = CreateMemberSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const request = await tryGetAuditRequestContext();
    const member = await prisma.$transaction(async (tx) => {
      const today = new Date();
      const newMember = await tx.member.create({
        data: {
          groupId,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          age: parsed.data.age,
          address: parsed.data.address,
          phoneNumber: parsed.data.phoneNumber,
          balance: new Prisma.Decimal(parsed.data.balance.toFixed(2)),
          savings: new Prisma.Decimal(parsed.data.savings.toFixed(2)),
          daysCount: parsed.data.daysCount,
          savingsLastAccruedAt: today,
        },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "MEMBER_CREATE",
        entityType: "Member",
        entityId: newMember.id,
        metadata: {
          groupId,
          firstName: newMember.firstName,
          lastName: newMember.lastName,
          balance: newMember.balance.toFixed(2),
          savings: newMember.savings.toFixed(2),
          daysCount: newMember.daysCount,
          phoneNumber: newMember.phoneNumber ?? null,
        },
        request,
      });

      return newMember;
    });

    if (!member) throw new Error("Failed to create member");

    // Serialize Decimal to number for JSON response
    const serializedMember = {
      ...member,
      balance: Number(member.balance),
      savings: Number(member.savings),
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
      savingsLastAccruedAt: member.savingsLastAccruedAt?.toISOString(),
    };

    return NextResponse.json(serializedMember, { status: 201 });
  } catch (error) {
    console.error("Error creating member:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
