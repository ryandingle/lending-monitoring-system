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
  }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const groupId = (sp.groupId ?? "").trim() || undefined;
  const page = parseInt(sp.page ?? "1") || 1;
  const limit = parseInt(sp.limit ?? "50") || 50;
  const sort = (sp.sort === "desc" ? "desc" : "asc") as "asc" | "desc";

  const where: any = {};
  if (groupId) {
    where.groupId = groupId;
  } else if (!q) {
    // If no group selected and no search query, return empty
    // preventing "All Members" display by default
    const groups = await prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });

    return (
      <MembersClient
        initialMembers={[]}
        initialTotal={0}
        initialGroups={groups}
        userRole={user.role}
        initialGroupId={undefined}
      />
    );
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
  }));

  return (
    <MembersClient
      initialMembers={serializedMembers}
      initialTotal={totalCount}
      initialGroups={groups}
      userRole={user.role}
      initialGroupId={groupId}
    />
  );
}
