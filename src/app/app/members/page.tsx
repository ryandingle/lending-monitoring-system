import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { countBusinessDays } from "@/lib/date";
import { Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { IconEye, IconPencil, IconTrash } from "../_components/icons";

function clampInt(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function buildHref(base: string, params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v && v.length > 0) sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    page?: string;
    pageSize?: string;
    groupId?: string;
    created?: string;
    deleted?: string;
  }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  const q = (sp.q ?? "").trim();
  const page = clampInt(Number(sp.page ?? "1") || 1, 1, 10_000);
  const pageSize = clampInt(Number(sp.pageSize ?? "20") || 20, 5, 100);
  const groupId = (sp.groupId ?? "").trim() || undefined;
  const canAddMember = user.role === Role.SUPER_ADMIN;
  const canManage = user.role === Role.SUPER_ADMIN;

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
          metadata: {
            firstName: member.firstName,
            lastName: member.lastName,
            groupId: member.groupId,
          },
          request,
        });
      });
    } catch {
      redirect("/app/members?deleted=0");
    }

    redirect("/app/members?deleted=1");
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

  const [groups, totalCount, members] = await Promise.all([
    prisma.group.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.member.count({ where }),
    prisma.member.findMany({
      where,
      include: { group: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const today = new Date();

  const baseParams = {
    q: q || undefined,
    pageSize: String(pageSize),
    groupId: groupId || undefined,
  };

  const prevHref =
    safePage > 1
      ? buildHref("/app/members", { ...baseParams, page: String(safePage - 1) })
      : undefined;
  const nextHref =
    safePage < totalPages
      ? buildHref("/app/members", { ...baseParams, page: String(safePage + 1) })
      : undefined;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Members</h1>
            <p className="mt-1 text-sm text-slate-400">
              Search and paginate members across all groups.
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

        {sp.created === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Member added.
          </div>
        ) : sp.created === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not add member (check inputs).
          </div>
        ) : sp.deleted === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Member deleted.
          </div>
        ) : sp.deleted === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not delete member.
          </div>
        ) : null}

        <form method="get" className="mt-6 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-3">
            <label className="text-sm font-medium">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Name, phone, or group…"
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Group</label>
            <select
              name="groupId"
              defaultValue={groupId ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">All groups</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Page size</label>
            <select
              name="pageSize"
              defaultValue={String(pageSize)}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            >
              {["10", "20", "50", "100"].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <input type="hidden" name="page" value="1" />

          <div className="md:col-span-6">
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Apply
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            {totalCount} result{totalCount === 1 ? "" : "s"} · page {safePage} of{" "}
            {totalPages}
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
                <th className="py-2 pr-4">Member</th>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Balance</th>
                <th className="py-2 pr-4">Savings</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Days</th>
                <th className="py-2 pr-0 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium">
                    <Link href={`/app/members/${m.id}`} className="hover:underline">
                      {m.firstName} {m.lastName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {user.role === Role.SUPER_ADMIN ? (
                      m.group ? (
                        <Link href={`/app/groups/${m.group.id}`} className="hover:underline">
                          {m.group.name}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )
                    ) : m.group ? (
                      m.group.name
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{m.balance.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-300">{m.savings.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">
                    {m.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {countBusinessDays(m.createdAt, today)} (excl. weekends)
                  </td>
                  <td className="py-2 pr-0">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/app/members/${m.id}`}
                        title="View member details"
                        className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 hover:bg-slate-900/60"
                      >
                        <IconEye className="h-4 w-4" />
                      </Link>
                      {canManage ? (
                        <>
                          <Link
                            href={`/app/members/${m.id}/edit`}
                            title="Edit member"
                            className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 hover:bg-slate-900/60"
                          >
                            <IconPencil className="h-4 w-4" />
                          </Link>
                          <form action={deleteMemberAction.bind(null, m.id)}>
                            <ConfirmSubmitButton
                              title="Delete member"
                              confirmMessage={`Delete member "${m.firstName} ${m.lastName}"? This will also delete their ledger history.`}
                              className="rounded-lg border border-red-900/50 bg-red-950/30 p-2 text-red-200 hover:bg-red-950/50"
                            >
                              <IconTrash className="h-4 w-4" />
                            </ConfirmSubmitButton>
                          </form>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={7}>
                    No members found.
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

