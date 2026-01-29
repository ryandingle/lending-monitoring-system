import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { z } from "zod";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const UpdateSchema = z.object({
  name: z.string().min(1).max(100),
  currentPassword: z.string().optional(),
  newPassword: z.string().optional(),
});

async function updateAccountAction(formData: FormData) {
  "use server";

  const user = await requireUser();

  const parsed = UpdateSchema.safeParse({
    name: String(formData.get("name") || "").trim(),
    currentPassword: String(formData.get("currentPassword") || "").trim() || undefined,
    newPassword: String(formData.get("newPassword") || "").trim() || undefined,
  });
  if (!parsed.success) redirect("/app/account?updated=0");

  const { name, currentPassword, newPassword } = parsed.data;

  if ((currentPassword && !newPassword) || (!currentPassword && newPassword)) {
    redirect("/app/account?updated=0");
  }

  if (currentPassword && newPassword) {
    const existing = await prisma.user.findUnique({ where: { id: user.id } });
    if (!existing) redirect("/login");
    const ok = await verifyPassword(currentPassword, existing.passwordHash);
    if (!ok) redirect("/app/account?updated=0");

    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name,
          passwordHash: await hashPassword(newPassword),
        },
      });
      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "ACCOUNT_UPDATE",
        entityType: "User",
        entityId: user.id,
        metadata: { name, passwordChanged: true },
        request,
      });
    });
  } else {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { name },
      });
      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "ACCOUNT_UPDATE",
        entityType: "User",
        entityId: user.id,
        metadata: { name, passwordChanged: false },
        request,
      });
    });
  }

  redirect("/app/account?updated=1");
}

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ updated?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-100">Account</h1>
        <p className="mt-1 text-sm text-slate-400">
          Update your profile and password.
        </p>

        {sp.updated === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Account updated.
          </div>
        ) : sp.updated === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not update account (check inputs/password).
          </div>
        ) : null}

        <form action={updateAccountAction} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">Name</label>
            <input
              name="name"
              defaultValue={user.name}
              required
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Current password</label>
              <input
                name="currentPassword"
                type="password"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">New password</label>
              <input
                name="newPassword"
                type="password"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            Save changes
          </button>
        </form>
      </div>
    </div>
  );
}

