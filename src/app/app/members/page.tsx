import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { MembersClient } from "./members-client";

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
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER, Role.VIEWER]);
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const groupId = (sp.groupId ?? "").trim() || undefined;
  const page = parseInt(sp.page ?? "1") || 1;
  const limit = parseInt(sp.limit ?? "50") || 50;
  const sort = (sp.sort === "desc" ? "desc" : "asc") as "asc" | "desc";
  // Default to 0 days (All Days) if not specified
  const days = sp.days !== undefined ? (parseInt(sp.days) || 0) : 0;
  const status = (sp.status ?? "ACTIVE") as "ACTIVE" | "INACTIVE" | "ALL";

  const where: any = {};
  if (status !== "ALL") {
    where.status = status;
  }
  if (groupId) {
    where.groupId = groupId;
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
          },
        },
        cycles: {
          orderBy: { cycleNumber: "desc" },
          take: 1,
        },
      } as any,
      orderBy: { lastName: sort },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.member.count({ where }),
  ]);

  const serializedMembers = (members as any[]).map((m) => ({
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
      startDate: m.cycles[0].startDate ? m.cycles[0].startDate.toISOString() : null,
      endDate: m.cycles[0].endDate ? m.cycles[0].endDate.toISOString() : null,
    } : null,
  }));

  return (
    <MembersClient
      initialMembers={serializedMembers}
      initialTotal={totalCount}
      initialGroups={groups}
      userRole={user.role}
      initialGroupId={groupId}
      initialDays={days}
      initialStatus={status}
    />
  );
}
