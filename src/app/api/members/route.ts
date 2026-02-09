import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

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
});

export async function GET(req: NextRequest) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const groupId = (searchParams.get("groupId") ?? "").trim() || undefined;
  const page = parseInt(searchParams.get("page") ?? "1") || 1;
  const limit = parseInt(searchParams.get("limit") ?? "50") || 50;
  const sort = (searchParams.get("sort") === "desc" ? "desc" : "asc") as "asc" | "desc";
  const days = parseInt(searchParams.get("days") ?? "0") || 0;

  const where: any = {};
  if (groupId) where.groupId = groupId;
  if (days > 0) where.daysCount = { gte: days };
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { phoneNumber: { contains: q, mode: "insensitive" } },
      { group: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [members, total] = await Promise.all([
    prisma.member.findMany({
      where,
      include: {
        group: { select: { id: true, name: true } },
        _count: {
          select: {
            balanceAdjustments: true,
            savingsAdjustments: true,
          },
        },
        cycles: {
            orderBy: { cycleNumber: "desc" },
            take: 1
        }
      },
      orderBy: { lastName: sort },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.member.count({ where }),
  ]);

  const serializedMembers = members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    age: m.age,
    address: m.address,
    phoneNumber: m.phoneNumber,
    balance: Number(m.balance),
    savings: Number(m.savings),
    createdAt: m.createdAt.toISOString(),
    groupId: m.groupId,
    group: m.group ? { id: m.group.id, name: m.group.name } : null,
    daysCount: m.daysCount,
    _count: {
      balanceAdjustments: m._count.balanceAdjustments,
      savingsAdjustments: m._count.savingsAdjustments,
    },
    latestCycle: m.cycles[0] ? {
        cycleNumber: m.cycles[0].cycleNumber,
        startDate: m.cycles[0].startDate ? m.cycles[0].startDate.toISOString() : "",
        endDate: m.cycles[0].endDate ? m.cycles[0].endDate.toISOString() : undefined
    } : null,
  }));

  return NextResponse.json({
    items: serializedMembers,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
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
