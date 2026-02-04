import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { SubmitButton } from "../../../_components/submit-button";

const UpdateMemberSchema = z.object({
  groupId: z.string().uuid().optional(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  age: z.coerce.number().int().min(0).max(150).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
});

async function updateMemberAction(memberId: string, formData: FormData) {
  "use server";

  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const groupIdRaw = String(formData.get("groupId") || "").trim();
  const parsed = UpdateMemberSchema.safeParse({
    groupId: groupIdRaw.length > 0 ? groupIdRaw : undefined,
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
    age: formData.get("age") ? Number(formData.get("age")) : undefined,
    address: String(formData.get("address") || "").trim() || undefined,
    phoneNumber: String(formData.get("phoneNumber") || "").trim() || undefined,
  });

  if (!parsed.success) redirect(`/app/members/${memberId}/edit?saved=0`);

  try {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const before = await tx.member.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          groupId: true,
          firstName: true,
          lastName: true,
          age: true,
          address: true,
          phoneNumber: true,
        },
      });
      if (!before) throw new Error("Member not found");

      const after = await tx.member.update({
        where: { id: memberId },
        data: {
          groupId: parsed.data.groupId ?? null,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
          age: parsed.data.age,
          address: parsed.data.address,
          phoneNumber: parsed.data.phoneNumber,
        },
        select: {
          id: true,
          groupId: true,
          firstName: true,
          lastName: true,
          age: true,
          address: true,
          phoneNumber: true,
        },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "MEMBER_UPDATE",
        entityType: "Member",
        entityId: memberId,
        metadata: {
          before,
          after,
        },
        request,
      });
    });
  } catch {
    redirect(`/app/members/${memberId}/edit?saved=0`);
  }

  redirect(`/app/members/${memberId}`);
}

export default async function EditMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ memberId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const { memberId } = await params;
  const sp = await searchParams;

  const [member, groups] = await Promise.all([
    prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        groupId: true,
        firstName: true,
        lastName: true,
        age: true,
        address: true,
        phoneNumber: true,
      },
    }),
    prisma.group.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href={`/app/members/${memberId}`} className="text-sm text-slate-400 hover:underline">
              ← Back to Member
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">Edit Member</h1>
            <p className="mt-1 text-sm text-slate-400">Update member profile information.</p>
          </div>
        </div>


        <form
          action={updateMemberAction.bind(null, memberId)}
          className="mt-6 grid gap-3 md:grid-cols-4"
        >
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Group</label>
            <select
              name="groupId"
              defaultValue={member.groupId ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">No group</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Firstname</label>
            <input
              name="firstName"
              defaultValue={member.firstName}
              required
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Lastname</label>
            <input
              name="lastName"
              defaultValue={member.lastName}
              required
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Age (optional)</label>
            <input
              name="age"
              type="number"
              defaultValue={member.age ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div>
            <label className="text-sm font-medium">Phone (optional)</label>
            <input
              name="phoneNumber"
              defaultValue={member.phoneNumber ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Address (optional)</label>
            <input
              name="address"
              defaultValue={member.address ?? ""}
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="md:col-span-4 mt-2 flex flex-wrap items-center gap-2">
            <SubmitButton loadingText="Saving...">
              Save changes
            </SubmitButton>
            <Link
              href={`/app/members/${memberId}`}
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

