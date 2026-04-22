import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import type { AuthUser } from "./session";

export async function getCollectorScopedGroupIds(user: AuthUser): Promise<string[] | null> {
  if (user.role !== "COLLECTOR") {
    return null;
  }

  if (!user.employeeId) {
    return [];
  }

  const groups = await prisma.group.findMany({
    where: { collectionOfficerId: user.employeeId },
    select: { id: true },
  });

  return groups.map((group) => group.id);
}

export async function requireCollectorGroupAccess(user: AuthUser, groupId: string) {
  const accessibleGroupIds = await getCollectorScopedGroupIds(user);
  if (accessibleGroupIds && !accessibleGroupIds.includes(groupId)) {
    notFound();
  }
}
