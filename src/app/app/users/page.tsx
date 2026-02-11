import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { UsersClient } from "./users-client";

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const where: any = {
    username: { not: "administrator" },
  };

  if (q.length > 0) {
    where.OR = [
      { username: { contains: q, mode: "insensitive" as const } },
      { name: { contains: q, mode: "insensitive" as const } },
      { email: { contains: q, mode: "insensitive" as const } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  const serializedUsers = users.map(u => ({
    ...u,
    createdAt: u.createdAt.toISOString()
  }));

  return <UsersClient initialUsers={serializedUsers} currentUserId={actor.id} />;
}
