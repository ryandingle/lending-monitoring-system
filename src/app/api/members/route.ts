import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { BalanceUpdateType, Prisma, Role, SavingsUpdateType } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { getManilaBusinessDate, getManilaDateRange, formatDateYMD } from "@/lib/date";

const CreateMemberSchema = z.object({
  groupId: z.string().uuid(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  age: z.coerce.number().int().min(0).max(150).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
  balance: z.coerce.number(),
  savings: z.coerce.number().default(0),
  daysCount: z.coerce.number().int().min(0).default(0),
  cycles: z.array(z.object({
    cycleNumber: z.coerce.number().int().min(1),
    startDate: z.string().optional(),
    endDate: z.string().optional()
  })).optional(),
  activeReleaseAmount: z.coerce.number().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER, Role.VIEWER]);

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get("q") ?? "").trim();
    const groupId = (searchParams.get("groupId") ?? "").trim() || undefined;
    const page = parseInt(searchParams.get("page") ?? "1") || 1;
    const limit = parseInt(searchParams.get("limit") ?? "50") || 50;
    const sort = (searchParams.get("sort") === "desc" ? "desc" : "asc") as "asc" | "desc";
    const days = parseInt(searchParams.get("days") ?? "0") || 0;
    const status = searchParams.get("status");
    const newMember = searchParams.get("newMember") === "true";

    const where: any = {};
    if (groupId) where.groupId = groupId;
    if (days > 0) where.daysCount = { gte: days };
    if (status && status !== "ALL") where.status = status;

    if (newMember) {
      const matchingMembers = await prisma.$queryRaw<{ id: string }[]>`
        SELECT m.id 
        FROM members m
        JOIN (
          SELECT DISTINCT ON ("memberId") "memberId", amount
          FROM active_releases
          ORDER BY "memberId", "releaseDate" DESC, "createdAt" DESC
        ) ar ON m.id = ar."memberId"
        WHERE m.balance > 0 AND m.balance = ar.amount
      `;
      const ids = matchingMembers.map(m => m.id);
      where.id = { in: ids };
    }

    if (q) {
      where.OR = [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q, mode: "insensitive" } },
        { group: { name: { contains: q, mode: "insensitive" } } },
      ];
    }

    const businessDate = getManilaBusinessDate();
    const todayStr = formatDateYMD(businessDate);
    const todayRange = getManilaDateRange(todayStr, todayStr);

    const [members, total] = await Promise.all([
      (prisma as any).member.findMany({
        where,
        include: {
          group: { select: { id: true, name: true } },
          _count: {
            select: {
              balanceAdjustments: true,
              savingsAdjustments: true,
              notes: true,
            },
          },
          balanceAdjustments: {
            where: {
              type: BalanceUpdateType.DEDUCT,
              createdAt: {
                gte: todayRange.from,
                lte: todayRange.to,
              },
            },
            select: { amount: true },
          },
          savingsAdjustments: {
            where: {
              type: SavingsUpdateType.INCREASE,
              createdAt: {
                gte: todayRange.from,
                lte: todayRange.to,
              },
            },
            select: { amount: true },
          },
          cycles: {
            orderBy: [{ startDate: "desc" }, { cycleNumber: "desc" }],
            take: 1,
          },
          activeReleases: {
            orderBy: [{ releaseDate: "desc" }, { createdAt: "desc" }],
            take: 1,
          },
          notes: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
          processingFees: {
            where: {
              createdAt: {
                gte: todayRange.from,
                lte: todayRange.to,
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
        orderBy: { lastName: sort },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (prisma as any).member.count({ where }),
    ]);

    const serializedMembers = (members as any[]).map((m: any) => {
      const todayPayment = Array.isArray(m.balanceAdjustments)
        ? m.balanceAdjustments.reduce(
            (sum: number, adj: any) => sum + (Number(adj.amount) || 0),
            0,
          )
        : 0;

      const todaySavings = Array.isArray(m.savingsAdjustments)
        ? m.savingsAdjustments.reduce(
            (sum: number, adj: any) => sum + (Number(adj.amount) || 0),
            0,
          )
        : 0;

      return {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        age: m.age,
        address: m.address,
        phoneNumber: m.phoneNumber,
        balance: (Number(m.balance) || 0),
        savings: (Number(m.savings) || 0),
        createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : (m.createdAt || new Date().toISOString()),
        groupId: m.groupId,
        group: m.group ? { id: m.group.id, name: m.group.name } : null,
        daysCount: m.daysCount ?? 0,
        todayPayment,
        todaySavings,
        _count: {
          balanceAdjustments: m._count?.balanceAdjustments ?? 0,
          savingsAdjustments: m._count?.savingsAdjustments ?? 0,
          notes: m._count?.notes ?? 0,
        },
        latestCycle: Array.isArray(m.cycles) && m.cycles.length > 0
          ? {
              cycleNumber: m.cycles[0].cycleNumber,
              startDate: m.cycles[0].startDate instanceof Date ? m.cycles[0].startDate.toISOString() : (m.cycles[0].startDate || ""),
              endDate: m.cycles[0].endDate instanceof Date ? m.cycles[0].endDate.toISOString() : (m.cycles[0].endDate || undefined),
            }
          : null,
        latestActiveReleaseAmount:
          Array.isArray(m.activeReleases) && m.activeReleases.length > 0 && m.activeReleases[0] != null 
            ? (Number(m.activeReleases[0].amount) || 0) 
            : null,
        latestNote: Array.isArray(m.notes) && m.notes.length > 0 ? m.notes[0].content : "",
        latestTodayProcessingFee:
          Array.isArray(m.processingFees) && m.processingFees.length > 0 && m.processingFees[0] != null
            ? (Number(m.processingFees[0].amount) || 0)
            : null,
      };
    });

    return NextResponse.json({
      items: serializedMembers,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching members:", error);
    return NextResponse.json({ error: "Failed to fetch members" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  const body = await req.json();
  const parsed = CreateMemberSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error.format() }, { status: 400 });
  }

  const today = new Date();
  const releaseDate = getManilaBusinessDate();
  const request = await tryGetAuditRequestContext();

  try {
    const member = await prisma.$transaction(async (tx) => {
      const newMember = await tx.member.create({
        data: {
          groupId: parsed.data.groupId,
          firstName: parsed.data.firstName.toUpperCase(),
          lastName: parsed.data.lastName.toUpperCase(),
          age: parsed.data.age,
          address: parsed.data.address,
          phoneNumber: parsed.data.phoneNumber,
          balance: new Prisma.Decimal(parsed.data.balance.toFixed(2)),
          savings: new Prisma.Decimal(parsed.data.savings.toFixed(2)),
          daysCount: parsed.data.daysCount,
          savingsLastAccruedAt: today,
        },
        include: {
            group: { select: { id: true, name: true } }
        }
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "MEMBER_CREATE",
        entityType: "Member",
        entityId: newMember.id,
        metadata: {
          groupId: parsed.data.groupId,
          firstName: newMember.firstName,
          lastName: newMember.lastName,
          balance: newMember.balance.toFixed(2),
          savings: newMember.savings.toFixed(2),
          daysCount: newMember.daysCount,
          phoneNumber: newMember.phoneNumber ?? null,
        },
        request,
      });

      if (parsed.data.cycles && parsed.data.cycles.length > 0) {
        for (const cycle of parsed.data.cycles) {
          await tx.memberCycle.create({
            data: {
              memberId: newMember.id,
              cycleNumber: cycle.cycleNumber,
              startDate: cycle.startDate ? new Date(cycle.startDate) : null,
              endDate: cycle.endDate ? new Date(cycle.endDate) : null,
            },
          });
        }
      }

      if (parsed.data.activeReleaseAmount && parsed.data.activeReleaseAmount > 0) {
        await tx.activeRelease.create({
          data: {
            memberId: newMember.id,
            amount: parsed.data.activeReleaseAmount,
            releaseDate,
          },
        });

        await createAuditLog(tx, {
          actorUserId: user.id,
          action: "ACTIVE_RELEASE_CREATE",
          entityType: "Member",
          entityId: newMember.id,
          metadata: {
            amount: parsed.data.activeReleaseAmount,
            releaseDate: releaseDate.toISOString(),
            source: "member_create",
          },
          request,
        });
      }

      return newMember;
    });

    const serializedMember = {
        ...member,
        balance: Number(member.balance),
        savings: Number(member.savings),
        createdAt: member.createdAt.toISOString(),
    };

    return NextResponse.json(serializedMember, { status: 201 });
  } catch (error: any) {
    console.error("Error creating member:", error);
    return NextResponse.json({ error: "Failed to create member" }, { status: 500 });
  }
}
