import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { SubmitButton } from "../../../_components/submit-button";

const UpdateGroupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  collectionOfficerId: z.string().uuid().optional().nullable(),
});

async function updateGroupAction(groupId: string, formData: FormData) {
  "use server";

  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN, Role.ENCODER]);

  const rawCo = String(formData.get("collectionOfficerId") || "").trim();
  const parsed = UpdateGroupSchema.safeParse({
    name: String(formData.get("name") || "").trim(),
    description: String(formData.get("description") || "").trim() || undefined,
    collectionOfficerId: rawCo === "" ? null : rawCo,
  });

  if (!parsed.success) redirect(`/app/groups/${groupId}/edit?saved=0`);

  try {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const before = await tx.group.findUnique({
        where: { id: groupId },
        select: { id: true, name: true, description: true, collectionOfficerId: true },
      });
      if (!before) throw new Error("Group not found");

      const after = await tx.group.update({
        where: { id: groupId },
        data: {
          name: parsed.data!.name,
          description: parsed.data!.description,
          collectionOfficerId: parsed.data!.collectionOfficerId ?? null,
        },
        select: { id: true, name: true, description: true, collectionOfficerId: true },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "GROUP_UPDATE",
        entityType: "Group",
        entityId: groupId,
        metadata: { before, after },
        request,
      });
    });
  } catch {
    redirect(`/app/groups/${groupId}/edit?saved=0`);
  }

  redirect(`/app/groups/${groupId}`);
}

export default async function EditGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { groupId } = await params;
  const sp = await searchParams;

  const [collectionOfficers, group] = await Promise.all([
    prisma.employee.findMany({
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true },
    }),
    prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true, description: true, collectionOfficerId: true },
    }),
  ]);

  if (!group) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="text-sm text-slate-300">Group not found.</div>
        <div className="mt-4">
          <Link href="/app/groups" className="text-sm font-medium text-slate-200 hover:underline">
            Back to Groups
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={`/app/groups/${groupId}`} className="text-sm text-slate-400 hover:underline">
              ← Back to Group
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">Edit Group</h1>
            <p className="mt-1 text-sm text-slate-400">Update group details.</p>
          </div>
        </div>


        <form action={updateGroupAction.bind(null, groupId)} className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-1">
            <label className="text-sm font-medium">Group Name</label>
            <input
              name="name"
              defaultValue={group.name}
              required
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Description</label>
            <input
              name="description"
              defaultValue={group.description ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="md:col-span-3">
            <label className="text-sm font-medium">Collection Officer (optional)</label>
            <select
              name="collectionOfficerId"
              defaultValue={group.collectionOfficerId ?? ""}
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

          <div className="md:col-span-3 mt-2 flex flex-wrap items-center gap-2">
            <SubmitButton loadingText="Saving...">
              Save changes
            </SubmitButton>
            <Link
              href={`/app/groups/${groupId}`}
              className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-900/60"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}

