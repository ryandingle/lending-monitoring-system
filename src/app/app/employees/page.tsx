import { prisma } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth/session";
import { EmployeePosition, Role } from "@prisma/client";
import { redirect } from "next/navigation";
import { createAuditLog, tryGetAuditRequestContext } from "@/lib/audit";
import { ConfirmSubmitButton } from "../_components/confirm-submit-button";
import { z } from "zod";

const POSITION_LABELS: Record<EmployeePosition, string> = {
  COLLECTION_OFFICER: "Collection officer",
  OFFICE_CLERK: "Office clerk",
  UNIT_MANAGER: "Unit manager",
  OPERATIONS_MANAGER: "Operations manager",
};

const CreateEmployeeSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  position: z.enum([
    "COLLECTION_OFFICER",
    "OFFICE_CLERK",
    "UNIT_MANAGER",
    "OPERATIONS_MANAGER",
  ]),
});

async function createEmployeeAction(formData: FormData) {
  "use server";

  const user = await requireUser();
  requireRole(user, [Role.SUPER_ADMIN]);

  const parsed = CreateEmployeeSchema.safeParse({
    firstName: String(formData.get("firstName") || "").trim(),
    lastName: String(formData.get("lastName") || "").trim(),
    position: String(formData.get("position") || ""),
  });

  if (!parsed.success) redirect("/app/employees?created=0");

  const request = await tryGetAuditRequestContext();

  try {
    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          firstName: parsed.data!.firstName,
          lastName: parsed.data!.lastName,
          position: parsed.data!.position,
        },
      });

      await createAuditLog(tx, {
        actorUserId: user.id,
        action: "EMPLOYEE_CREATE",
        entityType: "Employee",
        entityId: employee.id,
        metadata: {
          firstName: employee.firstName,
          lastName: employee.lastName,
          position: employee.position,
        },
        request,
      });
    });
  } catch {
    redirect("/app/employees?created=0");
  }

  redirect("/app/employees?created=1");
}

async function deleteEmployeeAction(employeeId: string) {
  "use server";

  const actor = await requireUser();
  requireRole(actor, [Role.SUPER_ADMIN]);

  try {
    const request = await tryGetAuditRequestContext();
    await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, firstName: true, lastName: true, position: true },
      });
      if (!employee) return;

      await tx.employee.delete({ where: { id: employeeId } });

      await createAuditLog(tx, {
        actorUserId: actor.id,
        action: "EMPLOYEE_DELETE",
        entityType: "Employee",
        entityId: employee.id,
        metadata: {
          firstName: employee.firstName,
          lastName: employee.lastName,
          position: employee.position,
        },
        request,
      });
    });
  } catch {
    redirect("/app/employees?deleted=0");
  }

  redirect("/app/employees?deleted=1");
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; created?: string; deleted?: string }>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const canManage = user.role === Role.SUPER_ADMIN;

  const where =
    q.length > 0
      ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" as const } },
          { lastName: { contains: q, mode: "insensitive" as const } },
        ],
      }
      : {};

  const employees = await prisma.employee.findMany({
    where,
    include: {
      groupsAsCollectionOfficer: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Employees</h1>
            <p className="mt-1 text-sm text-slate-400">
              List and manage employees (name and position).
            </p>
          </div>
          <form action="/app/employees" method="get" className="flex gap-2">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by name…"
              className="w-64 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            />
            <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Search
            </button>
          </form>
        </div>

        {sp.created === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Employee added.
          </div>
        ) : sp.created === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not add employee (check inputs).
          </div>
        ) : sp.deleted === "1" ? (
          <div className="mt-4 rounded-lg border border-emerald-900/40 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            Employee deleted.
          </div>
        ) : sp.deleted === "0" ? (
          <div className="mt-4 rounded-lg border border-red-900/40 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            Could not delete employee.
          </div>
        ) : null}

        {canManage ? (
          <div className="mt-6 rounded-xl border border-slate-800 bg-slate-950 p-4">
            <div className="text-sm font-semibold text-slate-100">Add Employee</div>
            <form action={createEmployeeAction} className="mt-4 grid gap-3 md:grid-cols-4">
              <div>
                <label className="text-sm font-medium text-slate-200">First Name</label>
                <input
                  name="firstName"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Last Name</label>
                <input
                  name="lastName"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-200">Position</label>
                <select
                  name="position"
                  required
                  defaultValue=""
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="" disabled>
                    Select position…
                  </option>
                  {(Object.entries(POSITION_LABELS) as [EmployeePosition, string][]).map(
                    ([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    )
                  )}
                </select>
              </div>
              <div className="flex items-end">
                <button className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  Add Employee
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Employee List</h2>
          <div className="text-xs text-slate-400">
            {employees.length} result{employees.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs uppercase text-slate-400">
              <tr>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Position</th>
                <th className="py-2 pr-4">Group</th>
                <th className="py-2 pr-4">Created</th>
                {canManage ? (
                  <th className="py-2 pr-0 text-right">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {employees.map((e) => (
                <tr key={e.id} className="hover:bg-slate-900/40">
                  <td className="py-2 pr-4 font-medium text-slate-100">
                    {e.firstName} {e.lastName}
                  </td>
                  <td className="py-2 pr-4 text-slate-300">
                    {POSITION_LABELS[e.position]}
                  </td>
                  <td className="py-2 pr-4">
                    {e.position === "COLLECTION_OFFICER" ? (
                      <div className="flex flex-wrap gap-1">
                        {e.groupsAsCollectionOfficer.length > 0 ? (
                          e.groupsAsCollectionOfficer.map((g) => (
                            <span
                              key={g.id}
                              className="inline-flex items-center rounded-md bg-blue-900/30 px-2 py-0.5 text-[10px] font-medium text-blue-300 ring-1 ring-inset ring-blue-700/50"
                            >
                              {g.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">—</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-400">
                    {e.createdAt.toISOString().slice(0, 10)}
                  </td>
                  {canManage ? (
                    <td className="py-2 pr-0">
                      <div className="flex justify-end">
                        <form action={deleteEmployeeAction.bind(null, e.id)}>
                          <ConfirmSubmitButton
                            confirmMessage={`Delete employee "${e.firstName} ${e.lastName}"?`}
                            className="rounded-lg border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs font-medium text-red-200 hover:bg-red-950/50"
                          >
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
              {employees.length === 0 ? (
                <tr>
                  <td
                    className="py-4 text-slate-400"
                    colSpan={canManage ? 5 : 4}
                  >
                    No employees found.
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
