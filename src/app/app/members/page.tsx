import { prisma } from "@/lib/db";
import { getCollectorScopedGroupIds } from "@/lib/auth/access";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { MembersClient } from "./members-client";
import { getManilaBusinessDate, getManilaDateRange, formatDateYMD } from "@/lib/date";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    groupId?: string;
    page?: string;
    limit?: string;
    sort?: string;
    days?: string;
    status?: string;
  }>;
}) {
  const user = await requireUser();
  requireRole(user, ["SUPER_ADMIN", "ENCODER", "VIEWER", "COLLECTOR"] as Role[]);
  const sp = await searchParams;
  const collectorGroupIds = await getCollectorScopedGroupIds(user);

  const businessDate = getManilaBusinessDate();
  const todayStr = formatDateYMD(businessDate);
  const todayRange = getManilaDateRange(todayStr, todayStr);

  const q = (sp.q ?? "").trim();
  const groupId = (sp.groupId ?? "").trim() || undefined;
  const page = parseInt(sp.page ?? "1") || 1;
  const limit = parseInt(sp.limit ?? "50") || 50;
  const sort = (sp.sort === "desc" ? "desc" : "asc") as "asc" | "desc";
  // Default to 0 days (All Days) if not specified
  const days = sp.days !== undefined ? (parseInt(sp.days) || 0) : 0;
  const status = (sp.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE" | "ALL";

  const where: any = {};
  if (collectorGroupIds) {
    if (groupId) {
      if (collectorGroupIds.includes(groupId)) {
        where.groupId = groupId;
      } else {
        where.id = { in: [] };
      }
    } else {
      where.groupId = { in: collectorGroupIds };
    }
  } else if (groupId) {
    where.groupId = groupId;
  }
  if (status !== "ALL") {
    where.status = status;
  }
  if (days > 0) {
    where.daysCount = { gte: days };
  }
  
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { phoneNumber: { contains: q, mode: "insensitive" } },
      { group: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  // Fetch groups for dropdown
  const groups = await prisma.group.findMany({
    where: collectorGroupIds ? { id: { in: collectorGroupIds } } : undefined,
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  // Fetch initial members
  const [members, totalCount] = await Promise.all([
    prisma.member.findMany({
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
          type: "DEDUCT",
          createdAt: { gte: todayRange.from, lte: todayRange.to },
        },
        select: { amount: true },
      },
      savingsAdjustments: {
        where: {
          type: "INCREASE",
          createdAt: { gte: todayRange.from, lte: todayRange.to },
        },
        select: { amount: true },
      },
      cycles: {
          orderBy: [{ startDate: "desc" }, { cycleNumber: "desc" }],
          take: 1,
        },
        notes: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        processingFees: {
          where: { createdAt: { gte: todayRange.from, lte: todayRange.to } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        loanInsurances: {
          where: { createdAt: { gte: todayRange.from, lte: todayRange.to } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        passbookFees: {
          where: { createdAt: { gte: todayRange.from, lte: todayRange.to } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        membershipFees: {
          where: { createdAt: { gte: todayRange.from, lte: todayRange.to } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      } as any,
      orderBy: { lastName: sort },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.member.count({ where }),
  ]);

  const memberIds = members.map((member) => member.id);
  const latestBalancePayments =
    memberIds.length > 0
      ? await prisma.balanceAdjustment.groupBy({
          by: ["memberId"],
          where: {
            memberId: { in: memberIds },
            type: "DEDUCT",
          },
          _max: {
            createdAt: true,
          },
        })
      : [];

  const latestBalancePaymentByMemberId = new Map(
    latestBalancePayments.map((entry) => [entry.memberId, entry._max.createdAt ?? null]),
  );

  const serializedMembers = (members as any[]).map((m) => {
    const latestNoteCreatedAt =
      m.notes?.[0]?.createdAt instanceof Date ? m.notes[0].createdAt : null;
    const latestBalancePaymentCreatedAt = latestBalancePaymentByMemberId.get(m.id) ?? null;
    const shouldPrefillLatestNote =
      latestNoteCreatedAt != null &&
      (latestBalancePaymentCreatedAt == null || latestNoteCreatedAt > latestBalancePaymentCreatedAt);

    return {
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
      todayPayment: Array.isArray(m.balanceAdjustments)
        ? m.balanceAdjustments.reduce(
            (sum: number, adj: any) => sum + (Number(adj.amount) || 0),
            0,
          )
        : 0,
      todaySavings: Array.isArray(m.savingsAdjustments)
        ? m.savingsAdjustments.reduce(
            (sum: number, adj: any) => sum + (Number(adj.amount) || 0),
            0,
          )
        : 0,
      _count: {
        balanceAdjustments: m._count.balanceAdjustments,
        savingsAdjustments: m._count.savingsAdjustments,
        notes: m._count.notes,
      },
      latestCycle: m.cycles[0]
        ? {
            cycleNumber: m.cycles[0].cycleNumber,
            startDate: m.cycles[0].startDate ? m.cycles[0].startDate.toISOString() : null,
            endDate: m.cycles[0].endDate ? m.cycles[0].endDate.toISOString() : null,
          }
        : null,
      latestNote: m.notes?.[0]?.content || "",
      latestNoteCreatedAt: latestNoteCreatedAt ? latestNoteCreatedAt.toISOString() : null,
      latestBalancePaymentCreatedAt: latestBalancePaymentCreatedAt
        ? latestBalancePaymentCreatedAt.toISOString()
        : null,
      shouldPrefillLatestNote,
      latestTodayProcessingFee: m.processingFees?.[0]?.amount ? Number(m.processingFees[0].amount) : null,
      latestTodayLoanInsurance: m.loanInsurances?.[0]?.amount ? Number(m.loanInsurances[0].amount) : null,
      latestTodayPassbookFee: m.passbookFees?.[0]?.amount ? Number(m.passbookFees[0].amount) : null,
      latestTodayMembershipFee: m.membershipFees?.[0]?.amount ? Number(m.membershipFees[0].amount) : null,
    };
  });

  return (
    <MembersClient
      initialMembers={serializedMembers}
      initialTotal={totalCount}
      initialGroups={groups}
      userRole={user.role as Role}
      initialGroupId={groupId}
      initialDays={days}
      initialStatus={status}
    />
  );
}
