import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { EmployeesClient } from "./employees-client";

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const where =
    q.length > 0
      ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
        ],
      }
      : {};

  const [employees, groups] = await Promise.all([
    prisma.employee.findMany({
      where,
      include: {
        groupsAsCollectionOfficer: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, collectionOfficerId: true },
    }),
  ]);

  const serializedEmployees = employees.map(e => ({
    ...e,
    createdAt: e.createdAt.toISOString()
  }));

  return (
    <EmployeesClient 
      initialEmployees={serializedEmployees} 
      initialGroups={groups}
      userRole={user.role} 
    />
  );
}
