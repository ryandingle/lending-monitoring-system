import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import Link from "next/link";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { SubmitButton } from "../../_components/submit-button";
import { revalidatePath } from "next/cache";
import { MemberBulkEditTable } from "../../members/member-bulk-edit-table";

const CreateMemberSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  age: z.coerce.number().int().min(0).max(150).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
  balance: z.coerce.number(),
  savings: z.coerce.number().default(0),
  daysCount: z.coerce.number().int().min(0).default(0),
});

async function createMemberAction(groupId: string, formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const parsed = CreateMemberSchema.safeParse({
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
    age: formData.get("age") ? Number(formData.get("age")) : undefined,
    address: String(formData.get("address") || "").trim() || undefined,
    phoneNumber: String(formData.get("phoneNumber") || "").trim() || undefined,
    balance: Number(formData.get("balance")),
    savings: Number(formData.get("savings") || 0),
    daysCount: Number(formData.get("daysCount") || 0),
  });
  if (!parsed.success) redirect(`/app/groups/${groupId}?created=0`);

  const today = new Date();

  const request = await tryGetAuditRequestContext();
  await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        groupId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        age: parsed.data.age,
        address: parsed.data.address,
        phoneNumber: parsed.data.phoneNumber,
        balance: new Prisma.Decimal(parsed.data.balance.toFixed(2)),
        savings: new Prisma.Decimal(parsed.data.savings.toFixed(2)),
        daysCount: parsed.data.daysCount,
        // ensure accrual starts "next day"
        savingsLastAccruedAt: today,
      },
    });

    await createAuditLog(tx, {
      actorUserId: user.id,
      action: "MEMBER_CREATE",
      entityType: "Member",
      entityId: member.id,
      metadata: {
        groupId,
        firstName: member.firstName,
        lastName: member.lastName,
        balance: member.balance.toFixed(2),
        savings: member.savings.toFixed(2),
        daysCount: member.daysCount,
        phoneNumber: member.phoneNumber ?? null,
      },
      request,
    });
  });

  redirect(`/app/groups/${groupId}?created=1`);
}

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
  return { success: errors.length === 0, errors };
}

export default async function GroupDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const { groupId } = await params;
  const sp = await searchParams;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      collectionOfficer: { select: { id: true, firstName: true, lastName: true } },
      members: {
        orderBy: { lastName: "asc" },
      },
    },
  });

  if (!group) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="text-sm text-slate-300">Group not found.</div>
        <div className="mt-4">
          <Link href="/app/groups" className="text-sm font-medium text-slate-200 hover:underline">
            Back to Groups
          </Link>
        </div>
      </div>
    );
  }

  const canAddMember = user.role === Role.SUPER_ADMIN || user.role === Role.ENCODER;

  const plainMembers = group.members.map((m) => ({
    id: m.id,
    firstName: m.firstName,
    lastName: m.lastName,
    balance: Number(m.balance),
    savings: Number(m.savings),
    createdAt: m.createdAt.toISOString(),
    groupId: m.groupId,
    group: { id: group.id, name: group.name },
    daysCount: m.daysCount,
  }));

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/app/groups" className="text-sm text-slate-400 hover:underline">
              ← Back to Groups
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">{group.name}</h1>
            <p className="mt-1 text-sm text-slate-400">{group.description ?? "-"}</p>
            {group.collectionOfficer ? (
              <p className="mt-1 text-sm text-slate-400">
                Collection officer: {group.collectionOfficer.firstName}{" "}
                {group.collectionOfficer.lastName}
              </p>
            ) : null}
          </div>
          <div>
            <Link
              href={`/app/members?groupId=${group.id}`}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
            >
              View in Members page
            </Link>
          </div>
        </div>

        {sp.created === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Member added.
          </div>
        ) : sp.created === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not add member (check inputs).
          </div>
        ) : null}

        {canAddMember ? (
          <form
            action={createMemberAction.bind(null, groupId)}
            className="mt-6 grid gap-3 md:grid-cols-4"
          >
            <div>
              <label className="text-sm font-medium">Firstname</label>
              <input
                name="firstName"
                required
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Lastname</label>
              <input
                name="lastName"
                required
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Age (optional)</label>
              <input
                name="age"
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone (optional)</label>
              <input
                name="phoneNumber"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Address (optional)</label>
              <input
                name="address"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Balance</label>
              <input
                name="balance"
                type="number"
                step="0.01"
                required
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Savings</label>
              <input
                name="savings"
                type="number"
                step="0.01"
                defaultValue="0.00"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Days in System</label>
              <input
                name="daysCount"
                type="number"
                min="0"
                defaultValue="0"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="md:col-span-4">
              <SubmitButton loadingText="Adding Member...">
                Add Member
              </SubmitButton>
            </div>
          </form>
        ) : (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
            You don’t have permission to add members.
          </div>
        )}
      </div>

      <MemberBulkEditTable
        initialMembers={plainMembers}
        user={{ role: user.role }}
        onBulkUpdate={onBulkUpdate.bind(null, groupId)}
        deleteMemberAction={deleteMemberAction.bind(null, groupId)}
        groupId={groupId}
        groupName={group.name}
      />
    </div>
  );
}

