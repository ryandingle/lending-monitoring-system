import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function startOfUtcMonth(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function addUtcMonths(d: Date, months: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
}

function addUtcDays(d: Date, days: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}

function parseIsoDateOnly(input?: string) {
  if (!input) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input);
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(Date.UTC(yyyy, mm - 1, dd));
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function toIsoDateOnly(d: Date) {
  return d.toISOString().slice(0, 10);
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function calcProratedMonthlyTarget(rangeStart: Date, rangeEndExclusive: Date, monthlyTarget: number) {
  if (!(monthlyTarget > 0)) return 0;
  if (!(rangeEndExclusive.getTime() > rangeStart.getTime())) return 0;

  let cursor = startOfUtcMonth(rangeStart);
  let total = 0;

  while (cursor.getTime() < rangeEndExclusive.getTime()) {
    const monthStart = cursor;
    const monthEnd = addUtcMonths(monthStart, 1);

    const overlapStart =
      rangeStart.getTime() > monthStart.getTime() ? rangeStart : monthStart;
    const overlapEnd =
      rangeEndExclusive.getTime() < monthEnd.getTime() ? rangeEndExclusive : monthEnd;

    const overlapDays = Math.max(
      0,
      Math.round((overlapEnd.getTime() - overlapStart.getTime()) / MS_PER_DAY),
    );
    const monthDays = Math.max(
      1,
      Math.round((monthEnd.getTime() - monthStart.getTime()) / MS_PER_DAY),
    );

    total += monthlyTarget * (overlapDays / monthDays);
    cursor = monthEnd;
  }

  return total;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (user.role === Role.ENCODER) {
    redirect("/app/members");
  }
  const sp = await searchParams;

  const now = new Date();
  const monthStart = startOfUtcMonth(now);
  const nextMonthStart = addUtcMonths(monthStart, 1);
  const todayStart = startOfUtcDay(now);
  const tomorrowStart = addUtcDays(todayStart, 1);

  const fromParam = parseIsoDateOnly(sp.from);
  const toParam = parseIsoDateOnly(sp.to);
  const hasRangeFilter = Boolean(fromParam || toParam);

  const rangeStart = fromParam ?? monthStart;
  const rangeEndExclusive = addUtcDays(toParam ?? todayStart, 1);

  const chartRangeStart = hasRangeFilter ? rangeStart : addUtcMonths(monthStart, -11);
  const chartRangeEndExclusive = hasRangeFilter ? rangeEndExclusive : nextMonthStart;

  const chartDays = Math.max(
    1,
    Math.round((chartRangeEndExclusive.getTime() - chartRangeStart.getTime()) / MS_PER_DAY),
  );
  const chartGranularity: "day" | "month" = chartDays <= 31 ? "day" : "month";

  const chartPoints =
    chartGranularity === "day"
      ? Array.from({ length: chartDays }).map((_, i) => addUtcDays(chartRangeStart, i))
      : (() => {
          const start = startOfUtcMonth(chartRangeStart);
          const end = startOfUtcMonth(addUtcDays(chartRangeEndExclusive, -1));
          const monthsCount =
            (end.getUTCFullYear() - start.getUTCFullYear()) * 12 +
            (end.getUTCMonth() - start.getUTCMonth()) +
            1;
          return Array.from({ length: monthsCount }).map((_, i) => addUtcMonths(start, i));
        })();

  const monthlyTarget = Number(process.env.LMS_MONTHLY_TARGET_PHP ?? "20000");
  const target = Number.isFinite(monthlyTarget) ? monthlyTarget : 20000;
  const targetInRange = hasRangeFilter
    ? calcProratedMonthlyTarget(rangeStart, rangeEndExclusive, target)
    : target;

  const currencyFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });

  const accrualQuery =
    chartGranularity === "day"
      ? prisma.$queryRaw<{ day: Date; total: number }[]>`
          SELECT
            "accruedForDate"::date AS "day",
            COALESCE(SUM("amount"), 0)::float8 AS "total"
          FROM "savings_accruals"
          WHERE "accruedForDate" >= ${toIsoDateOnly(chartRangeStart)}::date
            AND "accruedForDate" < ${toIsoDateOnly(chartRangeEndExclusive)}::date
          GROUP BY 1
          ORDER BY 1 ASC
        `
      : prisma.$queryRaw<{ month: Date; total: number }[]>`
          SELECT
            date_trunc('month', "accruedForDate")::date AS "month",
            COALESCE(SUM("amount"), 0)::float8 AS "total"
          FROM "savings_accruals"
          WHERE "accruedForDate" >= ${toIsoDateOnly(chartRangeStart)}::date
            AND "accruedForDate" < ${toIsoDateOnly(chartRangeEndExclusive)}::date
          GROUP BY 1
          ORDER BY 1 ASC
        `;

  const endDayStart = hasRangeFilter ? startOfUtcDay(toParam ?? todayStart) : todayStart;
  const endDayEndExclusive = addUtcDays(endDayStart, 1);

  const [groupsCount, membersCount, memberAgg, accrualRowsAny, revenueRangeRow, revenueEndDayRow] =
    await Promise.all([
    prisma.group.count(),
    prisma.member.count(),
    prisma.member.aggregate({
      _sum: { balance: true, savings: true },
    }),
    accrualQuery,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM("amount"), 0)::float8 AS "total"
      FROM "balance_adjustments"
      WHERE "type" = 'DEDUCT'
        AND "createdAt" >= ${rangeStart}
        AND "createdAt" < ${rangeEndExclusive}
    `,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COALESCE(SUM("amount"), 0)::float8 AS "total"
      FROM "balance_adjustments"
      WHERE "type" = 'DEDUCT'
        AND "createdAt" >= ${endDayStart}
        AND "createdAt" < ${endDayEndExclusive}
    `,
  ]);

  const totalBalance = memberAgg._sum.balance ?? 0;
  const totalSavings = memberAgg._sum.savings ?? 0;

  const accrualRows = accrualRowsAny as Array<{ total: number } & Record<string, any>>;
  const accrualByKey = new Map<string, number>();
  for (const row of accrualRows ?? []) {
    const keyDate: Date | undefined = (row as any).day ?? (row as any).month;
    if (!keyDate) continue;
    accrualByKey.set(toIsoDateOnly(keyDate), row.total);
  }

  const accrualSeries = chartPoints.map((p) => {
    const key = toIsoDateOnly(p);
    return accrualByKey.get(key) ?? 0;
  });
  const maxAccrual = Math.max(1, ...accrualSeries);

  const revenueRange = revenueRangeRow?.[0]?.total ?? 0;
  const revenueEndDay = revenueEndDayRow?.[0]?.total ?? 0;
  const pct = clamp(targetInRange > 0 ? revenueRange / targetInRange : 0, 0, 1);
  const degrees = Math.round(pct * 360);

  const fromValue = sp.from ?? "";
  const toValue = sp.to ?? "";
  const rangeLabel = hasRangeFilter
    ? `${fromValue || toIsoDateOnly(rangeStart)} → ${toValue || toIsoDateOnly(addUtcDays(rangeEndExclusive, -1))}`
    : "This month";

  const endDayLabel = hasRangeFilter ? "End date" : "Today";

  return (
    <div className="space-y-6">
      {sp.error === "forbidden" ? (
        <div className="rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
          You don’t have permission to perform that action.
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-400">
              Welcome back, {user.name}.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <form action="/app" method="get" className="flex flex-wrap items-end gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  From
                </div>
                <input
                  type="date"
                  name="from"
                  defaultValue={fromValue}
                  className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  To
                </div>
                <input
                  type="date"
                  name="to"
                  defaultValue={toValue}
                  className="mt-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <button
                type="submit"
                className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
              >
                Apply
              </button>
              <Link
                href="/app"
                className="h-10 rounded-lg border border-slate-800 bg-slate-950 px-4 text-sm font-medium leading-10 text-slate-200 hover:bg-slate-900/60"
              >
                Clear
              </Link>
            </form>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Groups
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">
            {groupsCount.toLocaleString()}
          </div>
          <div className="mt-2 text-xs text-slate-400">Total groups created</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Members
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">
            {membersCount.toLocaleString()}
          </div>
          <div className="mt-2 text-xs text-slate-400">Total active members</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Total Balance
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">
            {typeof totalBalance === "number"
              ? totalBalance.toFixed(2)
              : String(totalBalance)}
          </div>
          <div className="mt-2 text-xs text-slate-400">Outstanding balance</div>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-5 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Total Savings
          </div>
          <div className="mt-2 text-2xl font-semibold text-slate-100">
            {typeof totalSavings === "number"
              ? totalSavings.toFixed(2)
              : String(totalSavings)}
          </div>
          <div className="mt-2 text-xs text-slate-400">Stored savings total</div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm xl:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">
                Savings Accruals
              </div>
              <div className="text-xs text-slate-400">
                Total daily savings added (from ledger) · {rangeLabel}
              </div>
            </div>
            <div className="text-xs text-slate-400">
              {chartGranularity === "day" ? "Daily" : "Monthly"}
            </div>
          </div>

          <div
            className="mt-6 grid h-48 items-end gap-2"
            style={{
              gridTemplateColumns: `repeat(${chartPoints.length}, minmax(0, 1fr))`,
            }}
          >
            {accrualSeries.map((v, i) => (
              <div
                key={i}
                className="rounded-lg bg-blue-500/20"
                style={{
                  height: `${Math.max(6, Math.round((v / maxAccrual) * 100))}%`,
                }}
                title={`${new Intl.DateTimeFormat("en-US", {
                  timeZone: "UTC",
                  ...(chartGranularity === "day"
                    ? { month: "short", day: "2-digit", year: "numeric" }
                    : { month: "short", year: "numeric" }),
                }).format(chartPoints[i])}: ${currencyFormatter.format(v)}`}
              />
            ))}
          </div>

          {chartPoints.length <= 16 ? (
            <div
              className="mt-3 grid gap-2 text-center text-[10px] text-slate-500"
              style={{
                gridTemplateColumns: `repeat(${chartPoints.length}, minmax(0, 1fr))`,
              }}
            >
              {chartPoints.map((p, i) => (
                <div key={i}>
                  {new Intl.DateTimeFormat("en-US", {
                    timeZone: "UTC",
                    ...(chartGranularity === "day"
                      ? { month: "short", day: "2-digit" }
                      : { month: "short" }),
                  }).format(p)}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
          <div className="text-sm font-semibold text-slate-100">Monthly Target</div>
          <div className="mt-1 text-xs text-slate-400">
            Collections (balance deductions) · {rangeLabel}
          </div>

          <div className="mt-6 flex items-center justify-center">
            <div className="relative h-44 w-44">
              <div className="absolute inset-0 rounded-full bg-slate-800" />
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    `conic-gradient(#2563eb 0 ${degrees}deg, #e2e8f0 ${degrees}deg 360deg)`,
                }}
              />
              <div className="absolute inset-4 rounded-full bg-slate-950" />
              <div className="absolute inset-0 grid place-items-center">
                <div className="text-center">
                  <div className="text-2xl font-semibold text-slate-100">
                    {(pct * 100).toFixed(2)}%
                  </div>
                  <div className="mt-1 text-xs text-slate-400">This month</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs text-slate-400">Target</div>
              <div className="text-sm font-semibold text-slate-100">
                {currencyFormatter.format(targetInRange)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs text-slate-400">Revenue</div>
              <div className="text-sm font-semibold text-slate-100">
                {currencyFormatter.format(revenueRange)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs text-slate-400">{endDayLabel}</div>
              <div className="text-sm font-semibold text-slate-100">
                {currencyFormatter.format(revenueEndDay)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

