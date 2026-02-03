import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { countBusinessDays, formatDateTimeManila } from "@/lib/date";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { ConfirmSubmitButton } from "../../_components/confirm-submit-button";
import { SubmitButton } from "../../_components/submit-button";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

const BalanceUpdateSchema = z.object({
  type: z.enum(["INCREASE", "DEDUCT"]),
  amount: z.coerce.number().positive(),
});

const SavingsUpdateSchema = z.object({
  type: z.enum(["INCREASE", "WITHDRAW", "APPLY_TO_BALANCE"]),
  amount: z.coerce.number().positive(),
});

async function updateBalanceAction(memberId: string, formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const parsed = BalanceUpdateSchema.safeParse({
    type: String(formData.get("type") || ""),
    amount: Number(formData.get("amount")),
  });

  if (!parsed.success) redirect(`/app/members/${memberId}?balanceUpdated=0`);

  const amount = new Prisma.Decimal(parsed.data.amount.toFixed(2));
  const type = parsed.data.type;

  try {
    const request = await tryGetAuditRequestContext();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    await prisma.$transaction(async (tx) => {
      const alreadyUpdated = await tx.balanceAdjustment.findFirst({
        where: {
          memberId,
          createdAt: { gte: startOfToday },
        },
      });

      if (alreadyUpdated) {
        await createAuditLog(tx, {
          actorUserId: user.id,
          action: "ATTEMPT_MULTIPLE_BALANCE_UPDATE",
          entityType: "Member",
          entityId: memberId,
          metadata: { attempt: amount.toFixed(2), type },
          request,
        });
        throw new Error("ALREADY_UPDATED_TODAY");
      }

      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) throw new Error("Member not found");

      const before = member.balance;
      let after: Prisma.Decimal;

      if (type === "INCREASE") {
        after = before.plus(amount);
      } else {
        // Prevent negative balances
        if (before.lessThan(amount)) {
          throw new Error("Deduction exceeds current balance");
        }
        after = before.minus(amount);
      }

      await tx.balanceAdjustment.create({
        data: {
          memberId,
          encodedById: user.id,
          type,
          amount,
          balanceBefore: before,
          balanceAfter: after,
        },
      });

      await tx.member.update({
        where: { id: memberId },
        data: {
          balance: after,
        },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "BALANCE_UPDATE",
        entityType: "Member",
        entityId: memberId,
        metadata: {
          type,
          amount: amount.toFixed(2),
          before: before.toFixed(2),
          after: after.toFixed(2),
        },
        request,
      });
    });
  } catch (e: any) {
    if (e.message === "ALREADY_UPDATED_TODAY") {
      redirect(`/app/members/${memberId}?balanceUpdated=2`);
    }
    redirect(`/app/members/${memberId}?balanceUpdated=0`);
  }

  redirect(`/app/members/${memberId}?balanceUpdated=1`);
}

async function updateSavingsAction(memberId: string, formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const parsed = SavingsUpdateSchema.safeParse({
    type: String(formData.get("type") || ""),
    amount: Number(formData.get("amount")),
  });

  if (!parsed.success) redirect(`/app/members/${memberId}?savingsUpdated=0`);

  const amount = new Prisma.Decimal(parsed.data.amount.toFixed(2));
  const type = parsed.data.type;

  try {
    const request = await tryGetAuditRequestContext();
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    await prisma.$transaction(async (tx) => {
      const alreadyUpdated = await tx.savingsAdjustment.findFirst({
        where: {
          memberId,
          createdAt: { gte: startOfToday },
        },
      });

      if (alreadyUpdated) {
        await createAuditLog(tx, {
          actorUserId: user.id,
          action: "ATTEMPT_MULTIPLE_SAVINGS_UPDATE",
          entityType: "Member",
          entityId: memberId,
          metadata: { attempt: amount.toFixed(2), type },
          request,
        });
        throw new Error("ALREADY_UPDATED_TODAY");
      }

      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) throw new Error("Member not found");

      const savingsBefore = member.savings;
      let savingsAfter: Prisma.Decimal;

      if (type === "INCREASE") {
        savingsAfter = savingsBefore.plus(amount);
      } else {
        // WITHDRAW or APPLY_TO_BALANCE both reduce savings
        if (savingsBefore.lessThan(amount)) {
          throw new Error("Withdrawal exceeds current savings");
        }
        savingsAfter = savingsBefore.minus(amount);
      }

      // If applying savings to balance, also deduct balance (payment) and record it.
      if (type === "APPLY_TO_BALANCE") {
        const balanceBefore = member.balance;
        if (balanceBefore.lessThan(amount)) {
          throw new Error("Payment exceeds current balance");
        }
        const balanceAfter = balanceBefore.minus(amount);

        await tx.balanceAdjustment.create({
          data: {
            memberId,
            encodedById: user.id,
            type: "DEDUCT",
            amount: amount,
            balanceBefore,
            balanceAfter,
          },
        });

        await tx.member.update({
          where: { id: memberId },
          data: {
            balance: balanceAfter,
          },
        });
      }

      await tx.savingsAdjustment.create({
        data: {
          memberId,
          encodedById: user.id,
          type,
          amount,
          savingsBefore,
          savingsAfter,
        },
      });

      await tx.member.update({
        where: { id: memberId },
        data: {
          savings: savingsAfter,
        },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "SAVINGS_UPDATE",
        entityType: "Member",
        entityId: memberId,
        metadata: {
          type,
          amount: amount.toFixed(2),
          savingsBefore: savingsBefore.toFixed(2),
          savingsAfter: savingsAfter.toFixed(2),
          appliedToBalance: type === "APPLY_TO_BALANCE",
        },
        request,
      });
    });
  } catch (e: any) {
    if (e.message === "ALREADY_UPDATED_TODAY") {
      redirect(`/app/members/${memberId}?savingsUpdated=2`);
    }
    redirect(`/app/members/${memberId}?savingsUpdated=0`);
  }

  redirect(`/app/members/${memberId}?savingsUpdated=1`);
}

async function revertBalanceAdjustmentAction(adjustmentId: string, memberId: string) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  try {
    const request = await tryGetAuditRequestContext();

    await prisma.$transaction(async (tx) => {
      const adjustment = await tx.balanceAdjustment.findUnique({
        where: { id: adjustmentId },
      });

      if (!adjustment || adjustment.memberId !== memberId) {
        throw new Error("Adjustment not found");
      }

      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) throw new Error("Member not found");

      // Revert the calculation
      let newBalance: Prisma.Decimal;
      if (adjustment.type === "INCREASE") {
        newBalance = member.balance.minus(adjustment.amount);
      } else {
        newBalance = member.balance.plus(adjustment.amount);
      }

      await tx.member.update({
        where: { id: memberId },
        data: { balance: newBalance },
      });

      await tx.balanceAdjustment.delete({
        where: { id: adjustmentId },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "BALANCE_ADJUSTMENT_REVERTED",
        entityType: "Member",
        entityId: memberId,
        metadata: {
          adjustmentId,
          type: adjustment.type,
          amount: adjustment.amount.toFixed(2),
          memberBalanceBeforeRevert: member.balance.toFixed(2),
          memberBalanceAfterRevert: newBalance.toFixed(2),
        },
        request,
      });
    });
  } catch (e: any) {
    console.error("Revert balance error:", e);
    redirect(`/app/members/${memberId}?error=revert_failed`);
  }

  revalidatePath(`/app/members/${memberId}`);
  redirect(`/app/members/${memberId}?status=reverted`);
}

async function revertSavingsAdjustmentAction(adjustmentId: string, memberId: string) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  try {
    const request = await tryGetAuditRequestContext();

    await prisma.$transaction(async (tx) => {
      const adjustment = await tx.savingsAdjustment.findUnique({
        where: { id: adjustmentId },
      });

      if (!adjustment || adjustment.memberId !== memberId) {
        throw new Error("Adjustment not found");
      }

      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) throw new Error("Member not found");

      // Revert the calculation
      let newSavings: Prisma.Decimal;
      if (adjustment.type === "INCREASE") {
        newSavings = member.savings.minus(adjustment.amount);
      } else {
        newSavings = member.savings.plus(adjustment.amount);
      }

      await tx.member.update({
        where: { id: memberId },
        data: { savings: newSavings },
      });

      await tx.savingsAdjustment.delete({
        where: { id: adjustmentId },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "SAVINGS_ADJUSTMENT_REVERTED",
        entityType: "Member",
        entityId: memberId,
        metadata: {
          adjustmentId,
          type: adjustment.type,
          amount: adjustment.amount.toFixed(2),
          memberSavingsBeforeRevert: member.savings.toFixed(2),
          memberSavingsAfterRevert: newSavings.toFixed(2),
        },
        request,
      });
    });
  } catch (e: any) {
    console.error("Revert savings error:", e);
    redirect(`/app/members/${memberId}?error=revert_failed`);
  }

  revalidatePath(`/app/members/${memberId}`);
  redirect(`/app/members/${memberId}?status=reverted`);
}

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    balancePage?: string;
    balancePageSize?: string;
    balanceUpdated?: string;
    savingsPage?: string;
    savingsPageSize?: string;
    savingsUpdated?: string;
    status?: string;
    error?: string;
  }>;
}) {
  const currentUser = await requireUser();
  const isAdmin = currentUser.role === Role.SUPER_ADMIN;
  const { memberId } = await params;
  const sp = await searchParams;

  const page = clampInt(Number(sp.page ?? "1") || 1, 1, 10_000);
  const pageSize = clampInt(Number(sp.pageSize ?? "20") || 20, 5, 100);
  const balancePage = clampInt(Number(sp.balancePage ?? "1") || 1, 1, 10_000);
  const balancePageSize = clampInt(Number(sp.balancePageSize ?? "10") || 10, 5, 100);
  const savingsPage = clampInt(Number(sp.savingsPage ?? "1") || 1, 1, 10_000);
  const savingsPageSize = clampInt(Number(sp.savingsPageSize ?? "10") || 10, 5, 100);
  const canUpdateBalance =
    currentUser.role === Role.SUPER_ADMIN || currentUser.role === Role.ENCODER;
  const canUpdateSavings = currentUser.role === Role.SUPER_ADMIN || currentUser.role === Role.ENCODER;

  const member = await prisma.member.findUnique({
    where: { id: memberId },
    include: { group: { select: { id: true, name: true } } },
  });

  if (!member) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="text-sm text-slate-300">Member not found.</div>
        <div className="mt-4">
          <Link href="/app/members" className="text-sm font-medium text-slate-200 hover:underline">
            Back to Members
          </Link>
        </div>
      </div>
    );
  }

  const [
    totalAccrualCount,
    accruals,
    accrualSum,
    totalBalanceUpdates,
    balanceUpdates,
    totalSavingsUpdates,
    savingsUpdates,
  ] = await Promise.all([
    prisma.savingsAccrual.count({ where: { memberId } }),
    prisma.savingsAccrual.findMany({
      where: { memberId },
      orderBy: { accruedForDate: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
    prisma.savingsAccrual.aggregate({
      where: { memberId },
      _sum: { amount: true },
    }),
    prisma.balanceAdjustment.count({ where: { memberId } }),
    prisma.balanceAdjustment.findMany({
      where: { memberId },
      include: { encodedBy: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: balancePageSize,
      skip: (balancePage - 1) * balancePageSize,
    }),
    prisma.savingsAdjustment.count({ where: { memberId } }),
    prisma.savingsAdjustment.findMany({
      where: { memberId },
      include: { encodedBy: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: savingsPageSize,
      skip: (savingsPage - 1) * savingsPageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalAccrualCount / pageSize));
  const safePage = Math.min(page, totalPages);

  const accruedTotal = accrualSum._sum.amount ?? 0;

  const prevHref =
    safePage > 1 ? `/app/members/${memberId}?page=${safePage - 1}&pageSize=${pageSize}` : undefined;
  const nextHref =
    safePage < totalPages ? `/app/members/${memberId}?page=${safePage + 1}&pageSize=${pageSize}` : undefined;

  const totalBalancePages = Math.max(1, Math.ceil(totalBalanceUpdates / balancePageSize));
  const safeBalancePage = Math.min(balancePage, totalBalancePages);
  const prevBalanceHref =
    safeBalancePage > 1
      ? `/app/members/${memberId}?balancePage=${safeBalancePage - 1}&balancePageSize=${balancePageSize}`
      : undefined;
  const nextBalanceHref =
    safeBalancePage < totalBalancePages
      ? `/app/members/${memberId}?balancePage=${safeBalancePage + 1}&balancePageSize=${balancePageSize}`
      : undefined;

  const totalSavingsPages = Math.max(1, Math.ceil(totalSavingsUpdates / savingsPageSize));
  const safeSavingsPage = Math.min(savingsPage, totalSavingsPages);
  const prevSavingsHref =
    safeSavingsPage > 1
      ? `/app/members/${memberId}?savingsPage=${safeSavingsPage - 1}&savingsPageSize=${savingsPageSize}`
      : undefined;
  const nextSavingsHref =
    safeSavingsPage < totalSavingsPages
      ? `/app/members/${memberId}?savingsPage=${safeSavingsPage + 1}&savingsPageSize=${savingsPageSize}`
      : undefined;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/app/members" className="text-sm text-slate-400 hover:underline">
              ← Back to Members
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">
              {member.lastName}, {member.firstName}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              {totalBalanceUpdates} days in system
              {" · "}
              Group:{" "}
              {member.group ? (
                currentUser.role === Role.SUPER_ADMIN ? (
                  <Link
                    href={`/app/groups/${member.group.id}`}
                    className="font-medium text-slate-200 hover:underline"
                  >
                    {member.group.name}
                  </Link>
                ) : (
                  <span className="font-medium text-slate-200">{member.group.name}</span>
                )
              ) : (
                <span className="font-medium text-slate-500">—</span>
              )}
            </p>
          </div>
        </div>

        {sp.status === "reverted" && (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Adjustment has been reverted and member record recalculated.
          </div>
        )}

        {sp.error === "revert_failed" && (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Failed to revert adjustment.
          </div>
        )}

        {sp.balanceUpdated === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Balance updated.
          </div>
        ) : sp.balanceUpdated === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not update balance (check inputs / insufficient balance for deduction).
          </div>
        ) : sp.balanceUpdated === "2" ? (
          <div className="mt-4 rounded-lg border border-yellow-900/40 bg-yellow-950/40 px-3 py-2 text-sm text-yellow-200">
            Balance has already been adjusted for this member today. Access blocked to prevent duplicates.
          </div>
        ) : null}

        {sp.savingsUpdated === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Savings updated.
          </div>
        ) : sp.savingsUpdated === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not update savings (check inputs / insufficient savings / payment exceeds balance).
          </div>
        ) : sp.savingsUpdated === "2" ? (
          <div className="mt-4 rounded-lg border border-yellow-900/40 bg-yellow-950/40 px-3 py-2 text-sm text-yellow-200">
            Savings have already been adjusted for this member today. Access blocked to prevent duplicates.
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs uppercase text-slate-400">Balance</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {member.balance.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs uppercase text-slate-400">Savings (stored)</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {member.savings.toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-xs uppercase text-slate-400">Savings (ledger total)</div>
            <div className="mt-1 text-2xl font-semibold text-slate-100">
              {typeof accruedTotal === "number" ? accruedTotal.toFixed(2) : String(accruedTotal)}
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-100">Update Balance</div>
              <div className="mt-1 text-sm text-slate-400">
                Record a weekly collection/payment and automatically update the balance.
              </div>
            </div>
          </div>

          {canUpdateBalance ? (
            <form
              action={updateBalanceAction.bind(null, memberId)}
              className="mt-4 grid gap-3 md:grid-cols-6"
            >
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  name="type"
                  defaultValue="DEDUCT"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="INCREASE">Increase (+)</option>
                  <option value="DEDUCT">Deduct (-)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Amount</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="md:col-span-2 flex items-end">
                <SubmitButton className="w-full" loadingText="Saving...">
                  Save Balance Update
                </SubmitButton>
              </div>
            </form>
          ) : (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
              You don’t have permission to update balances.
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-medium text-slate-100">Update Savings</div>
              <div className="mt-1 text-sm text-slate-400">
                Withdraw savings, increase savings, or apply savings to cover the balance.
              </div>
            </div>
          </div>

          {canUpdateSavings ? (
            <form
              action={updateSavingsAction.bind(null, memberId)}
              className="mt-4 grid gap-3 md:grid-cols-6"
            >
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Type</label>
                <select
                  name="type"
                  defaultValue="INCREASE"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="INCREASE">Increase (+)</option>
                  <option value="WITHDRAW">Withdraw (-)</option>
                  <option value="APPLY_TO_BALANCE">Apply to Balance</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium">Amount</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="md:col-span-2 flex items-end">
                <SubmitButton className="w-full" loadingText="Saving...">
                  Save Savings Update
                </SubmitButton>
              </div>
            </form>
          ) : (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm text-slate-300">
              You don’t have permission to update savings.
            </div>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm font-medium text-slate-100">Contact</div>
            <div className="mt-2 text-sm text-slate-300">
              <div>
                <span className="text-slate-500">Phone:</span> {member.phoneNumber ?? "-"}
              </div>
              <div>
                <span className="text-slate-500">Address:</span> {member.address ?? "-"}
              </div>
              <div>
                <span className="text-slate-500">Age:</span> {member.age ?? "-"}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm font-medium text-slate-100">Meta</div>
            <div className="mt-2 text-sm text-slate-300">
              <div>
                <span className="text-slate-500">Created:</span>{" "}
                {member.createdAt.toISOString().slice(0, 10)}
              </div>
              <div>
                <span className="text-slate-500">Last accrued:</span>{" "}
                {member.savingsLastAccruedAt
                  ? member.savingsLastAccruedAt.toISOString().slice(0, 10)
                  : "-"}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 bg-slate-900/20">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">Savings Updates</h2>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-tighter text-slate-500">
              {totalSavingsUpdates} entry{totalSavingsUpdates === 1 ? "" : "ies"} · page{" "}
              {safeSavingsPage} of {totalSavingsPages}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href={prevSavingsHref ?? "#"}
              className={`rounded border px-3 py-1 text-[10px] font-bold uppercase transition-colors ${prevSavingsHref
                ? "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                : "cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                }`}
            >
              Prev
            </Link>
            <Link
              href={nextSavingsHref ?? "#"}
              className={`rounded border px-3 py-1 text-[10px] font-bold uppercase transition-colors ${nextSavingsHref
                ? "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                : "cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                }`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto bg-slate-950 border-t border-slate-800">
          <table className="min-w-full table-fixed border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 shadow-sm">
              <tr className="text-[10px] uppercase tracking-widest text-slate-400">
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold">Date</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold">Type</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold text-right">Amount</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold text-right">Before</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold text-right">After</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold">Encoded By</th>
                {isAdmin && <th className="border-b border-slate-800 px-3 py-2 font-semibold text-center w-20">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {savingsUpdates.map((s) => (
                <tr key={s.id} className="group hover:bg-blue-500/5 odd:bg-slate-950 even:bg-slate-900/30">
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 font-mono text-slate-400 transition-colors group-hover:border-blue-500/30">
                    {formatDateTimeManila(s.createdAt)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 font-medium text-slate-300 transition-colors group-hover:border-blue-500/30">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.type === 'INCREASE' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-blue-500/10 text-blue-400'
                      }`}>
                      {s.type}
                    </span>
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-right font-mono font-medium text-slate-300 transition-colors group-hover:border-blue-500/30">
                    {s.amount.toFixed(2)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-right font-mono text-slate-500 transition-colors group-hover:border-blue-500/30">
                    {s.savingsBefore.toFixed(2)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-right font-mono text-emerald-500/70 transition-colors group-hover:border-blue-500/30">
                    {s.savingsAfter.toFixed(2)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-slate-400 transition-colors group-hover:border-blue-500/30 text-[10px] font-medium">
                    {s.encodedBy.name}
                  </td>
                  {isAdmin && (
                    <td className="border-b border-slate-800 px-3 py-1 text-center transition-colors group-hover:border-blue-500/30">
                      <form action={revertSavingsAdjustmentAction.bind(null, s.id, memberId)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Revert this savings adjustment of ${s.amount.toFixed(2)}? This will recalculate the member's current savings.`}
                          className="text-[10px] font-bold text-red-500 hover:text-red-400 hover:underline px-2 py-1 rounded transition-colors uppercase tracking-tight"
                        >
                          Revert
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {savingsUpdates.length === 0 ? (
                <tr>
                  <td className="py-12 text-center text-slate-500 italic border-b border-slate-800" colSpan={isAdmin ? 7 : 6}>
                    No savings updates yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 bg-slate-900/20">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">Balance Updates</h2>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-tighter text-slate-500">
              {totalBalanceUpdates} entry{totalBalanceUpdates === 1 ? "" : "ies"} · page{" "}
              {safeBalancePage} of {totalBalancePages}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href={prevBalanceHref ?? "#"}
              className={`rounded border px-3 py-1 text-[10px] font-bold uppercase transition-colors ${prevBalanceHref
                ? "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                : "cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                }`}
            >
              Prev
            </Link>
            <Link
              href={nextBalanceHref ?? "#"}
              className={`rounded border px-3 py-1 text-[10px] font-bold uppercase transition-colors ${nextBalanceHref
                ? "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                : "cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                }`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto bg-slate-950 border-t border-slate-800">
          <table className="min-w-full table-fixed border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 shadow-sm">
              <tr className="text-[10px] uppercase tracking-widest text-slate-400">
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold">Date</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold">Type</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold text-right">Amount</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold text-right">Before</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold text-right">After</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold">Encoded By</th>
                {isAdmin && <th className="border-b border-slate-800 px-3 py-2 font-semibold text-center w-20">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {balanceUpdates.map((b) => (
                <tr key={b.id} className="group hover:bg-blue-500/5 odd:bg-slate-950 even:bg-slate-900/30">
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 font-mono text-slate-400 transition-colors group-hover:border-blue-500/30">
                    {formatDateTimeManila(b.createdAt)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 font-medium text-slate-300 transition-colors group-hover:border-blue-500/30">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${b.type === 'DEDUCT' ? 'bg-blue-500/10 text-blue-400' : 'bg-emerald-500/10 text-emerald-400'
                      }`}>
                      {b.type}
                    </span>
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-right font-mono font-medium text-slate-300 transition-colors group-hover:border-blue-500/30">
                    {b.amount.toFixed(2)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-right font-mono text-slate-500 transition-colors group-hover:border-blue-500/30">
                    {b.balanceBefore.toFixed(2)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-right font-mono text-blue-400 transition-colors group-hover:border-blue-500/30">
                    {b.balanceAfter.toFixed(2)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-slate-400 transition-colors group-hover:border-blue-500/30 text-[10px] font-medium">
                    {b.encodedBy.name}
                  </td>
                  {isAdmin && (
                    <td className="border-b border-slate-800 px-3 py-1 text-center transition-colors group-hover:border-blue-500/30">
                      <form action={revertBalanceAdjustmentAction.bind(null, b.id, memberId)}>
                        <ConfirmSubmitButton
                          confirmMessage={`Revert this balance adjustment of ${b.amount.toFixed(2)}? This will recalculate the member's current balance.`}
                          className="text-[10px] font-bold text-red-500 hover:text-red-400 hover:underline px-2 py-1 rounded transition-colors uppercase tracking-tight"
                        >
                          Revert
                        </ConfirmSubmitButton>
                      </form>
                    </td>
                  )}
                </tr>
              ))}
              {balanceUpdates.length === 0 ? (
                <tr>
                  <td className="py-12 text-center text-slate-500 italic border-b border-slate-800" colSpan={isAdmin ? 7 : 6}>
                    No balance updates yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 shadow-sm">
        <div className="flex items-center justify-between gap-3 p-4 bg-slate-900/20">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wider">Savings Accrual History</h2>
            <div className="mt-1 text-[10px] font-medium uppercase tracking-tighter text-slate-500">
              {totalAccrualCount} entry{totalAccrualCount === 1 ? "" : "ies"} · page {safePage} of{" "}
              {totalPages}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Link
              href={prevHref ?? "#"}
              className={`rounded border px-3 py-1 text-[10px] font-bold uppercase transition-colors ${prevHref
                ? "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                : "cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                }`}
            >
              Prev
            </Link>
            <Link
              href={nextHref ?? "#"}
              className={`rounded border px-3 py-1 text-[10px] font-bold uppercase transition-colors ${nextHref
                ? "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                : "cursor-not-allowed border-slate-800 bg-slate-950 text-slate-600"
                }`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className="overflow-x-auto bg-slate-950 border-t border-slate-800">
          <table className="min-w-full table-fixed border-separate border-spacing-0 text-left text-xs">
            <thead className="sticky top-0 z-10 bg-slate-900 shadow-sm">
              <tr className="text-[10px] uppercase tracking-widest text-slate-400">
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold">Date</th>
                <th className="border-b border-r border-slate-800 px-3 py-2 font-semibold text-right">Amount</th>
                <th className="border-b border-slate-800 px-3 py-2 font-semibold text-right">Recorded At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {accruals.map((a) => (
                <tr key={a.id} className="group hover:bg-blue-500/5 odd:bg-slate-950 even:bg-slate-900/30">
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 font-mono text-slate-300 transition-colors group-hover:border-blue-500/30">
                    {a.accruedForDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="border-b border-r border-slate-800 px-3 py-1.5 text-right font-mono font-medium text-emerald-400 transition-colors group-hover:border-blue-500/30">
                    {a.amount.toFixed(2)}
                  </td>
                  <td className="border-b border-slate-800 px-3 py-1.5 text-right font-mono text-slate-500 transition-colors group-hover:border-blue-500/30 text-[10px]">
                    {formatDateTimeManila(a.createdAt)}
                  </td>
                </tr>
              ))}
              {accruals.length === 0 ? (
                <tr>
                  <td className="py-12 text-center text-slate-500 italic border-b border-slate-800" colSpan={3}>
                    No accrual entries yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

