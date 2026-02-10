import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { getReportPreset2Weeks, formatDateTimeManila } from "@/lib/date";
import { DashboardDateFilter } from "./dashboard-date-filter";

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good Morning!";
  if (hour < 18) return "Good Afternoon!";
  return "Good Evening!";
}

const formatDateWithDay = (d: Date) => {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; from?: string; to?: string }>;
}) {
  const user = await requireUser();
  if (user.role === Role.ENCODER) {
    redirect("/app/groups");
  }

  const sp = await searchParams;

  // Dates for filtering
  const defaultPreset = getReportPreset2Weeks();
  const from = (sp.from?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null) ?? defaultPreset.from;
  const to = (sp.to?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null) ?? defaultPreset.to;

  const startDate = new Date(from);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(to);
  endDate.setHours(23, 59, 59, 999);

  // Fetch dashboard data
  const [
    memberCount,
    globalAgg,
    periodCollectionsRow,
    periodSavingsRow,
    periodNewMembers,
    dailyCollections,
    dailyAccruals
  ] = await Promise.all([
    prisma.member.count(),
    prisma.member.aggregate({
      _sum: { balance: true, savings: true },
    }),
    // Total Collections in period (Balance Deductions)
    prisma.$queryRaw<{ total: number }[]>`
            SELECT COALESCE(SUM("amount"), 0)::float8 AS "total"
            FROM "balance_adjustments"
            WHERE "type" = 'DEDUCT'
              AND "createdAt" >= ${startDate}
              AND "createdAt" <= ${endDate}
        `,
    // Total Savings Increases in period (Manual)
    prisma.$queryRaw<{ total: number }[]>`
            SELECT COALESCE(SUM("amount"), 0)::float8 AS "total"
            FROM "savings_adjustments"
            WHERE "type" = 'INCREASE'
              AND "createdAt" >= ${startDate}
              AND "createdAt" <= ${endDate}
        `,
    // New members in period
    prisma.member.count({
      where: {
        createdAt: { gte: startDate, lte: endDate }
      }
    }),
    // Daily collections for bar chart
    prisma.$queryRaw<{ day_key: string; total: number }[]>`
            SELECT 
                TO_CHAR("createdAt", 'MM-DD') AS "day_key",
                COALESCE(SUM("amount"), 0)::float8 AS "total"
            FROM "balance_adjustments"
            WHERE "type" = 'DEDUCT'
              AND "createdAt" >= ${startDate}
              AND "createdAt" <= ${endDate}
            GROUP BY 1
            ORDER BY 1 ASC
        `,
    // Daily accruals for line chart
    prisma.$queryRaw<{ day: string; total: number }[]>`
            SELECT 
                TO_CHAR("createdAt", 'MM-DD') AS "day",
                COALESCE(SUM("amount"), 0)::float8 AS "total"
            FROM "savings_adjustments"
            WHERE "type" = 'INCREASE'
              AND "createdAt" >= ${startDate}
              AND "createdAt" <= ${endDate}
            GROUP BY 1
            ORDER BY 1 ASC
        `
  ]);

  const globalBalance = globalAgg._sum.balance ?? 0;
  const globalSavings = globalAgg._sum.savings ?? 0;
  const periodCollections = periodCollectionsRow?.[0]?.total ?? 0;
  const periodSavingsAdded = periodSavingsRow?.[0]?.total ?? 0;

  // -- Fill Daily Collections (Weekdays in selected period) --
  const collectionsMap = new Map(dailyCollections.map(r => [r.day_key, r.total]));
  const chartDays: { day: string; total: number; fullDate: string }[] = [];
  let d = new Date(startDate);
  
  // Iterate from start to end date
  while (d <= endDate) {
    const dayOfWeek = d.getDay(); // 0=Sun, 6=Sat
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      const dayKey = d.toISOString().slice(5, 10); // MM-DD
      const dayLabel = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
      const fullDate = d.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      chartDays.push({
        day: dayLabel,
        total: collectionsMap.get(dayKey) ?? 0,
        fullDate
      });
    }
    d.setDate(d.getDate() + 1);
  }

  // -- Fill Daily Accruals (All days in period) --
  const accrualsMap = new Map(dailyAccruals.map(r => [r.day, r.total]));
  const accrualChartData: { day: string; total: number; fullDate: string }[] = [];
  const curr = new Date(startDate);
  const end = new Date(endDate);
  // Limit to max 14 days to keep it clean
  let daysToStep = Math.min(14, Math.ceil((end.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24)));
  for (let i = 0; i <= daysToStep; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    if (d > end) break;
    const dayKey = d.toISOString().slice(5, 10); // MM-DD
    const fullDate = d.toLocaleDateString("en-US", { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    accrualChartData.push({
      day: dayKey,
      total: accrualsMap.get(dayKey) ?? 0,
      fullDate
    });
  }

  const currencyFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  });

  const smallCurrencyFormatter = new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
  });

  // Donut chart calculation
  const totalAdjustments = periodCollections + periodSavingsAdded;
  const collectionPct = totalAdjustments > 0 ? (periodCollections / totalAdjustments) * 100 : 0;
  const savingsPct = 100 - collectionPct;

  const maxAccrual = Math.max(1, ...accrualChartData.map(r => r.total));
  const totalPeriodCollections = chartDays.reduce((acc, curr) => acc + curr.total, 0);

  // -- Targets Calculation (Prorated) --
  const msInPeriod = endDate.getTime() - startDate.getTime();
  const daysInPeriod = Math.max(1, msInPeriod / (1000 * 60 * 60 * 24));

  const monthlyTarget = Number(process.env.LMS_MONTHLY_TARGET_PHP ?? "20000");
  const collectionTarget = (monthlyTarget / 30) * daysInPeriod;
  const savingsTarget = (5000 / 30) * daysInPeriod; // Arbitrary 5k target
  const memberTarget = Math.ceil((10 / 30) * daysInPeriod); // Arbitrary 10 target

  const collectionProgress = Math.min(100, Math.max(5, (periodCollections / collectionTarget) * 100));
  const savingsProgress = Math.min(100, Math.max(5, (periodSavingsAdded / savingsTarget) * 100));
  const memberProgress = Math.min(100, Math.max(5, (periodNewMembers / memberTarget) * 100));

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500">
            {formatDateWithDay(new Date())}
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
            {getGreeting()} <span className="text-white/60 font-medium">{user.name}</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <DashboardDateFilter from={from} to={to} />
        </div>
      </div>

      {/* Top Stat Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 p-8 shadow-2xl transition-all hover:bg-slate-900/60">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/5" />
              <circle
                cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2"
                strokeDasharray="100 100"
                strokeDashoffset={100 - collectionProgress}
                strokeLinecap="round"
                className="text-emerald-500 transition-all duration-1000"
                pathLength="100"
              />
            </svg>
          </div>
          <div className="text-sm font-bold uppercase tracking-widest text-slate-500 transition-colors group-hover:text-emerald-500/80">Total Collections</div>
          <div className="mt-4 flex items-baseline gap-2">
            <div className="text-4xl font-black text-white">{currencyFormatter.format(periodCollections)}</div>
          </div>
          <div className="mt-2 text-xs font-medium text-emerald-500/60 uppercase tracking-tight">
            Target: {currencyFormatter.format(collectionTarget)} ({(periodCollections / collectionTarget * 100).toFixed(0)}%)
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 p-8 shadow-2xl transition-all hover:bg-slate-900/60">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/5" />
              <circle
                cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2"
                strokeDasharray="100 100"
                strokeDashoffset={100 - savingsProgress}
                strokeLinecap="round"
                className="text-blue-500 transition-all duration-1000"
                pathLength="100"
              />
            </svg>
          </div>
          <div className="text-sm font-bold uppercase tracking-widest text-slate-500 transition-colors group-hover:text-blue-500/80">Total Savings Added</div>
          <div className="mt-4 flex items-baseline gap-2">
            <div className="text-4xl font-black text-white">{currencyFormatter.format(periodSavingsAdded)}</div>
          </div>
          <div className="mt-2 text-xs font-medium text-blue-500/60 uppercase tracking-tight">
            Goal: {currencyFormatter.format(savingsTarget)} ({(periodSavingsAdded / savingsTarget * 100).toFixed(0)}%)
          </div>
        </div>

        <div className="group relative overflow-hidden rounded-3xl border border-white/5 bg-slate-900/40 p-8 shadow-2xl transition-all hover:bg-slate-900/60">
          <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
            <svg viewBox="0 0 36 36" className="h-20 w-20 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/5" />
              <circle
                cx="18" cy="18" r="16" fill="none" stroke="currentColor" strokeWidth="2"
                strokeDasharray="100 100"
                strokeDashoffset={100 - memberProgress}
                strokeLinecap="round"
                className="text-amber-500 transition-all duration-1000"
                pathLength="100"
              />
            </svg>
          </div>
          <div className="text-sm font-bold uppercase tracking-widest text-slate-500 transition-colors group-hover:text-amber-500/80">New Members</div>
          <div className="mt-4 flex items-baseline gap-2">
            <div className="text-5xl font-black text-white">{periodNewMembers.toString().padStart(2, '0')}</div>
          </div>
          <div className="mt-2 text-xs font-medium text-amber-500/60 uppercase tracking-tight">
            Quota: {memberTarget} ({(periodNewMembers / memberTarget * 100).toFixed(0)}%)
          </div>
        </div>
      </div>

      {/* Middle Section: Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Donut Chart Component */}
        <div className="rounded-3xl border border-white/5 bg-slate-900/40 p-8 shadow-2xl overflow-hidden relative group">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Transaction Mix</h3>
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 bg-slate-950/50 px-2 py-1 rounded">Adjustments only</div>
          </div>

          <div className="flex flex-col md:flex-row items-center justify-around gap-8 py-4">
            <div className="relative h-48 w-48 shrink-0">
              {/* SVG Donut */}
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle
                  cx="50" cy="50" r="40"
                  fill="transparent"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="10"
                />
                <circle
                  cx="50" cy="50" r="40"
                  fill="transparent"
                  stroke="#2563eb"
                  strokeWidth="10"
                  strokeDasharray={`${collectionPct * 2.51} 251.2`}
                  className="transition-all duration-1000 ease-out"
                />
                <circle
                  cx="50" cy="50" r="40"
                  fill="transparent"
                  stroke="#ec4899"
                  strokeWidth="10"
                  strokeDasharray={`${savingsPct * 2.51} 251.2`}
                  strokeDashoffset={`-${collectionPct * 2.51}`}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-black text-white">{memberCount}</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase">Members</span>
              </div>
            </div>

            <div className="space-y-4 w-full max-w-[200px]">
              <div className="flex items-center justify-between group/item">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-blue-500 shadow-lg shadow-blue-500/20"></div>
                  <span className="text-xs font-bold text-slate-400 group-hover/item:text-slate-200 transition-colors uppercase tracking-tight">Collections</span>
                </div>
                <span className="text-xs font-black text-white">{(collectionPct).toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between group/item">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-pink-500 shadow-lg shadow-pink-500/20"></div>
                  <span className="text-xs font-bold text-slate-400 group-hover/item:text-slate-200 transition-colors uppercase tracking-tight">Savings</span>
                </div>
                <span className="text-xs font-black text-white">{(savingsPct).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bar Chart Section */}
        <div className="rounded-3xl border border-white/5 bg-slate-900/40 p-8 shadow-2xl relative group">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-300">Daily Revenue</h3>
            <div className="text-lg font-black text-blue-500">{smallCurrencyFormatter.format(totalPeriodCollections)}</div>
          </div>

          <div className="flex justify-between gap-2 h-48 py-4 px-2">
            {chartDays.map((collect, i) => {
              const maxVal = Math.max(1, ...chartDays.map(c => c.total));
              const height = (collect.total / maxVal) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-3 h-full">
                  <div
                    className="w-full max-w-[24px] rounded-t-xl bg-gradient-to-t from-blue-600 via-blue-400 to-indigo-300 shadow-xl shadow-blue-900/20 transition-all hover:scale-105 hover:brightness-110 relative group/bar"
                    style={{ height: `${Math.max(8, height)}%` }}
                    title={`${collect.fullDate}: ${smallCurrencyFormatter.format(collect.total)}`}
                  >
                    {collect.total > 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center bg-slate-950/90 px-2 py-1 rounded border border-white/10 shadow-xl z-20">
                        <span className="text-[8px] font-medium text-slate-400 whitespace-nowrap">{collect.fullDate}</span>
                        <span className="text-[10px] font-black text-white whitespace-nowrap">{smallCurrencyFormatter.format(collect.total)}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{collect.day}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Global Metrics Section */}
      <div className="rounded-3xl border border-white/5 bg-slate-900/40 p-10 shadow-3xl relative overflow-hidden">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live Global Stats</span>
            </div>
            <h3 className="text-5xl font-black text-white tracking-tighter">
              {smallCurrencyFormatter.format(Number(globalBalance))}
            </h3>
            <p className="mt-2 text-sm font-medium text-slate-500 uppercase tracking-widest">Total Outstanding Portfolio</p>
          </div>

          <div className="grid grid-cols-2 gap-8 items-center border-l border-white/5 pl-12">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total Savings</div>
              <div className="text-3xl font-black text-white">{smallCurrencyFormatter.format(Number(globalSavings))}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Total Members</div>
              <div className="text-3xl font-black text-white">{memberCount}</div>
            </div>
          </div>
        </div>

        {/* Trend Chart (Bar Chart Style) */}
        <div className="mt-12 h-64 w-full relative group">
          <div className="absolute inset-0 flex items-end justify-between gap-2 px-4">
            {accrualChartData.map((acc, i) => {
              const h = (acc.total / maxAccrual) * 100;
              return (
                <div key={i} className="flex-1 flex flex-col items-center justify-end h-full group/trend hover:z-20">
                  <div
                    className="w-full max-w-[24px] rounded-t-xl bg-gradient-to-t from-emerald-600 via-emerald-400 to-teal-300 shadow-xl shadow-emerald-900/20 transition-all hover:scale-105 hover:brightness-110 relative"
                    style={{ height: `${Math.max(5, h)}%` }}
                    title={`${acc.fullDate}: ${smallCurrencyFormatter.format(acc.total)}`}
                  >
                    {acc.total > 0 && (
                      <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center justify-center bg-slate-950/90 px-2 py-1 rounded border border-white/10 shadow-xl z-20">
                        <span className="text-[8px] font-medium text-slate-400 whitespace-nowrap">{acc.fullDate}</span>
                        <span className="text-[10px] font-black text-white whitespace-nowrap">{smallCurrencyFormatter.format(acc.total)}</span>
                      </div>
                    )}
                  </div>
                  <span className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-tighter">{acc.day}</span>
                </div>
              );
            })}
          </div>
          {/* Background Grid */}
          <div className="absolute inset-0 grid grid-rows-4 -z-10 opacity-30 pointer-events-none">
            <div className="border-b border-white/5"></div>
            <div className="border-b border-white/5"></div>
            <div className="border-b border-white/5"></div>
            <div className="border-b border-white/5"></div>
          </div>
        </div>

        <div className="mt-4 flex justify-between text-[10px] font-bold text-slate-600 uppercase tracking-widest px-4 border-t border-white/5 pt-4">
          <span>Savings Growth (Deposits)</span>
          <span>{from} → {to}</span>
        </div>
      </div>
    </div>
  );
}
