import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import Link from "next/link";
import { AuditPageSizeSelect } from "./audit-pagination";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function PaginationBar({
  total,
  page,
  totalPages,
  prevHref,
  nextHref,
  className = "",
}: {
  total: number;
  page: number;
  totalPages: number;
  prevHref?: string;
  nextHref?: string;
  className?: string;
}) {
  const buttonClass = (enabled: boolean) =>
    `rounded-lg border px-3 py-2 text-sm ${
      enabled
        ? "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        : "cursor-not-allowed border-slate-200 bg-slate-50 text-slate-400"
    }`;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 ${className}`}>
      <div className="text-sm text-slate-600">
        Page <span className="font-semibold text-slate-900">{page}</span> of {totalPages} ·{" "}
        {total.toLocaleString()} log(s)
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={prevHref ?? "#"}
          aria-disabled={!prevHref}
          className={buttonClass(Boolean(prevHref))}
        >
          Prev
        </Link>
        <Link
          href={nextHref ?? "#"}
          aria-disabled={!nextHref}
          className={buttonClass(Boolean(nextHref))}
        >
          Next
        </Link>
      </div>
    </div>
  );
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

  // Member names live on the linked member record (not on the log row), so each
  // term is also resolved against member names and matched via the log's entityId.
  const nameMatches =
    terms.length > 0
      ? await prisma.member.findMany({
        where: {
          OR: terms.flatMap((t) => [
            { firstName: { contains: t, mode: "insensitive" as const } },
            { lastName: { contains: t, mode: "insensitive" as const } },
          ]),
        },
        select: { id: true, firstName: true, lastName: true },
      })
      : [];

  const memberIdsByTerm = terms.map((t) =>
    nameMatches
      .filter((m) =>
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(t.toLowerCase())
      )
      .map((m) => m.id)
  );

  const where =
    terms.length > 0
      ? {
        AND: terms.map((t, index) => ({
          OR: [
            { action: { contains: t, mode: "insensitive" as const } },
            { entityType: { contains: t, mode: "insensitive" as const } },
            { entityId: { contains: t, mode: "insensitive" as const } },
            { entityValue: { contains: t, mode: "insensitive" as const } },
            { entityId: { in: memberIdsByTerm[index] } },
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Audit Trail</h1>
            <p className="mt-1 text-sm text-slate-500">
              Records every mutating action performed by logged-in users.
            </p>
          </div>
          <form action="/app/audit" method="get" className="flex items-center gap-2">
            <input type="hidden" name="pageSize" value={String(pageSize)} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search action, user, entity, or value…"
              className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Search
            </button>
            <AuditPageSizeSelect pageSize={pageSize} q={q} />
          </form>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <PaginationBar
          total={total}
          page={safePage}
          totalPages={totalPages}
          prevHref={prevHref}
          nextHref={nextHref}
        />

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-500 bg-slate-50">
              <tr>
                <th className="py-2 pr-4 pl-2">Time</th>
                <th className="py-2 pr-4">Actor</th>
                <th className="py-2 pr-4">Action</th>
                <th className="py-2 pr-4">Entity</th>
                <th className="py-2 pr-4">IP</th>
                <th className="py-2 pr-4">UA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-50 align-top">
                  <td className="py-2 pr-4 pl-2 text-slate-600">
                    {new Date(l.createdAt).toLocaleString("sv-SE", {
                      timeZone: "Asia/Manila",
                    })}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">
                    {l.actorType === "SYSTEM" ? (
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">
                        SYSTEM
                      </span>
                    ) : l.actorUser ? (
                      <div>
                        <div className="font-medium text-slate-900">{l.actorUser.name}</div>
                        <div className="text-xs text-slate-500">
                          {l.actorUser.email} ({l.actorUser.role})
                        </div>
                      </div>
                    ) : (
                      <span className="text-slate-400">Unknown</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-medium text-slate-900">{l.action}</td>
                  <td className="py-2 pr-4 text-slate-600">
                    {l.entityType ? (
                      <div>
                        <div className="font-medium text-slate-900">{l.entityType}</div>
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
                              <div className="text-xs text-slate-500">
                                {name ? (
                                  exists ? (
                                    <Link
                                      href={`/app/members/${l.entityId}`}
                                      className="text-slate-700 hover:underline hover:text-blue-600"
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
                          <div className="text-xs text-slate-500 break-all">
                            {l.entityValue ?? l.entityId ?? "-"}
                          </div>
                        )}
                      </div>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-500">{l.ip ?? "-"}</td>
                  <td className="py-2 pr-4 text-xs text-slate-400 break-all">
                    {l.userAgent ?? "-"}
                  </td>
                </tr>
              ))}
              {logs.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-500 pl-2" colSpan={6}>
                    No audit logs found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <PaginationBar
          total={total}
          page={safePage}
          totalPages={totalPages}
          prevHref={prevHref}
          nextHref={nextHref}
          className="mt-4 border-t border-slate-200 pt-4"
        />
      </div>
    </div>
  );
}
