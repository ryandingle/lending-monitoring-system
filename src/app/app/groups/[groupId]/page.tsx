import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import Link from "next/link";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const CreateMemberSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  age: z.coerce.number().int().min(0).max(150).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
  balance: z.coerce.number(),
});

async function createMemberAction(groupId: string, formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const parsed = CreateMemberSchema.safeParse({
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
    age: formData.get("age") ? Number(formData.get("age")) : undefined,
    address: String(formData.get("address") || "").trim() || undefined,
    phoneNumber: String(formData.get("phoneNumber") || "").trim() || undefined,
    balance: Number(formData.get("balance")),
  });
  if (!parsed.success) redirect(`/app/groups/${groupId}?created=0`);

  const today = new Date();

  const request = await tryGetAuditRequestContext();
  await prisma.$transaction(async (tx) => {
    const member = await tx.member.create({
      data: {
        groupId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        age: parsed.data.age,
        address: parsed.data.address,
        phoneNumber: parsed.data.phoneNumber,
        balance: new Prisma.Decimal(parsed.data.balance.toFixed(2)),
        savings: new Prisma.Decimal("0.00"),
        // ensure accrual starts "next day"
        savingsLastAccruedAt: today,
      },
    });

    await createAuditLog(tx, {
      actorUserId: user.id,
      action: "MEMBER_CREATE",
      entityType: "Member",
      entityId: member.id,
      metadata: {
        groupId,
        firstName: member.firstName,
        lastName: member.lastName,
        balance: member.balance.toFixed(2),
        phoneNumber: member.phoneNumber ?? null,
      },
      request,
    });
  });

  redirect(`/app/groups/${groupId}?created=1`);
}

export default async function GroupDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);
  const { groupId } = await params;
  const sp = await searchParams;

  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      collectionOfficer: { select: { id: true, firstName: true, lastName: true } },
      members: {
        orderBy: { lastName: "asc" },
      },
    },
  });

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

  const canAddMember = user.role === Role.SUPER_ADMIN || user.role === Role.ENCODER;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/app/groups" className="text-sm text-slate-400 hover:underline">
              ← Back to Groups
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">{group.name}</h1>
            <p className="mt-1 text-sm text-slate-400">{group.description ?? "-"}</p>
            {group.collectionOfficer ? (
              <p className="mt-1 text-sm text-slate-400">
                Collection officer: {group.collectionOfficer.firstName}{" "}
                {group.collectionOfficer.lastName}
              </p>
            ) : null}
          </div>
          <div>
            <Link
              href={`/app/members?groupId=${group.id}`}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200 hover:bg-slate-900/60"
            >
              View in Members page
            </Link>
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
        ) : null}

        {canAddMember ? (
          <form
            action={createMemberAction.bind(null, groupId)}
            className="mt-6 grid gap-3 md:grid-cols-4"
          >
            <div>
              <label className="text-sm font-medium">Firstname</label>
              <input
                name="firstName"
                required
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Lastname</label>
              <input
                name="lastName"
                required
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Age (optional)</label>
              <input
                name="age"
                type="number"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Phone (optional)</label>
              <input
                name="phoneNumber"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-medium">Address (optional)</label>
              <input
                name="address"
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Balance</label>
              <input
                name="balance"
                type="number"
                step="0.01"
                required
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Savings</label>
              <input
                type="number"
                step="0.01"
                value="0.00"
                readOnly
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-400 outline-none"
              />
            </div>
            <div className="md:col-span-4">
              <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                Add Member
              </button>
            </div>
          </form>
        ) : (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-300">
            You don’t have permission to add members.
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-100">Members</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Age</th>
                <th className="py-2 pr-4">Phone</th>
                <th className="py-2 pr-4">Balance</th>
                <th className="py-2 pr-4">Savings</th>
                <th className="py-2 pr-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {group.members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium">
                    <Link href={`/app/members/${m.id}`} className="hover:underline">
                      {m.lastName}, {m.firstName}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-slate-300">{m.age ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-300">{m.phoneNumber ?? "-"}</td>
                  <td className="py-2 pr-4 text-slate-300">{m.balance.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-300">{m.savings.toFixed(2)}</td>
                  <td className="py-2 pr-4 text-slate-400">
                    {m.createdAt.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
              {group.members.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    No members yet.
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

