import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const CreateMemberSchema = z.object({
  groupId: z.string().uuid(),
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  age: z.coerce.number().int().min(0).max(150).optional(),
  address: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
  balance: z.coerce.number(),
});

async function createMemberAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const parsed = CreateMemberSchema.safeParse({
    groupId: String(formData.get("groupId") || ""),
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
    age: formData.get("age") ? Number(formData.get("age")) : undefined,
    address: String(formData.get("address") || "").trim() || undefined,
    phoneNumber: String(formData.get("phoneNumber") || "").trim() || undefined,
    balance: Number(formData.get("balance")),
  });

  if (!parsed.success) redirect("/app/members?created=0");

  const today = new Date();

  try {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const member = await tx.member.create({
        data: {
          groupId: parsed.data.groupId,
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
          groupId: member.groupId,
          firstName: member.firstName,
          lastName: member.lastName,
          balance: member.balance.toFixed(2),
          phoneNumber: member.phoneNumber ?? null,
        },
        request,
      });
    });
  } catch {
    redirect("/app/members?created=0");
  }

  redirect("/app/members?created=1");
}

export default async function NewMemberPage() {
  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN, Role.ENCODER]);

  const groups = await prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/app/members" className="text-sm text-slate-400 hover:underline">
              ← Back to Members
            </Link>
            <h1 className="mt-2 text-xl font-semibold text-slate-100">Add Member</h1>
            <p className="mt-1 text-sm text-slate-400">
              Create a member and assign them to a group.
            </p>
          </div>
        </div>

        <form action={createMemberAction} className="mt-6 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="text-sm font-medium">Group</label>
            <select
              name="groupId"
              required
              className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="" disabled>
                Select a group…
              </option>
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
      </div>
    </div>
  );
}

