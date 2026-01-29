import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

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
    await prisma.$transaction(async (tx) => {
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
  } catch {
    redirect(`/app/members/${memberId}?balanceUpdated=0`);
  }

  redirect(`/app/members/${memberId}?balanceUpdated=1`);
}

async function updateSavingsAction(memberId: string, formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  const parsed = SavingsUpdateSchema.safeParse({
    type: String(formData.get("type") || ""),
    amount: Number(formData.get("amount")),
  });

  if (!parsed.success) redirect(`/app/members/${memberId}?savingsUpdated=0`);

  const amount = new Prisma.Decimal(parsed.data.amount.toFixed(2));
  const type = parsed.data.type;

  try {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
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
            amount,
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
  } catch {
    redirect(`/app/members/${memberId}?savingsUpdated=0`);
  }

  redirect(`/app/members/${memberId}?savingsUpdated=1`);
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
  }>;
}) {
  const currentUser = await requireUser();
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
  const canUpdateSavings = currentUser.role === Role.SUPER_ADMIN;

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
              {member.firstName} {member.lastName}
            </h1>
            <p className="mt-1 text-sm text-slate-400">
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
          <div className="flex items-center gap-2">
            <a
              href={`/api/members/${memberId}/export`}
              className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900/60"
            >
              Export Data
            </a>
          </div>
        </div>

        {sp.balanceUpdated === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Balance updated.
          </div>
        ) : sp.balanceUpdated === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not update balance (check inputs / insufficient balance for deduction).
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
                <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Save Balance Update
                </button>
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
                  defaultValue="WITHDRAW"
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
                <button className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Save Savings Update
                </button>
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

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Savings Updates</h2>
            <div className="mt-1 text-sm text-slate-400">
              {totalSavingsUpdates} entry{totalSavingsUpdates === 1 ? "" : "ies"} · page{" "}
              {safeSavingsPage} of {totalSavingsPages}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={prevSavingsHref ?? "#"}
              aria-disabled={!prevSavingsHref}
              className={`rounded-lg border px-3 py-2 text-sm ${
                prevSavingsHref
                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
                  : "cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600"
              }`}
            >
              Prev
            </Link>
            <Link
              href={nextSavingsHref ?? "#"}
              aria-disabled={!nextSavingsHref}
              className={`rounded-lg border px-3 py-2 text-sm ${
                nextSavingsHref
                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
                  : "cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600"
              }`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Before</th>
                <th className="py-2 pr-4">After</th>
                <th className="py-2 pr-4">Encoded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {savingsUpdates.map((s) => (
                <tr key={s.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 text-slate-300">
                    {s.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{s.type}</td>
                  <td className="py-2 pr-4 text-slate-300">{s.amount.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">{s.savingsBefore.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">{s.savingsAfter.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">
                    {s.encodedBy.name} ({s.encodedBy.role})
                  </td>
                </tr>
              ))}
              {savingsUpdates.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    No savings updates yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Balance Updates</h2>
            <div className="mt-1 text-sm text-slate-400">
              {totalBalanceUpdates} entry{totalBalanceUpdates === 1 ? "" : "ies"} · page{" "}
              {safeBalancePage} of {totalBalancePages}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={prevBalanceHref ?? "#"}
              aria-disabled={!prevBalanceHref}
              className={`rounded-lg border px-3 py-2 text-sm ${
                prevBalanceHref
                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
                  : "cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600"
              }`}
            >
              Prev
            </Link>
            <Link
              href={nextBalanceHref ?? "#"}
              aria-disabled={!nextBalanceHref}
              className={`rounded-lg border px-3 py-2 text-sm ${
                nextBalanceHref
                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
                  : "cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600"
              }`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Before</th>
                <th className="py-2 pr-4">After</th>
                <th className="py-2 pr-4">Encoded by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {balanceUpdates.map((b) => (
                <tr key={b.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 text-slate-300">
                    {b.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{b.type}</td>
                  <td className="py-2 pr-4 text-slate-300">{b.amount.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">{b.balanceBefore.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">{b.balanceAfter.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">
                    {b.encodedBy.name} ({b.encodedBy.role})
                  </td>
                </tr>
              ))}
              {balanceUpdates.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    No balance updates yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Savings Accrual History</h2>
            <div className="mt-1 text-sm text-slate-400">
              {totalAccrualCount} entry{totalAccrualCount === 1 ? "" : "ies"} · page {safePage} of{" "}
              {totalPages}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={prevHref ?? "#"}
              aria-disabled={!prevHref}
              className={`rounded-lg border px-3 py-2 text-sm ${
                prevHref
                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
                  : "cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600"
              }`}
            >
              Prev
            </Link>
            <Link
              href={nextHref ?? "#"}
              aria-disabled={!nextHref}
              className={`rounded-lg border px-3 py-2 text-sm ${
                nextHref
                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
                  : "cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600"
              }`}
            >
              Next
            </Link>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2 pr-4">Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {accruals.map((a) => (
                <tr key={a.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 text-slate-300">
                    {a.accruedForDate.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{a.amount.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">
                    {a.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                </tr>
              ))}
              {accruals.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={3}>
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

