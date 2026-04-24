import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCollectorScopedGroupIds } from "@/lib/auth/access";
import { hasRole, requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { getManilaBusinessDate } from "@/lib/date";

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
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  cycles: z.array(z.object({
    id: z.string().optional(),
    cycleNumber: z.coerce.number().int().min(1),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })).optional(),
  activeReleaseAmount: z.coerce.number().optional(),
});

export async function GET(req: NextRequest, { params }: { params: Promise<{ memberId: string }> }) {
  const user = await requireUser();
  requireRole(user, ["SUPER_ADMIN", "ENCODER", "VIEWER", "COLLECTOR"] as Role[]);
  const { memberId } = await params;
  const collectorGroupIds = await getCollectorScopedGroupIds(user);
  
  try {
    const member = await (prisma as any).member.findUnique({
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
            orderBy: [{ startDate: "asc" }, { cycleNumber: "asc" }],
        },
        activeReleases: {
          orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
        },
        processingFees: {
          orderBy: { createdAt: "desc" },
          include: { encodedBy: { select: { name: true } } }
        },
        passbookFees: {
          orderBy: { createdAt: "desc" },
          include: { encodedBy: { select: { name: true } } }
        },
        membershipFees: {
          orderBy: { createdAt: "desc" },
          include: { encodedBy: { select: { name: true } } }
        },
      }
    });

    if (!member) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    if (
      collectorGroupIds &&
      (!member.groupId || !collectorGroupIds.includes(member.groupId))
    ) {
      return NextResponse.json({ error: "Member not found" }, { status: 404 });
    }

    const serializedMember = {
      ...member,
      balance: Number((member as any).balance),
      savings: Number((member as any).savings),
      createdAt: (member as any).createdAt instanceof Date ? (member as any).createdAt.toISOString() : (member as any).createdAt,
      balanceAdjustments: (member as any).balanceAdjustments.map((adj: any) => ({
        ...adj,
        amount: Number(adj.amount),
        balanceBefore: Number(adj.balanceBefore),
        balanceAfter: Number(adj.balanceAfter),
        createdAt: adj.createdAt instanceof Date ? adj.createdAt.toISOString() : adj.createdAt,
      })),
      savingsAdjustments: (member as any).savingsAdjustments.map((adj: any) => ({
        ...adj,
        amount: Number(adj.amount),
        savingsBefore: Number(adj.savingsBefore),
        savingsAfter: Number(adj.savingsAfter),
        createdAt: adj.createdAt instanceof Date ? adj.createdAt.toISOString() : adj.createdAt,
      })),
      activeReleases: (member as any).activeReleases.map((r: any) => ({
        ...r,
        amount: Number(r.amount),
        releaseDate: r.releaseDate instanceof Date ? r.releaseDate.toISOString() : r.releaseDate,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      })),
      processingFees: (member as any).processingFees.map((pf: any) => ({
        ...pf,
        amount: Number(pf.amount),
        createdAt: pf.createdAt instanceof Date ? pf.createdAt.toISOString() : pf.createdAt,
      })),
      passbookFees: (member as any).passbookFees.map((pf: any) => ({
        ...pf,
        amount: Number(pf.amount),
        createdAt: pf.createdAt instanceof Date ? pf.createdAt.toISOString() : pf.createdAt,
      })),
      membershipFees: (member as any).membershipFees.map((pf: any) => ({
        ...pf,
        amount: Number(pf.amount),
        createdAt: pf.createdAt instanceof Date ? pf.createdAt.toISOString() : pf.createdAt,
      })),
      latestCycle: (member as any).cycles[0] || null,
      cycles: (member as any).cycles.map((c: any) => ({
        id: c.id,
        cycleNumber: c.cycleNumber,
        startDate: c.startDate instanceof Date ? c.startDate.toISOString() : (c.startDate || null),
        endDate: c.endDate instanceof Date ? c.endDate.toISOString() : (c.endDate || null),
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
  if (!hasRole(user, [Role.SUPER_ADMIN, Role.ENCODER])) {
    return NextResponse.json(
      { error: "Your role is not allowed to do this action" },
      { status: 403 },
    );
  }
  const { memberId } = await params;

  const body = await req.json();
  const parsed = UpdateMemberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const request = await tryGetAuditRequestContext();
  const releaseDate = getManilaBusinessDate();

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
          status: parsed.data.status as "ACTIVE" | "INACTIVE" | undefined,
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

      if (parsed.data.cycles) {
        const existingCycles = await tx.memberCycle.findMany({
          where: { memberId },
        });

        // Use Set of IDs for deletion check instead of cycle numbers
        const incomingCycleIds = new Set(
            parsed.data.cycles
                .map((c) => c.id)
                .filter((id): id is string => !!id)
        );

        const cyclesToDelete = existingCycles.filter(
          (existingCycle) => !incomingCycleIds.has(existingCycle.id),
        );

        if (cyclesToDelete.length > 0) {
          await tx.memberCycle.deleteMany({
            where: {
              id: { in: cyclesToDelete.map((c) => c.id) },
            },
          });
        }

        await Promise.all(
          parsed.data.cycles.map(async (cycle) => {
            // If cycle has ID and exists in DB, update it
            if (cycle.id) {
              const existingCycle = existingCycles.find((c) => c.id === cycle.id);
              if (existingCycle) {
                await tx.memberCycle.update({
                  where: { id: cycle.id },
                  data: {
                    cycleNumber: cycle.cycleNumber, // Allow updating cycle number too
                    startDate: cycle.startDate ? new Date(cycle.startDate) : null,
                    endDate: cycle.endDate ? new Date(cycle.endDate) : null,
                  },
                });
              }
            } else {
              // No ID means new cycle
              await tx.memberCycle.create({
                data: {
                  memberId,
                  cycleNumber: cycle.cycleNumber,
                  startDate: cycle.startDate ? new Date(cycle.startDate) : null,
                  endDate: cycle.endDate ? new Date(cycle.endDate) : null,
                },
              });
            }
          })
        );
      }

      if (parsed.data.activeReleaseAmount && parsed.data.activeReleaseAmount > 0) {
        await tx.activeRelease.create({
          data: {
            memberId,
            amount: parsed.data.activeReleaseAmount,
            releaseDate,
          },
        });

        await createAuditLog(tx, {
          actorUserId: user.id,
          action: "ACTIVE_RELEASE_CREATE",
          entityType: "Member",
          entityId: memberId,
          metadata: {
            amount: parsed.data.activeReleaseAmount,
            releaseDate: releaseDate.toISOString(),
            source: "member_update",
          },
          request,
        });
      }

      return updated;
    }, { timeout: 20000 });

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
  if (!hasRole(user, [Role.SUPER_ADMIN])) {
    return NextResponse.json(
      { error: "Your role is not allowed to do this action" },
      { status: 403 },
    );
  }
  const { memberId } = await params;

  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, groupId: true },
      });
      if (!member) return;

      await tx.member.update({
        where: { id: memberId },
        data: { status: "INACTIVE" },
      });

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
