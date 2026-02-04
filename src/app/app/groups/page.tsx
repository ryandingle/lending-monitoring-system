import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { SubmitButton } from "../_components/submit-button";
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

const CreateGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  collectionOfficerId: z.string().uuid().optional().nullable(),
});

async function createGroupAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const rawCo = String(formData.get("collectionOfficerId") || "").trim();
  const parsed = CreateGroupSchema.safeParse({
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim() || undefined,
    collectionOfficerId: rawCo === "" ? undefined : rawCo,
  });
  if (!parsed.success) redirect("/app/groups?created=0");

  try {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: parsed.data!.name,
          description: parsed.data!.description,
          collectionOfficerId: parsed.data!.collectionOfficerId ?? null,
          createdById: user.id,
        },
      });
      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "GROUP_CREATE",
        entityType: "Group",
        entityId: group.id,
        metadata: {
          name: group.name,
          description: group.description ?? null,
          collectionOfficerId: group.collectionOfficerId ?? null,
        },
        request,
      });
    });
  } catch {
    redirect("/app/groups?created=0");
  }

  redirect("/app/groups?created=1");
}

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{
    created?: string;
    deleted?: string;
    q?: string;
    page?: string;
    pageSize?: string;
  }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const sp = await searchParams;
  const canCreateGroup = user.role === Role.SUPER_ADMIN || user.role === Role.ENCODER;
  const canDeleteGroup = user.role === Role.SUPER_ADMIN;

  const q = (sp.q ?? "").trim();
  const page = clampInt(Number(sp.page ?? "1") || 1, 1, 10_000);
  const pageSize = clampInt(Number(sp.pageSize ?? "20") || 20, 5, 100);

  const where: any = {};
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }

  async function deleteGroupAction(groupId: string) {
    "use server";

    const actor = await requireUser();
    requireRole(actor, [Role.SUPER_ADMIN]);

    try {
      const request = await tryGetAuditRequestContext();
      await prisma.$transaction(async (tx) => {
        const group = await tx.group.findUnique({
          where: { id: groupId },
          include: { _count: { select: { members: true } } },
        });
        if (!group) return;

        await tx.group.delete({ where: { id: groupId } });

        await createAuditLog(tx, {
          actorUserId: actor.id,
          action: "GROUP_DELETE",
          entityType: "Group",
          entityId: groupId,
          metadata: {
            name: group.name,
            description: group.description ?? null,
            membersCount: group._count.members,
            membersBehavior: "SET_NULL",
          },
          request,
        });
      });
    } catch {
      redirect("/app/groups?deleted=0");
    }

    redirect("/app/groups?deleted=1");
  }

  const collectionOfficers = await prisma.employee.findMany({
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    select: { id: true, firstName: true, lastName: true },
  });

  const [totalCount, groups] = await Promise.all([
    prisma.group.count({ where }),
    prisma.group.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { members: true } },
        collectionOfficer: { select: { id: true, firstName: true, lastName: true } },
      },
      take: pageSize,
      skip: (page - 1) * pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const safePage = Math.min(page, totalPages);
  const baseParams = { q: q || undefined, pageSize: String(pageSize) };
  const prevHref =
    safePage > 1 ? buildHref("/app/groups", { ...baseParams, page: String(safePage - 1) }) : undefined;
  const nextHref =
    safePage < totalPages ? buildHref("/app/groups", { ...baseParams, page: String(safePage + 1) }) : undefined;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Groups</h1>
            <p className="mt-1 text-sm text-slate-400">
              Create and manage lending groups.
            </p>
          </div>
        </div>

        {canCreateGroup ? (
          <form action={createGroupAction} className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="text-sm font-medium">Group Name</label>
              <input
                name="name"
                required
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Description</label>
              <input
                name="description"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="md:col-span-3">
              <label className="text-sm font-medium">Assigned Officer (optional)</label>
              <select
                name="collectionOfficerId"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">None</option>
                {collectionOfficers.map((co) => (
                  <option key={co.id} value={co.id}>
                    {co.firstName} {co.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <SubmitButton loadingText="Creating Group...">
                Add Group
              </SubmitButton>
            </div>
          </form>
        ) : (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
            You do not have permission to create groups.
          </div>
        )}

        <form method="get" className="mt-6 grid gap-3 md:grid-cols-6">
          <div className="md:col-span-4">
            <label className="text-sm font-medium">Search</label>
            <input
              name="q"
              defaultValue={q}
              placeholder="Group name or description…"
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="md:col-span-2">
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
            <SubmitButton variant="secondary" loadingText="Applying...">
              Apply filters
            </SubmitButton>
          </div>
        </form>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            {totalCount} result{totalCount === 1 ? "" : "s"} · page {safePage} of {totalPages}
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
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Description</th>
                <th className="py-2 pr-4">Collection Officer</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Members</th>
                <th className="py-2 pr-0 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {groups.map((g) => (
                <tr key={g.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium">
                    <Link href={`/app/groups/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{g.description ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-300">
                    {g.collectionOfficer
                      ? `${g.collectionOfficer.firstName} ${g.collectionOfficer.lastName}`
                      : "—"}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {g.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{g._count.members}</td>
                  <td className="py-2 pr-0">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={`/app/groups/${g.id}`}
                        title="View group details"
                        className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 hover:bg-slate-900/60"
                      >
                        <IconEye className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/app/groups/${g.id}/edit`}
                        title="Edit group"
                        className="rounded-lg border border-slate-800 bg-slate-950 p-2 text-slate-200 hover:bg-slate-900/60"
                      >
                        <IconPencil className="h-4 w-4" />
                      </Link>
                      {canDeleteGroup ? (
                        <form action={deleteGroupAction.bind(null, g.id)}>
                          <ConfirmSubmitButton
                            title="Delete group"
                            confirmMessage={`Delete group "${g.name}"? Members in this group will NOT be deleted; they will become unassigned.`}
                            className="rounded-lg border border-red-900/50 bg-red-950/30 p-2 text-red-200 hover:bg-red-950/50"
                          >
                            <IconTrash className="h-4 w-4" />
                          </ConfirmSubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {groups.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    No groups yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div >
  );
}

