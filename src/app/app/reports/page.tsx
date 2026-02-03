import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import {
  getReportPreset2Weeks,
} from "@/lib/date";
import { Role } from "@prisma/client";
import { DateRangeFilter } from "./date-filter";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
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
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  const [groups, members] = await Promise.all([
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.member.findMany({
      orderBy: { lastName: "asc" },
      select: { id: true, firstName: true, lastName: true },
    }),
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

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-100">Export group data</h2>
        <p className="mt-1 text-sm text-slate-400">
          Download a report for a group (members, balances, savings, adjustments).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-0 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium text-slate-100">
                    <Link href={`/app/groups/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-0 text-right">
                    <a
                      href={`/api/groups/${g.id}/export?${query}`}
                      title="Download group report (Excel)"
                      className="inline-flex rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900/60"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {groups.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={2}>
                    No groups. Create a group first.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-100">Export member data</h2>
        <p className="mt-1 text-sm text-slate-400">
          Download a report for a member (balance history, savings accruals, adjustments).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Member</th>
                <th className="py-2 pr-0 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium text-slate-100">
                    <Link href={`/app/members/${m.id}`} className="hover:underline">
                      {m.lastName}, {m.firstName}
                    </Link>
                  </td>
                  <td className="py-2 pr-0 text-right">
                    <a
                      href={`/api/members/${m.id}/export?${query}`}
                      title="Download member report (Excel)"
                      className="inline-flex rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900/60"
                    >
                      Download
                    </a>
                  </td>
                </tr>
              ))}
              {members.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={2}>
                    No members. Add a member first.
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
