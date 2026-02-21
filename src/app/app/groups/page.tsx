import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role, EmployeePosition } from "@prisma/client";
import { GroupsClient } from "./groups-client";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER, Role.VIEWER]);
  const sp = await searchParams;
  const canCreate = user.role === Role.SUPER_ADMIN || user.role === Role.ENCODER;
  const canDelete = user.role === Role.SUPER_ADMIN;

  const q = (sp.q ?? "").trim();
  const page = clampInt(Number(sp.page ?? "1") || 1, 1, 10_000);
  const limit = clampInt(Number(sp.pageSize ?? "20") || 20, 5, 100);

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      {
        collectionOfficer: {
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const [groups, total, collectionOfficers] = await Promise.all([
    prisma.group.findMany({
      where,
      include: {
        _count: { select: { members: true } },
        collectionOfficer: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.group.count({ where }),
    prisma.employee.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: "asc" },
    }),
  ]);

  return (
    <GroupsClient
      initialGroups={groups}
      initialTotal={total}
      initialCollectionOfficers={collectionOfficers}
      canCreate={canCreate}
      canDelete={canDelete}
    />
  );
}
