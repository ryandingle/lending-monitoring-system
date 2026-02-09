import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import {
  getReportPreset2Weeks,
} from "@/lib/date";
import { Role } from "@prisma/client";
import { DateRangeFilter } from "./date-filter";
import { ReportsClient } from "./reports-client";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string;
    to?: string;
  }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const sp = await searchParams;
  const defaultPreset = getReportPreset2Weeks();
  const from =
    (sp.from?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : null) ??
    defaultPreset.from;
  const to =
    (sp.to?.trim() && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : null) ??
    defaultPreset.to;

  const limit = 20;

  const [groups, totalGroups, members, totalMembers] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { 
        id: true, 
        name: true,
        _count: {
          select: { members: true }
        }
      },
      skip: 0,
      take: limit,
    }),
    prisma.group.count(),
    prisma.member.findMany({
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
      skip: 0,
      take: limit,
    }),
    prisma.member.count(),
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Reports</h1>
          <p className="mt-1 text-sm text-slate-400">
            Generate and download report exports (group data, member data).
          </p>
        </div>

        <DateRangeFilter from={from} to={to} />
      </div>

      <ReportsClient
        initialGroups={groups}
        initialTotalGroups={totalGroups}
        initialMembers={members}
        initialTotalMembers={totalMembers}
        from={from}
        to={to}
      />
    </div>
  );
}
