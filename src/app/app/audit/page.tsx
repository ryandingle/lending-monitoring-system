import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import Link from "next/link";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default async function AuditTrailPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    q?: string;
  }>;
}) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const sp = await searchParams;
  const page = clampInt(Number(sp.page ?? "1") || 1, 1, 100000);
  const pageSize = clampInt(Number(sp.pageSize ?? "25") || 25, 5, 100);
  const q = (sp.q ?? "").trim();

  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);

  const where =
    terms.length > 0
      ? {
        AND: terms.map((t) => ({
          OR: [
            { action: { contains: t, mode: "insensitive" as const } },
            { entityType: { contains: t, mode: "insensitive" as const } },
            { entityId: { contains: t, mode: "insensitive" as const } },
            { actorUser: { is: { email: { contains: t, mode: "insensitive" as const } } } },
            { actorUser: { is: { name: { contains: t, mode: "insensitive" as const } } } },
          ],
        })),
      }
      : {};

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      include: { actorUser: { select: { email: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
  ]);

  const memberIds = [
    ...new Set(
      logs
        .filter((l) => l.entityType === "Member" && l.entityId)
        .map((l) => l.entityId as string)
    ),
  ];
  const members =
    memberIds.length > 0
      ? await prisma.member.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, firstName: true, lastName: true },
      })
      : [];
  const memberNameById = Object.fromEntries(
    members.map((m) => [m.id, `${m.lastName}, ${m.firstName}`])
  );

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const base = `/app/audit?pageSize=${pageSize}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const prevHref = safePage > 1 ? `${base}&page=${safePage - 1}` : undefined;
  const nextHref = safePage < totalPages ? `${base}&page=${safePage + 1}` : undefined;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Audit Trail</h1>
            <p className="mt-1 text-sm text-slate-400">
              Records every mutating action performed by logged-in users.
            </p>
          </div>
          <form action="/app/audit" method="get" className="flex gap-2">
            <input type="hidden" name="pageSize" value={String(pageSize)} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search action/user/entity…"
              className="w-72 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-100">
            {total.toLocaleString()} log(s)
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={prevHref ?? "#"}
              aria-disabled={!prevHref}
              className={`rounded-lg border px-3 py-2 text-sm ${prevHref
                  ? "border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-900/60"
                  : "cursor-not-allowed border-slate-900 bg-slate-950 text-slate-600"
                }`}
            >
              Prev
            </Link>
            <Link
              href={nextHref ?? "#"}
              aria-disabled={!nextHref}
              className={`rounded-lg border px-3 py-2 text-sm ${nextHref
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
                <th className="py-2 pr-4">Time</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2 pr-4">UA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-900/40 align-top">
                  <td className="py-2 pr-4 text-slate-300">
                    {l.createdAt.toISOString().slice(0, 19).replace("T", " ")}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {l.actorType === "SYSTEM" ? (
                      <span className="rounded-full bg-slate-900/60 px-2 py-1 text-xs font-medium text-slate-200">
                        SYSTEM
                      </span>
                    ) : l.actorUser ? (
                      <div>
                        <div className="font-medium text-slate-100">{l.actorUser.name}</div>
                        <div className="text-xs text-slate-400">
                          {l.actorUser.email} ({l.actorUser.role})
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-500">Unknown</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-medium text-slate-100">{l.action}</td>
                  <td className="py-2 pr-4 text-slate-300">
                    {l.entityType ? (
                      <div>
                        <div className="font-medium text-slate-100">{l.entityType}</div>
                        {l.entityType === "Member" && l.entityId ? (
                          (() => {
                            const meta = l.metadata as Record<string, unknown> | null;
                            const nameFromMeta =
                              meta &&
                                typeof meta.firstName === "string" &&
                                typeof meta.lastName === "string"
                                ? `${meta.lastName}, ${meta.firstName}`
                                : null;
                            const name = nameFromMeta ?? memberNameById[l.entityId];
                            const exists = l.entityId in memberNameById;
                            return (
                              <div className="text-xs text-slate-400">
                                {name ? (
                                  exists ? (
                                    <Link
                                      href={`/app/members/${l.entityId}`}
                                      className="text-slate-200 hover:underline"
                                    >
                                      {name}
                                    </Link>
                                  ) : (
                                    <span>{name}</span>
                                  )
                                ) : (
                                  <span className="break-all">{l.entityId}</span>
                                )}
                              </div>
                            );
                          })()
                        ) : (
                          <div className="text-xs text-slate-400 break-all">
                            {l.entityId ?? "-"}
                          </div>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">{l.ip ?? "-"}</td>
                  <td className="py-2 pr-4 text-xs text-slate-500 break-all">
                    {l.userAgent ?? "-"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    No audit logs found.
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

