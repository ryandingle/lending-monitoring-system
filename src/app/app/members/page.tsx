import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role, BalanceUpdateType, SavingsUpdateType } from "@prisma/client";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { MemberBulkEditTable } from "./member-bulk-edit-table";
import { SubmitButton } from "../_components/submit-button";
import { revalidatePath } from "next/cache";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    groupId?: string;
    created?: string;
    deleted?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const groupId = (sp.groupId ?? "").trim() || undefined;
  const canAddMember = user.role === Role.SUPER_ADMIN || user.role === Role.ENCODER;

  async function deleteMemberAction(memberId: string) {
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
      redirect("/app/members?deleted=0");
    }
    revalidatePath("/app/members");
    redirect("/app/members?deleted=1");
  }

  async function onBulkUpdate(updates: { memberId: string; balanceDeduct: string; savingsIncrease: string; daysCount: string }[]) {
    "use server";
    const actor = await requireUser();
    requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

    const request = await tryGetAuditRequestContext();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const errors: { memberId: string; message: string; type: "balance" | "savings" }[] = [];

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

            // Auto-increment daysCount if not manually set
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
                type: BalanceUpdateType.DEDUCT,
                amount: balanceDeduct,
                balanceBefore,
                balanceAfter,
              },
            });

            // Update newDaysCount to reflect what was actually saved
            if (shouldIncrementDays) {
              // This ensures the audit log shows the correct value
              update.daysCount = String(finalDaysCount);
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
                type: SavingsUpdateType.INCREASE,
                amount: savingsIncrease,
                savingsBefore,
                savingsAfter,
              },
            });
          }
        }

        // Update daysCount if provided
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

    revalidatePath("/app/members");
    return { success: errors.length === 0, errors };
  }

  const where: any = {};
  if (groupId) where.groupId = groupId;
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { phoneNumber: { contains: q, mode: "insensitive" } },
      { group: { is: { name: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const skipQuery = user.role === Role.ENCODER && !groupId;

  const [groups, members] = skipQuery
    ? [
      await prisma.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      [],
    ]
    : await Promise.all([
      prisma.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
      prisma.member.findMany({
        where,
        include: {
          group: { select: { id: true, name: true } },
          _count: { select: { balanceAdjustments: true } }
        },
        orderBy: { lastName: "asc" },
      }),
    ]);

  // Transform members for client component (serializable)
  const plainMembers = members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    balance: Number(m.balance),
    savings: Number(m.savings),
    createdAt: m.createdAt.toISOString(),
    groupId: m.groupId,
    group: m.group ? { id: m.group.id, name: m.group.name } : null,
    daysCount: m._count.balanceAdjustments,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Members</h1>
            <p className="mt-1 text-sm text-slate-400">
              Bulk update member balances and savings directly from the table.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canAddMember ? (
              <Link
                href="/app/members/new"
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Add Member
              </Link>
            ) : (
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                No permission to add members
              </div>
            )}
          </div>
        </div>


        <form method="get" className="mt-6 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <label className="text-sm font-medium text-slate-300">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, phone, or group…"
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-slate-300">Group</label>
            <select
              name="groupId"
              defaultValue={groupId ?? ""}
              required={user.role === Role.ENCODER}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20 invalid:border-red-500/50"
            >
              {user.role === Role.SUPER_ADMIN ? (
                <option value="">All groups</option>
              ) : (
                <option value="" disabled>Select a group...</option>
              )}
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1 flex items-end">
            <SubmitButton className="w-full" loadingText="Applying...">
              Apply
            </SubmitButton>
          </div>
        </form>
      </div>

      <MemberBulkEditTable
        initialMembers={plainMembers}
        user={{ role: user.role }}
        onBulkUpdate={onBulkUpdate}
        deleteMemberAction={deleteMemberAction}
        groupId={groupId}
        groupName={groups.find(g => g.id === groupId)?.name}
      />
    </div>
  );
}
