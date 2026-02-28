import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { revalidatePath } from "next/cache";
import { GroupDetailsClient } from "./group-details-client";

async function deleteMemberAction(groupId: string, memberId: string) {
  "use server";
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  try {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        select: { id: true, firstName: true, lastName: true, groupId: true },
      });
      if (!member) return;

      await tx.member.delete({ where: { id: memberId } });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "MEMBER_DELETE",
        entityType: "Member",
        entityId: member.id,
        metadata: { firstName: member.firstName, lastName: member.lastName, groupId: member.groupId },
        request,
      });
    });
  } catch {
    redirect(`/app/groups/${groupId}?deleted=0`);
  }
  revalidatePath(`/app/groups/${groupId}`);
  redirect(`/app/groups/${groupId}?deleted=1`);
}

async function onBulkUpdate(groupId: string, updates: { memberId: string; balanceDeduct: string; savingsIncrease: string; daysCount: string }[]) {
  "use server";
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const request = await tryGetAuditRequestContext();
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const errors: { memberId: string; message: string; type: "balance" | "savings" }[] = [];
  const warnings: { memberId: string; message: string }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const update of updates) {
      const member = await tx.member.findUnique({
        where: { id: update.memberId },
        select: { id: true, firstName: true, lastName: true, balance: true, savings: true, daysCount: true },
      });
      if (!member) continue;

      const balanceDeduct = parseFloat(update.balanceDeduct) || 0;
      const savingsIncrease = parseFloat(update.savingsIncrease) || 0;
      const newDaysCount = update.daysCount !== "" ? parseInt(update.daysCount) : null;

      if (balanceDeduct > 0) {
        const alreadyUpdated = await tx.balanceAdjustment.findFirst({
          where: {
            memberId: member.id,
            createdAt: { gte: startOfToday },
          },
        });

        if (alreadyUpdated) {
          await createAuditLog(tx, {
            actorUserId: actor.id,
            action: "ATTEMPT_MULTIPLE_BALANCE_UPDATE",
            entityType: "Member",
            entityId: member.id,
            metadata: { attempt: balanceDeduct, memberName: `${member.firstName} ${member.lastName}` },
            request,
          });
          errors.push({
            memberId: member.id,
            type: "balance",
            message: `Balance for ${member.firstName} has already been updated today.`
          });
        } else {
          const balanceBefore = member.balance;
          const balanceAfter = balanceBefore.minus(balanceDeduct);

          const shouldIncrementDays = newDaysCount === null;
          const finalDaysCount = shouldIncrementDays ? member.daysCount + 1 : newDaysCount;

          await tx.member.update({
            where: { id: member.id },
            data: {
              balance: balanceAfter,
              daysCount: finalDaysCount,
            },
          });

          await tx.balanceAdjustment.create({
            data: {
              memberId: member.id,
              encodedById: actor.id,
              type: "DEDUCT",
              amount: balanceDeduct,
              balanceBefore,
              balanceAfter,
            },
          });

          if (shouldIncrementDays) {
            update.daysCount = String(finalDaysCount);
          }
          
          if (finalDaysCount >= 40) {
            warnings.push({
              memberId: member.id,
              message: `${member.firstName} ${member.lastName} has reached ${finalDaysCount} days.`
            });
            
            await createAuditLog(tx, {
              actorUserId: actor.id,
              action: "MEMBER_REACHED_40_DAYS",
              entityType: "Member",
              entityId: member.id,
              metadata: { daysCount: finalDaysCount },
              request,
            });
          }
        }
      }

      if (savingsIncrease > 0) {
        const alreadyUpdated = await tx.savingsAdjustment.findFirst({
          where: {
            memberId: member.id,
            createdAt: { gte: startOfToday },
          },
        });

        if (alreadyUpdated) {
          await createAuditLog(tx, {
            actorUserId: actor.id,
            action: "ATTEMPT_MULTIPLE_SAVINGS_UPDATE",
            entityType: "Member",
            entityId: member.id,
            metadata: { attempt: savingsIncrease, memberName: `${member.firstName} ${member.lastName}` },
            request,
          });
          errors.push({
            memberId: member.id,
            type: "savings",
            message: `Savings for ${member.firstName} has already been updated today.`
          });
        } else {
          const savingsBefore = member.savings;
          const savingsAfter = savingsBefore.plus(savingsIncrease);

          await tx.member.update({
            where: { id: member.id },
            data: { savings: savingsAfter },
          });

          await tx.savingsAdjustment.create({
            data: {
              memberId: member.id,
              encodedById: actor.id,
              type: "INCREASE",
              amount: savingsIncrease,
              savingsBefore,
              savingsAfter,
            },
          });
        }
      }

      if (newDaysCount !== null && newDaysCount !== member.daysCount) {
        await tx.member.update({
          where: { id: member.id },
          data: { daysCount: newDaysCount },
        });
      }

      if ((balanceDeduct > 0 || savingsIncrease > 0 || newDaysCount !== null) && !errors.some(e => e.memberId === member.id)) {
        await createAuditLog(tx, {
          actorUserId: actor.id,
          action: "MEMBER_BULK_UPDATE",
          entityType: "Member",
          entityId: member.id,
          metadata: { balanceDeduct, savingsIncrease, daysCount: newDaysCount },
          request,
        });
      }
    }
  });

  revalidatePath(`/app/groups/${groupId}`);
  return { success: errors.length === 0, errors, warnings };
}

export default async function GroupDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ 
    created?: string;
    page?: string;
    limit?: string;
    sort?: string;
  }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER, Role.VIEWER]);
  const { groupId } = await params;
  const sp = await searchParams;

  const page = parseInt(sp.page ?? "1") || 1;
  const limit = parseInt(sp.limit ?? "50") || 50;
  const sort = (sp.sort === "desc" ? "desc" : "asc") as "asc" | "desc";

  const [group, totalCount, allGroups] = await Promise.all([
    prisma.group.findUnique({
      where: { id: groupId },
      include: {
        collectionOfficer: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.member.count({ where: { groupId } }),
    prisma.group.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const members = await prisma.member.findMany({
    where: { groupId },
    include: {
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
  });

  if (!group) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm text-slate-500">Group not found.</div>
        <div className="mt-4">
          <Link href="/app/groups" className="text-sm font-medium text-slate-700 hover:underline">
            Back to Groups
          </Link>
        </div>
      </div>
    );
  }

  const canAddMember = user.role === Role.SUPER_ADMIN || user.role === Role.ENCODER;
  const totalPages = Math.ceil(totalCount / limit);

  const plainMembers = (members as any[]).map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    balance: Number(m.balance),
    savings: Number(m.savings),
    createdAt: m.createdAt.toISOString(),
    groupId: m.groupId,
    group: { id: group.id, name: group.name },
    daysCount: m.daysCount,
    age: m.age,
    address: m.address,
    phoneNumber: m.phoneNumber,
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
    <GroupDetailsClient
      group={group}
      groups={allGroups}
      initialMembers={plainMembers}
      userRole={user.role}
      onBulkUpdate={onBulkUpdate.bind(null, groupId)}
      deleteMemberAction={deleteMemberAction.bind(null, groupId)}
      pagination={{ page, limit, totalCount, totalPages }}
      sort={sort}
      createdStatus={sp.created}
    />
  );
}
