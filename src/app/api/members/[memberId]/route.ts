import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const UpdateMemberSchema = z.object({
  groupId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  age: z.coerce.number().int().min(0).max(150).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
  balance: z.coerce.number().optional(),
  savings: z.coerce.number().optional(),
  daysCount: z.coerce.number().int().min(0).optional(),
  cycles: z.array(z.object({
    cycleNumber: z.coerce.number().int().min(1),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })).optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const { memberId } = await params;
  
  try {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      include: {
        group: { select: { id: true, name: true } },
        balanceAdjustments: {
            orderBy: { createdAt: "desc" },
            include: { encodedBy: { select: { name: true } } }
        },
        savingsAdjustments: {
            orderBy: { createdAt: "desc" },
            include: { encodedBy: { select: { name: true } } }
        },
        cycles: {
            orderBy: { cycleNumber: "desc" },
        }
      }
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const serializedMember = {
      ...member,
      balance: Number(member.balance),
      savings: Number(member.savings),
      createdAt: member.createdAt.toISOString(),
      balanceAdjustments: member.balanceAdjustments.map(adj => ({
        ...adj,
        amount: Number(adj.amount),
        balanceBefore: Number(adj.balanceBefore),
        balanceAfter: Number(adj.balanceAfter),
        createdAt: adj.createdAt.toISOString(),
      })),
      savingsAdjustments: member.savingsAdjustments.map(adj => ({
        ...adj,
        amount: Number(adj.amount),
        savingsBefore: Number(adj.savingsBefore),
        savingsAfter: Number(adj.savingsAfter),
        createdAt: adj.createdAt.toISOString(),
      })),
      latestCycle: member.cycles[0] || null,
      cycles: member.cycles.map(c => ({
        cycleNumber: c.cycleNumber,
        startDate: c.startDate ? c.startDate.toISOString() : null,
        endDate: c.endDate ? c.endDate.toISOString() : null,
      })),
    };

    return NextResponse.json(serializedMember);
  } catch (error) {
    console.error("Error fetching member:", error);
    return NextResponse.json({ error: "Failed to fetch member details" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);
  const { memberId } = await params;

  const body = await req.json();
  const parsed = UpdateMemberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const request = await tryGetAuditRequestContext();

  try {
    const updatedMember = await prisma.$transaction(async (tx) => {
      const existingMember = await tx.member.findUnique({ where: { id: memberId } });
      if (!existingMember) {
        throw new Error("Member not found");
      }

      const updated = await tx.member.update({
        where: { id: memberId },
        data: {
          groupId: parsed.data.groupId,
          firstName: parsed.data.firstName ? parsed.data.firstName.toUpperCase() : undefined,
          lastName: parsed.data.lastName ? parsed.data.lastName.toUpperCase() : undefined,
          age: parsed.data.age,
          address: parsed.data.address,
          phoneNumber: parsed.data.phoneNumber,
          balance: parsed.data.balance !== undefined ? new Prisma.Decimal(parsed.data.balance.toFixed(2)) : undefined,
          savings: parsed.data.savings !== undefined ? new Prisma.Decimal(parsed.data.savings.toFixed(2)) : undefined,
          daysCount: parsed.data.daysCount,
        },
        include: {
            group: { select: { id: true, name: true } }
        }
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "MEMBER_UPDATE",
        entityType: "Member",
        entityId: memberId,
        metadata: {
          ...parsed.data,
          previousState: {
             firstName: existingMember.firstName,
             lastName: existingMember.lastName,
             groupId: existingMember.groupId,
             balance: Number(existingMember.balance),
             savings: Number(existingMember.savings),
             daysCount: existingMember.daysCount,
          }
        },
        request,
      });

      if (parsed.data.cycles && parsed.data.cycles.length > 0) {
        for (const cycle of parsed.data.cycles) {
          const existingCycle = await tx.memberCycle.findFirst({
            where: { memberId, cycleNumber: cycle.cycleNumber },
          });

          if (existingCycle) {
            await tx.memberCycle.update({
              where: { id: existingCycle.id },
              data: { 
                startDate: cycle.startDate ? new Date(cycle.startDate) : null,
                endDate: cycle.endDate ? new Date(cycle.endDate) : null,
              },
            });
          } else {
            await tx.memberCycle.create({
              data: {
                memberId,
                cycleNumber: cycle.cycleNumber,
                startDate: cycle.startDate ? new Date(cycle.startDate) : null,
                endDate: cycle.endDate ? new Date(cycle.endDate) : null,
              },
            });
          }
        }
      }

      return updated;
    });

    const serializedMember = updatedMember ? {
        ...updatedMember,
        balance: Number(updatedMember.balance),
        savings: Number(updatedMember.savings),
        createdAt: updatedMember.createdAt.toISOString(),
    } : null;

    return NextResponse.json(serializedMember);
  } catch (error: any) {
    if (error.message === "Member not found") {
        return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }
    console.error("Error updating member:", error);
    return NextResponse.json({ error: "Failed to update member" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);
  const { memberId } = await params;

  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, groupId: true },
      });
      if (!member) return;

      await tx.member.delete({ where: { id: memberId } });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "MEMBER_DELETE",
        entityType: "Member",
        entityId: member.id,
        metadata: { firstName: member.firstName, lastName: member.lastName, groupId: member.groupId },
        request,
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting member:", error);
    return NextResponse.json({ error: "Failed to delete member" }, { status: 500 });
  }
}
