import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { Role } from "@prisma/client";
import { z } from "zod";
import { redirect } from "next/navigation";
import { hashPassword } from "@/lib/auth/password";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  role: z.enum(["SUPER_ADMIN", "ENCODER"]),
  password: z.string().min(6).max(200),
});

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["SUPER_ADMIN", "ENCODER"]),
});

const ToggleActiveSchema = z.object({
  userId: z.string().uuid(),
  isActive: z.enum(["true", "false"]),
});

const ResetPasswordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6).max(200),
});

async function createUserAction(formData: FormData) {
  "use server";

  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const parsed = CreateUserSchema.safeParse({
    email: String(formData.get("email") || "").trim().toLowerCase(),
    name: String(formData.get("name") || "").trim(),
    role: String(formData.get("role") || ""),
    password: String(formData.get("password") || ""),
  });

  if (!parsed.success) redirect("/app/users?created=0");

  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: parsed.data.email,
          name: parsed.data.name,
          role: parsed.data.role,
          passwordHash: await hashPassword(parsed.data.password),
          isActive: true,
        },
        select: { id: true, email: true, name: true, role: true },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "USER_CREATE",
        entityType: "User",
        entityId: created.id,
        metadata: { email: created.email, name: created.name, role: created.role },
        request,
      });
    });
  } catch {
    redirect("/app/users?created=0");
  }

  redirect("/app/users?created=1");
}

async function updateUserRoleAction(formData: FormData) {
  "use server";

  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const parsed = UpdateRoleSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    role: String(formData.get("role") || ""),
  });
  if (!parsed.success) redirect("/app/users?updated=0");

  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: parsed.data.userId },
        data: { role: parsed.data.role },
        select: { id: true, email: true, role: true },
      });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "USER_ROLE_UPDATE",
        entityType: "User",
        entityId: updated.id,
        metadata: { email: updated.email, role: updated.role },
        request,
      });
    });
  } catch {
    redirect("/app/users?updated=0");
  }

  redirect("/app/users?updated=1");
}

async function toggleUserActiveAction(formData: FormData) {
  "use server";

  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const parsed = ToggleActiveSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    isActive: String(formData.get("isActive") || ""),
  });
  if (!parsed.success) redirect("/app/users?updated=0");

  const isActive = parsed.data.isActive === "true";
  if (!isActive && parsed.data.userId === actor.id) {
    // Prevent locking yourself out.
    redirect("/app/users?updated=0");
  }
  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: parsed.data.userId },
        data: { isActive },
        select: { id: true, email: true, isActive: true },
      });

      // If deactivating, sign out all sessions.
      if (!updated.isActive) {
        await tx.authSession.deleteMany({ where: { userId: updated.id } });
      }

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: isActive ? "USER_ACTIVATE" : "USER_DEACTIVATE",
        entityType: "User",
        entityId: updated.id,
        metadata: { email: updated.email, isActive: updated.isActive },
        request,
      });
    });
  } catch {
    redirect("/app/users?updated=0");
  }

  redirect("/app/users?updated=1");
}

async function resetUserPasswordAction(formData: FormData) {
  "use server";

  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const parsed = ResetPasswordSchema.safeParse({
    userId: String(formData.get("userId") || ""),
    password: String(formData.get("password") || ""),
  });
  if (!parsed.success) redirect("/app/users?updated=0");

  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: parsed.data.userId },
        data: { passwordHash: await hashPassword(parsed.data.password) },
        select: { id: true, email: true },
      });

      // Force sign-out so old sessions can't be used.
      await tx.authSession.deleteMany({ where: { userId: updated.id } });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: updated.id,
        metadata: { email: updated.email },
        request,
      });
    });
  } catch {
    redirect("/app/users?updated=0");
  }

  redirect("/app/users?updated=1");
}

export default async function UsersAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; created?: string; updated?: string }>;
}) {
  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const where =
    q.length > 0
      ? {
          OR: [
            { email: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      isActive: true,
      createdAt: true,
    },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Users</h1>
            <p className="mt-1 text-sm text-slate-400">
              Super-admin can create and manage users (admins and encoders).
            </p>
          </div>
          <form action="/app/users" method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name/email…"
              className="w-64 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Search
            </button>
          </form>
        </div>

        {sp.created === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            User created.
          </div>
        ) : sp.created === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not create user (check inputs / unique email).
          </div>
        ) : sp.updated === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            User updated.
          </div>
        ) : sp.updated === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not update user.
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-slate-100">Add User</div>
            <form action={createUserAction} className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-200">Email</label>
                <input
                  name="email"
                  type="email"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-sm font-medium text-slate-200">Name</label>
                <input
                  name="name"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Role</label>
                <select
                  name="role"
                  defaultValue="ENCODER"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                  <option value="ENCODER">ENCODER</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Temp password</label>
                <input
                  name="password"
                  type="password"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div className="md:col-span-2">
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Create user
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-slate-100">Notes</div>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-300">
              <li>Deactivating a user signs them out of all sessions.</li>
              <li>Password resets also force sign-out.</li>
              <li>All actions are recorded in the audit trail.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-100">All Users</h2>
          <div className="text-xs text-slate-400">{users.length} user(s)</div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Email</th>
                <th className="py-2 pr-4">Role</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Created</th>
                <th className="py-2 pr-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium text-slate-100">{u.name}</td>
                  <td className="py-2 pr-4 text-slate-300">{u.email}</td>
                  <td className="py-2 pr-4 text-slate-300">{u.role}</td>
                  <td className="py-2 pr-4 text-slate-300">
                    {u.isActive ? (
                      <span className="rounded-full border border-emerald-900/40 bg-emerald-950/30 px-2 py-1 text-xs font-medium text-emerald-200">
                        ACTIVE
                      </span>
                    ) : (
                      <span className="rounded-full border border-red-900/40 bg-red-950/40 px-2 py-1 text-xs font-medium text-red-200">
                        INACTIVE
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {u.createdAt.toISOString().slice(0, 10)}
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <form action={updateUserRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <select
                          name="role"
                          defaultValue={u.role}
                          className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="SUPER_ADMIN">SUPER_ADMIN</option>
                          <option value="ENCODER">ENCODER</option>
                        </select>
                        <button className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900/60">
                          Set role
                        </button>
                      </form>

                      <form action={toggleUserActiveAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="isActive" value={u.isActive ? "false" : "true"} />
                        <button
                          className={`rounded-lg px-2 py-1 text-xs ${
                            u.isActive
                              ? "border border-red-900/40 bg-red-950/40 text-red-200 hover:bg-red-950/60"
                              : "border border-emerald-900/40 bg-emerald-950/30 text-emerald-200 hover:bg-emerald-950/40"
                          }`}
                        >
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </form>

                      <form action={resetUserPasswordAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <input
                          name="password"
                          type="password"
                          placeholder="New password"
                          className="w-36 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                        />
                        <button className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs text-slate-200 hover:bg-slate-900/60">
                          Reset
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 ? (
                <tr>
                  <td className="py-4 text-slate-400" colSpan={6}>
                    No users found.
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

